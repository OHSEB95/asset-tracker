import { getDatabase } from '../index'
import type { Transaction, TransactionInput, TransactionListFilter } from '@shared/types'
import { replayHoldingState } from './replay'

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

export function listTransactionsForAccount(filter: TransactionListFilter): Transaction[] {
  const db = getDatabase()
  const conditions = ['account_id = @accountId']
  const params: Record<string, unknown> = { accountId: filter.accountId }
  if (filter.from) {
    conditions.push('date >= @from')
    params.from = filter.from
  }
  if (filter.to) {
    conditions.push('date <= @to')
    params.to = filter.to
  }
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`
    )
    .all(params)
  return rows.map(rowToTransaction)
}

/** BUY/SELL transactions for a holding, up to and including a given date, ordered for replay. */
function getHoldingTransactionsUpTo(holdingId: number, date: string): Transaction[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM transactions
       WHERE holding_id = @holdingId AND type IN ('BUY','SELL') AND date <= @date
       ORDER BY date ASC, id ASC`
    )
    .all({ holdingId, date })
  return rows.map(rowToTransaction)
}

export function createTransaction(input: TransactionInput): Transaction {
  const db = getDatabase()

  if (input.type === 'BUY' || input.type === 'SELL') {
    if (!input.holdingId) {
      throw new Error('매수/매도 거래에는 보유종목을 선택해야 합니다.')
    }
    if (!input.quantity || input.quantity <= 0 || !input.price || input.price <= 0) {
      throw new Error('수량과 단가를 올바르게 입력해주세요.')
    }
  }

  let realizedPnl: number | null = null

  if (input.type === 'SELL') {
    const priorTx = getHoldingTransactionsUpTo(input.holdingId!, input.date)
    const state = replayHoldingState(priorTx)
    if (input.quantity! > state.quantity) {
      throw new Error(
        `보유수량(${state.quantity.toLocaleString()})보다 많은 수량을 매도할 수 없습니다.`
      )
    }
    const avgCostAtDate = state.avgCost ?? 0
    realizedPnl = (input.price! - avgCostAtDate) * input.quantity!
  }

  const isCashType = input.type === 'DEPOSIT' || input.type === 'WITHDRAWAL' || input.type === 'DIVIDEND'
  if (isCashType && (!input.amount || input.amount <= 0)) {
    throw new Error('금액을 올바르게 입력해주세요.')
  }

  const result = db
    .prepare(
      `INSERT INTO transactions
         (account_id, holding_id, type, date, quantity, price, amount, realized_pnl, note)
       VALUES (@accountId, @holdingId, @type, @date, @quantity, @price, @amount, @realizedPnl, @note)`
    )
    .run({
      accountId: input.accountId,
      holdingId: input.holdingId ?? null,
      type: input.type,
      date: input.date,
      quantity: isCashType ? null : (input.quantity ?? null),
      price: isCashType ? null : (input.price ?? null),
      amount: isCashType ? input.amount : null,
      realizedPnl,
      note: input.note ?? null
    })

  const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(result.lastInsertRowid)
  return rowToTransaction(row)
}

export function deleteTransaction(id: number): void {
  const db = getDatabase()
  const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any
  if (!row) return

  if (row.type === 'BUY' && row.holding_id) {
    const laterSell = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM transactions
         WHERE holding_id = @holdingId AND type = 'SELL'
           AND (date > @date OR (date = @date AND id > @id))`
      )
      .get({ holdingId: row.holding_id, date: row.date, id: row.id }) as { cnt: number }

    if (laterSell.cnt > 0) {
      throw new Error('이 매수 이후 매도 거래가 있어 삭제할 수 없습니다. 먼저 관련 매도 거래를 삭제해주세요.')
    }
  }

  db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id)
}
