import { getDatabase } from '../index'
import type { Transaction, TransactionInput, TransactionListFilter } from '@shared/types'
import { replayHoldingState } from './replay'
import { getHoldingAccountTypeCode } from './holdings'

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    holdingId: row.holding_id,
    type: row.type,
    date: row.date,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    realizedPnl: row.realized_pnl,
    note: row.note
  }
}

/** accountId가 있으면 해당 계좌만, 없고 accountTypeCode가 있으면 그 유형의 모든 계좌, 둘 다 없으면 전체 거래를 반환한다. */
export function listTransactions(filter: TransactionListFilter): Transaction[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}
  if (filter.accountId != null) {
    conditions.push('account_id = @accountId')
    params.accountId = filter.accountId
  } else if (filter.accountTypeCode) {
    conditions.push(
      'account_id IN (SELECT id FROM accounts WHERE account_type_code = @accountTypeCode)'
    )
    params.accountTypeCode = filter.accountTypeCode
  }
  if (filter.from) {
    conditions.push('date >= @from')
    params.from = filter.from
  }
  if (filter.to) {
    conditions.push('date <= @to')
    params.to = filter.to
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`)
    .all(params)
  return rows.map(rowToTransaction)
}

/**
 * BUY/SELL/ADJUST transactions for a holding, up to and including a given date, ordered for replay.
 * excludeId가 주어지면 그 거래는 리플레이에서 제외한다 (수정 중인 거래 자기 자신을 빼고 계산할 때 사용).
 */
function getHoldingTransactionsUpTo(holdingId: number, date: string, excludeId?: number): Transaction[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM transactions
       WHERE holding_id = @holdingId AND type IN ('BUY','SELL','ADJUST') AND date <= @date
         AND (@excludeId IS NULL OR id != @excludeId)
       ORDER BY date ASC, id ASC`
    )
    .all({ holdingId, date, excludeId: excludeId ?? null })
  return rows.map(rowToTransaction)
}

interface TransactionRow {
  accountId: number
  holdingId: number | null
  type: TransactionInput['type']
  date: string
  quantity: number | null
  price: number | null
  amount: number | null
  realizedPnl: number | null
  note: string | null
}

/** type별 필수값 검증 + SELL의 realizedPnl 계산. excludeId는 수정 시 자기 자신을 리플레이에서 빼기 위함. */
function computeTransactionRow(input: TransactionInput, excludeId?: number): TransactionRow {
  const isHoldingAdjust = input.type === 'ADJUST' && !!input.holdingId
  const isCashAdjust = input.type === 'ADJUST' && !input.holdingId
  const isSavingsHoldingTx =
    !!input.holdingId &&
    getHoldingAccountTypeCode(input.holdingId) === 'YOUTH_SAVINGS' &&
    (input.type === 'DEPOSIT' ||
      input.type === 'WITHDRAWAL' ||
      input.type === 'ADJUST' ||
      input.type === 'CLOSE')

  if ((input.type === 'BUY' || input.type === 'SELL' || isHoldingAdjust) && !isSavingsHoldingTx) {
    if (!input.holdingId) {
      throw new Error('매수/매도/정리 거래에는 보유종목을 선택해야 합니다.')
    }
    if (!input.quantity || input.quantity <= 0 || !input.price || input.price <= 0) {
      throw new Error('수량과 단가를 올바르게 입력해주세요.')
    }
  }

  let realizedPnl: number | null = null

  if (input.type === 'SELL') {
    const priorTx = getHoldingTransactionsUpTo(input.holdingId!, input.date, excludeId)
    const state = replayHoldingState(priorTx)
    if (input.quantity! > state.quantity) {
      throw new Error(
        `보유수량(${state.quantity.toLocaleString()})보다 많은 수량을 매도할 수 없습니다.`
      )
    }
    const avgCostAtDate = state.avgCost ?? 0
    realizedPnl = (input.price! - avgCostAtDate) * input.quantity!
  }

  const isCashType =
    input.type === 'DEPOSIT' ||
    input.type === 'WITHDRAWAL' ||
    input.type === 'DIVIDEND' ||
    input.type === 'CLOSE' ||
    isCashAdjust ||
    isSavingsHoldingTx
  if (isCashType && (!input.amount || input.amount <= 0)) {
    throw new Error('금액을 올바르게 입력해주세요.')
  }

  return {
    accountId: input.accountId,
    holdingId: isCashAdjust ? null : (input.holdingId ?? null),
    type: input.type,
    date: input.date,
    quantity: isCashType ? null : (input.quantity ?? null),
    price: isCashType ? null : (input.price ?? null),
    amount: isCashType ? input.amount! : null,
    realizedPnl,
    note: input.note ?? null
  }
}

export function createTransaction(input: TransactionInput): Transaction {
  const db = getDatabase()
  const row = computeTransactionRow(input)

  const result = db
    .prepare(
      `INSERT INTO transactions
         (account_id, holding_id, type, date, quantity, price, amount, realized_pnl, note)
       VALUES (@accountId, @holdingId, @type, @date, @quantity, @price, @amount, @realizedPnl, @note)`
    )
    .run(row)

  const created = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(result.lastInsertRowid)
  return rowToTransaction(created)
}

/** BUY/ADJUST(보유종목 반영) 거래 이후 그 종목의 SELL이 있으면 수정을 막는다 (delete와 동일한 정합성 가드). */
function assertNoLaterSell(holdingId: number, date: string, id: number, action: '삭제' | '수정'): void {
  const db = getDatabase()
  const laterSell = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM transactions
       WHERE holding_id = @holdingId AND type = 'SELL'
         AND (date > @date OR (date = @date AND id > @id))`
    )
    .get({ holdingId, date, id }) as { cnt: number }

  if (laterSell.cnt > 0) {
    throw new Error(
      `이 거래 이후 매도 거래가 있어 ${action}할 수 없습니다. 먼저 관련 매도 거래를 삭제해주세요.`
    )
  }
}

export function updateTransaction(id: number, input: TransactionInput): Transaction {
  const db = getDatabase()
  const existing = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any
  if (!existing) {
    throw new Error('거래를 찾을 수 없습니다.')
  }

  if ((existing.type === 'BUY' || existing.type === 'ADJUST') && existing.holding_id) {
    assertNoLaterSell(existing.holding_id, existing.date, existing.id, '수정')
  }

  const row = computeTransactionRow(input, id)

  db.prepare(
    `UPDATE transactions SET
       account_id = @accountId,
       holding_id = @holdingId,
       type = @type,
       date = @date,
       quantity = @quantity,
       price = @price,
       amount = @amount,
       realized_pnl = @realizedPnl,
       note = @note
     WHERE id = @id`
  ).run({ ...row, id })

  const updated = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id)
  return rowToTransaction(updated)
}

export function deleteTransaction(id: number): void {
  const db = getDatabase()
  const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any
  if (!row) return

  if ((row.type === 'BUY' || row.type === 'ADJUST') && row.holding_id) {
    assertNoLaterSell(row.holding_id, row.date, row.id, '삭제')
  }

  db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id)
}
