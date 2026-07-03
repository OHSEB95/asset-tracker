import { getDatabase } from '../index'
import type { Holding, HoldingInput, HoldingSnapshot, PriceSnapshotInput, Transaction } from '@shared/types'
import { replayHoldingState } from './replay'

function rowToHolding(row: any): Holding {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    priceSymbol: row.price_symbol,
    priceSource: row.price_source,
    isArchived: !!row.is_archived
  }
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function listHoldingsForAccount(accountId: number, includeArchived = false): Holding[] {
  const db = getDatabase()
  const sql = includeArchived
    ? `SELECT * FROM holdings WHERE account_id = ? ORDER BY id`
    : `SELECT * FROM holdings WHERE account_id = ? AND is_archived = 0 ORDER BY id`
  const rows = db.prepare(sql).all(accountId)
  return rows.map(rowToHolding)
}

export function getHoldingById(id: number): Holding | null {
  const db = getDatabase()
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(id)
  return row ? rowToHolding(row) : null
}

export function createHolding(input: HoldingInput): Holding {
  const db = getDatabase()
  const result = db
    .prepare(
      `INSERT INTO holdings (account_id, name, price_symbol, price_source)
       VALUES (@accountId, @name, @priceSymbol, @priceSource)`
    )
    .run({
      accountId: input.accountId,
      name: input.name,
      priceSymbol: input.priceSymbol ?? null,
      priceSource: input.priceSource ?? null
    })
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(result.lastInsertRowid)
  return rowToHolding(row)
}

export function updateHolding(id: number, input: HoldingInput): Holding {
  const db = getDatabase()
  db.prepare(
    `UPDATE holdings SET name = @name, price_symbol = @priceSymbol, price_source = @priceSource WHERE id = @id`
  ).run({
    id,
    name: input.name,
    priceSymbol: input.priceSymbol ?? null,
    priceSource: input.priceSource ?? null
  })
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(id)
  return rowToHolding(row)
}

export function archiveHolding(id: number, archived: boolean): void {
  const db = getDatabase()
  db.prepare(`UPDATE holdings SET is_archived = ? WHERE id = ?`).run(archived ? 1 : 0, id)
}

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

function getLatestSnapshot(
  holdingId: number,
  asOfYearMonth: string
): { price: number; yearMonth: string } | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT price, year_month FROM price_snapshots
       WHERE holding_id = ? AND year_month <= ?
       ORDER BY year_month DESC LIMIT 1`
    )
    .get(holdingId, asOfYearMonth) as { price: number; year_month: string } | undefined
  return row ? { price: row.price, yearMonth: row.year_month } : null
}

export function getHoldingSnapshot(holdingId: number): HoldingSnapshot {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE holding_id = ? AND type IN ('BUY','SELL','ADJUST') ORDER BY date ASC, id ASC`
    )
    .all(holdingId)
  const state = replayHoldingState(rows.map(rowToTransaction))

  const snapshot = getLatestSnapshot(holdingId, currentYearMonth())
  const priceForValuation = snapshot?.price ?? state.avgCost

  return {
    holdingId,
    quantity: state.quantity,
    avgCost: state.avgCost,
    lastKnownPrice: snapshot?.price ?? null,
    lastKnownPriceMonth: snapshot?.yearMonth ?? null,
    currentValuation: priceForValuation != null ? state.quantity * priceForValuation : null
  }
}

export function upsertPriceSnapshot(input: PriceSnapshotInput): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO price_snapshots (holding_id, year_month, price, source, updated_at)
     VALUES (@holdingId, @yearMonth, @price, @source, datetime('now'))
     ON CONFLICT(holding_id, year_month) DO UPDATE SET
       price = excluded.price,
       source = excluded.source,
       updated_at = datetime('now')`
  ).run({
    holdingId: input.holdingId,
    yearMonth: input.yearMonth,
    price: input.price,
    source: input.source ?? null
  })
}
