import { getDatabase } from '../index'
import type { Transaction, TransactionInput, TransactionListFilter } from '@shared/types'
import { replayHoldingState } from './replay'
import { getHoldingAccountTypeCode } from './holdings'
import { getAccountById } from './accounts'
import { getHistoricalUsdKrwRate, tryFetchHistoricalUsdKrwRate } from '../../services/priceService'

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
    note: row.note,
    fxRate: row.fx_rate,
    realizedPnlKrw: row.realized_pnl_krw
  }
}

/** 해외주식 계좌 거래면 그 거래 날짜의 실제 환율을 자동 조회해 저장한다(그 외 계좌는 null). */
async function resolveFxRate(accountId: number, date: string): Promise<number | null> {
  const account = getAccountById(accountId)
  if (account?.accountTypeCode !== 'FOREIGN_STOCK') return null
  return getHistoricalUsdKrwRate(date)
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
    .prepare(
      `SELECT * FROM transactions ${where} ORDER BY date DESC, COALESCE(sort_order, id) DESC`
    )
    .all(params)
  return rows.map(rowToTransaction)
}

/**
 * 같은 날짜의 거래끼리 표시 순서를 위/아래로 바꾼다. 계산(평단가/실현손익 등)에는 영향을 주지
 * 않고 목록에 보여지는 순서만 바꾼다 - 계산은 항상 date와 id(입력 순서) 기준으로 고정.
 */
export function moveTransactionOrder(id: number, direction: 'up' | 'down'): void {
  const db = getDatabase()
  const target = db.prepare(`SELECT account_id, date FROM transactions WHERE id = ?`).get(id) as
    | { account_id: number; date: string }
    | undefined
  if (!target) throw new Error('거래를 찾을 수 없습니다.')

  const siblings = db
    .prepare(
      `SELECT id, COALESCE(sort_order, id) AS effective_order FROM transactions
       WHERE account_id = ? AND date = ? ORDER BY effective_order DESC`
    )
    .all(target.account_id, target.date) as Array<{ id: number; effective_order: number }>

  const idx = siblings.findIndex((s) => s.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return

  const current = siblings[idx]
  const swapTarget = siblings[swapIdx]
  const update = db.prepare(`UPDATE transactions SET sort_order = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    update.run(swapTarget.effective_order, current.id)
    update.run(current.effective_order, swapTarget.id)
  })
  tx()
}

/**
 * BUY/SELL/ADJUST transactions for a holding, up to and including a given date, ordered for replay.
 * excludeId가 주어지면 그 거래 자신은 물론, 같은 날짜에 그 거래보다 "나중에"(id가 더 큰) 만들어진
 * 거래도 제외한다 - 그래야 나중에(다른 날 혹은 같은 날 이후) 추가된 거래가 이 거래 "이전 상태"
 * 계산에 잘못 끼어들지 않는다(수정/소급 재계산 시 사용, 신규 생성 시엔 @excludeId가 없어 전부 포함).
 */
function getHoldingTransactionsUpTo(holdingId: number, date: string, excludeId?: number): Transaction[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM transactions
       WHERE holding_id = @holdingId AND type IN ('BUY','SELL','ADJUST')
         AND (date < @date OR (date = @date AND (@excludeId IS NULL OR id < @excludeId)))
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
  realizedPnlKrw: number | null
  note: string | null
}

/**
 * type별 필수값 검증 + SELL의 realizedPnl 계산. excludeId는 수정 시 자기 자신을 리플레이에서 빼기 위함.
 * fxRate는 이 거래(해외주식이면 그 시점 실제 환율, 아니면 null) - SELL의 원화 실현손익 계산에 사용.
 */
function computeTransactionRow(
  input: TransactionInput,
  fxRate: number | null,
  excludeId?: number
): TransactionRow {
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
  let realizedPnlKrw: number | null = null

  if (input.type === 'SELL') {
    const priorTx = getHoldingTransactionsUpTo(input.holdingId!, input.date, excludeId)
    const state = replayHoldingState(priorTx, fxRate ?? 1)
    if (input.quantity! > state.quantity) {
      throw new Error(
        `보유수량(${state.quantity.toLocaleString()})보다 많은 수량을 매도할 수 없습니다.`
      )
    }
    const avgCostAtDate = state.avgCost ?? 0
    realizedPnl = (input.price! - avgCostAtDate) * input.quantity!
    // 실현손익(원화) = (매도가 x 매도 시점 환율) - 매수 시점 환율로 환산한 원가.
    // 오늘 환율을 곱하면 매수-매도 사이 환율이 바뀔 때마다 과거 손익이 계속 재계산되므로 이렇게 계산.
    if (fxRate != null && state.avgCostKrw != null) {
      realizedPnlKrw = (input.price! * fxRate - state.avgCostKrw) * input.quantity!
    }
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
    realizedPnlKrw,
    note: input.note ?? null
  }
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const db = getDatabase()
  const fxRate = await resolveFxRate(input.accountId, input.date)
  const row = computeTransactionRow(input, fxRate)

  const result = db
    .prepare(
      `INSERT INTO transactions
         (account_id, holding_id, type, date, quantity, price, amount, realized_pnl, note, fx_rate, realized_pnl_krw)
       VALUES (@accountId, @holdingId, @type, @date, @quantity, @price, @amount, @realizedPnl, @note, @fxRate, @realizedPnlKrw)`
    )
    .run({ ...row, fxRate })

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

export async function updateTransaction(id: number, input: TransactionInput): Promise<Transaction> {
  const db = getDatabase()
  const existing = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any
  if (!existing) {
    throw new Error('거래를 찾을 수 없습니다.')
  }

  if ((existing.type === 'BUY' || existing.type === 'ADJUST') && existing.holding_id) {
    assertNoLaterSell(existing.holding_id, existing.date, existing.id, '수정')
  }

  const fxRate = await resolveFxRate(input.accountId, input.date)
  const row = computeTransactionRow(input, fxRate, id)

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
       note = @note,
       fx_rate = @fxRate,
       realized_pnl_krw = @realizedPnlKrw
     WHERE id = @id`
  ).run({ ...row, fxRate, id })

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

/**
 * fx_rate 도입 이전에 저장된 해외주식 거래는 fx_rate가 비어있으므로, 앱 시작 시 한 번씩 그
 * 거래 날짜의 실제 과거 환율을 조회해 채워 넣는다. 조회 실패(네트워크 등)한 행은 NULL로 남겨
 * 다음 실행 때 다시 시도한다 - 절대 "현재 환율"로 대체해 채우지 않는다(그러면 원래 버그와 같아짐).
 */
export async function backfillForeignStockFxRates(): Promise<void> {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT t.id, t.date FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.account_type_code = 'FOREIGN_STOCK' AND t.fx_rate IS NULL`
    )
    .all() as Array<{ id: number; date: string }>

  const update = db.prepare(`UPDATE transactions SET fx_rate = ? WHERE id = ?`)
  for (const row of rows) {
    const rate = await tryFetchHistoricalUsdKrwRate(row.date)
    if (rate != null) update.run(rate, row.id)
  }
}

/**
 * fx_rate가 채워진 뒤에 실행해야 함(매수 원가의 환산 원화 원가가 필요하므로) - 해외주식 매도
 * 거래의 원화 실현손익을 매수 시점 환율 기준으로 다시 계산해 채워 넣는다.
 */
export async function backfillForeignStockRealizedPnlKrw(): Promise<void> {
  const db = getDatabase()
  const sells = db
    .prepare(
      `SELECT t.id, t.holding_id, t.date, t.price, t.quantity, t.fx_rate FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.account_type_code = 'FOREIGN_STOCK' AND t.type = 'SELL'
         AND t.realized_pnl_krw IS NULL AND t.fx_rate IS NOT NULL`
    )
    .all() as Array<{
    id: number
    holding_id: number
    date: string
    price: number
    quantity: number
    fx_rate: number
  }>

  const update = db.prepare(`UPDATE transactions SET realized_pnl_krw = ? WHERE id = ?`)
  for (const sell of sells) {
    const priorTx = getHoldingTransactionsUpTo(sell.holding_id, sell.date, sell.id)
    const state = replayHoldingState(priorTx, sell.fx_rate)
    if (state.avgCostKrw == null) continue
    const realizedPnlKrw = (sell.price * sell.fx_rate - state.avgCostKrw) * sell.quantity
    update.run(realizedPnlKrw, sell.id)
  }
}
