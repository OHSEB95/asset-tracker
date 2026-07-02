import type Database from 'better-sqlite3'
import { getDatabase } from './index'
import type {
  Account,
  AccountInput,
  AccountType,
  DashboardFilter,
  MonthlyEntry,
  MonthlyEntryInput,
  MonthlySummaryRow
} from '@shared/types'

function rowToAccountType(row: any): AccountType {
  return {
    code: row.code,
    labelKo: row.label_ko,
    isMarketPriced: !!row.is_market_priced,
    sortOrder: row.sort_order
  }
}

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    accountTypeCode: row.account_type_code,
    name: row.name,
    symbol: row.symbol,
    symbolSource: row.symbol_source,
    isArchived: !!row.is_archived
  }
}

function rowToEntry(row: any): MonthlyEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    yearMonth: row.year_month,
    contribution: row.contribution,
    dividends: row.dividends,
    realizedPnl: row.realized_pnl,
    valuation: row.valuation,
    holdingQuantity: row.holding_quantity,
    priceFetchSource: row.price_fetch_source,
    note: row.note
  }
}

export function listAccountTypes(): AccountType[] {
  const db = getDatabase()
  const rows = db.prepare(`SELECT * FROM account_types ORDER BY sort_order`).all()
  return rows.map(rowToAccountType)
}

export function listAccounts(includeArchived = false): Account[] {
  const db = getDatabase()
  const sql = includeArchived
    ? `SELECT a.* FROM accounts a JOIN account_types t ON a.account_type_code = t.code ORDER BY t.sort_order, a.id`
    : `SELECT a.* FROM accounts a JOIN account_types t ON a.account_type_code = t.code WHERE a.is_archived = 0 ORDER BY t.sort_order, a.id`
  const rows = db.prepare(sql).all()
  return rows.map(rowToAccount)
}

export function createAccount(input: AccountInput): Account {
  const db = getDatabase()
  const result = db
    .prepare(
      `INSERT INTO accounts (account_type_code, name, symbol, symbol_source)
       VALUES (@accountTypeCode, @name, @symbol, @symbolSource)`
    )
    .run({
      accountTypeCode: input.accountTypeCode,
      name: input.name,
      symbol: input.symbol ?? null,
      symbolSource: input.symbolSource ?? null
    })
  const row = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(result.lastInsertRowid)
  return rowToAccount(row)
}

export function updateAccount(id: number, input: AccountInput): Account {
  const db = getDatabase()
  db.prepare(
    `UPDATE accounts SET account_type_code = @accountTypeCode, name = @name,
       symbol = @symbol, symbol_source = @symbolSource WHERE id = @id`
  ).run({
    id,
    accountTypeCode: input.accountTypeCode,
    name: input.name,
    symbol: input.symbol ?? null,
    symbolSource: input.symbolSource ?? null
  })
  const row = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id)
  return rowToAccount(row)
}

export function archiveAccount(id: number, archived: boolean): void {
  const db = getDatabase()
  db.prepare(`UPDATE accounts SET is_archived = ? WHERE id = ?`).run(archived ? 1 : 0, id)
}

export function listEntriesByMonth(yearMonth: string): MonthlyEntry[] {
  const db = getDatabase()
  const rows = db
    .prepare(`SELECT * FROM monthly_entries WHERE year_month = ?`)
    .all(yearMonth)
  return rows.map(rowToEntry)
}

export function upsertEntry(input: MonthlyEntryInput): MonthlyEntry {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO monthly_entries
       (account_id, year_month, contribution, dividends, realized_pnl, valuation,
        holding_quantity, price_fetch_source, note, updated_at)
     VALUES (@accountId, @yearMonth, @contribution, @dividends, @realizedPnl, @valuation,
             @holdingQuantity, @priceFetchSource, @note, datetime('now'))
     ON CONFLICT(account_id, year_month) DO UPDATE SET
       contribution = excluded.contribution,
       dividends = excluded.dividends,
       realized_pnl = excluded.realized_pnl,
       valuation = excluded.valuation,
       holding_quantity = excluded.holding_quantity,
       price_fetch_source = excluded.price_fetch_source,
       note = excluded.note,
       updated_at = datetime('now')`
  ).run({
    accountId: input.accountId,
    yearMonth: input.yearMonth,
    contribution: input.contribution,
    dividends: input.dividends,
    realizedPnl: input.realizedPnl,
    valuation: input.valuation,
    holdingQuantity: input.holdingQuantity ?? null,
    priceFetchSource: input.priceFetchSource ?? null,
    note: input.note ?? null
  })
  const row = db
    .prepare(`SELECT * FROM monthly_entries WHERE account_id = ? AND year_month = ?`)
    .get(input.accountId, input.yearMonth)
  return rowToEntry(row)
}

export function getMonthlySummary(filter: DashboardFilter): MonthlySummaryRow[] {
  const db = getDatabase()
  const conditions: string[] = ['a.is_archived = 0']
  const params: Record<string, unknown> = {}

  if (filter.from) {
    conditions.push('e.year_month >= @from')
    params.from = filter.from
  }
  if (filter.to) {
    conditions.push('e.year_month <= @to')
    params.to = filter.to
  }
  if (filter.accountTypeCode) {
    conditions.push('a.account_type_code = @accountTypeCode')
    params.accountTypeCode = filter.accountTypeCode
  }
  if (filter.accountId) {
    conditions.push('a.id = @accountId')
    params.accountId = filter.accountId
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `SELECT
         e.year_month AS yearMonth,
         SUM(e.contribution) AS contribution,
         SUM(e.dividends) AS dividends,
         SUM(e.realized_pnl) AS realizedPnl,
         SUM(e.valuation) AS valuation
       FROM monthly_entries e
       JOIN accounts a ON a.id = e.account_id
       ${where}
       GROUP BY e.year_month
       ORDER BY e.year_month ASC`
    )
    .all(params) as Array<{
    yearMonth: string
    contribution: number
    dividends: number
    realizedPnl: number
    valuation: number
  }>

  let cumulative = 0
  return rows.map((row) => {
    cumulative += row.contribution
    return { ...row, cumulativeContribution: cumulative }
  })
}
