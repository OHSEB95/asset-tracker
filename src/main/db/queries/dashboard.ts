import { getDatabase } from '../index'
import type {
  Account,
  DashboardFilter,
  MonthlySummaryRow,
  PortfolioRow,
  PortfolioSnapshot,
  Transaction
} from '@shared/types'
import { cashImpact, replayHoldingState } from './replay'
import { getHoldingSnapshot } from './holdings'
import { getUsdKrwRate } from '../../services/priceService'

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    accountTypeCode: row.account_type_code,
    name: row.name,
    isArchived: !!row.is_archived
  }
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

function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [toY, toM] = to.split('-').map(Number)
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return months
}

function listAccountsForFilter(filter: DashboardFilter): Account[] {
  const db = getDatabase()
  const conditions = ['is_archived = 0']
  const params: Record<string, unknown> = {}
  if (filter.accountTypeCode) {
    conditions.push('account_type_code = @accountTypeCode')
    params.accountTypeCode = filter.accountTypeCode
  }
  if (filter.accountId) {
    conditions.push('id = @accountId')
    params.accountId = filter.accountId
  }
  const rows = db.prepare(`SELECT * FROM accounts WHERE ${conditions.join(' AND ')}`).all(params)
  return rows.map(rowToAccount)
}

export async function getMonthlySummary(filter: DashboardFilter): Promise<MonthlySummaryRow[]> {
  const db = getDatabase()

  const from = filter.from ?? '0000-01'
  const to = filter.to ?? '9999-12'
  const months = enumerateMonths(from, to)
  if (months.length === 0) return []

  const accounts = listAccountsForFilter(filter)
  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) {
    return months.map((yearMonth) => ({
      yearMonth,
      contribution: 0,
      dividends: 0,
      realizedPnl: 0,
      valuation: 0,
      cumulativeContribution: 0
    }))
  }

  const { rate } = await getUsdKrwRate()

  const placeholders = accountIds.map(() => '?').join(',')

  // 1) 현금 흐름 집계 (원금/배당/매도손익) - SQL GROUP BY, 해외주식 계좌는 환율 곱해서 KRW로 환산
  const flowRows = db
    .prepare(
      `SELECT
         substr(t.date, 1, 7) AS yearMonth,
         SUM(CASE
               WHEN t.type = 'DEPOSIT' AND a.account_type_code = 'FOREIGN_STOCK' THEN t.amount * ?
               WHEN t.type = 'DEPOSIT' THEN t.amount
               ELSE 0
             END) AS contribution,
         SUM(CASE
               WHEN t.type = 'DIVIDEND' AND a.account_type_code = 'FOREIGN_STOCK' THEN t.amount * ?
               WHEN t.type = 'DIVIDEND' THEN t.amount
               ELSE 0
             END) AS dividends,
         SUM(CASE
               WHEN t.type = 'SELL' AND a.account_type_code = 'FOREIGN_STOCK' THEN t.realized_pnl * ?
               WHEN t.type = 'SELL' THEN t.realized_pnl
               ELSE 0
             END) AS realizedPnl
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE t.account_id IN (${placeholders}) AND substr(t.date,1,7) BETWEEN ? AND ?
       GROUP BY substr(t.date, 1, 7)`
    )
    .all(rate, rate, rate, ...accountIds, from, to) as Array<{
    yearMonth: string
    contribution: number
    dividends: number
    realizedPnl: number
  }>
  const flowByMonth = new Map(flowRows.map((f) => [f.yearMonth, f]))

  // 2) 평가금액 재구성: 계좌별 현금잔액 + 보유종목 평가액을 월말 시점 리플레이로 계산
  const allTx = (
    db
      .prepare(
        `SELECT * FROM transactions WHERE account_id IN (${placeholders}) ORDER BY date ASC, id ASC`
      )
      .all(...accountIds) as any[]
  ).map(rowToTransaction)

  const holdings = (
    db
      .prepare(`SELECT * FROM holdings WHERE account_id IN (${placeholders})`)
      .all(...accountIds) as any[]
  ).map((row) => ({ id: row.id as number, accountId: row.account_id as number }))

  const snapshotRows = db
    .prepare(
      `SELECT holding_id, year_month, price FROM price_snapshots
       WHERE holding_id IN (${holdings.map(() => '?').join(',') || 'NULL'})`
    )
    .all(...holdings.map((h) => h.id)) as Array<{ holding_id: number; year_month: string; price: number }>
  const snapshotsByHolding = new Map<number, Array<{ yearMonth: string; price: number }>>()
  for (const row of snapshotRows) {
    const list = snapshotsByHolding.get(row.holding_id) ?? []
    list.push({ yearMonth: row.year_month, price: row.price })
    snapshotsByHolding.set(row.holding_id, list)
  }
  for (const list of snapshotsByHolding.values()) {
    list.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  }

  function forwardFilledPrice(holdingId: number, month: string): number | null {
    const list = snapshotsByHolding.get(holdingId)
    if (!list) return null
    let price: number | null = null
    for (const snap of list) {
      if (snap.yearMonth <= month) price = snap.price
      else break
    }
    return price
  }

  const valuationByMonth = new Map<string, number>()
  for (const month of months) {
    let total = 0
    const txUpToMonth = allTx.filter((t) => t.date.slice(0, 7) <= month)

    for (const acct of accounts) {
      const fx = acct.accountTypeCode === 'FOREIGN_STOCK' ? rate : 1
      const acctTx = txUpToMonth.filter((t) => t.accountId === acct.id)
      const acctCash = acctTx.reduce((sum, t) => sum + cashImpact(t), 0)
      total += acctCash * fx

      const acctHoldings = holdings.filter((h) => h.accountId === acct.id)
      for (const holding of acctHoldings) {
        const holdingTx = acctTx.filter(
          (t) =>
            t.holdingId === holding.id &&
            (t.type === 'BUY' || t.type === 'SELL' || t.type === 'ADJUST')
        )
        if (holdingTx.length === 0) continue
        const state = replayHoldingState(holdingTx)
        if (state.quantity <= 0) continue
        const price = forwardFilledPrice(holding.id, month) ?? state.avgCost
        if (price != null) total += state.quantity * price * fx
      }
    }
    valuationByMonth.set(month, total)
  }

  let cumulative = 0
  return months.map((yearMonth) => {
    const flow = flowByMonth.get(yearMonth)
    const contribution = flow?.contribution ?? 0
    cumulative += contribution
    return {
      yearMonth,
      contribution,
      dividends: flow?.dividends ?? 0,
      realizedPnl: flow?.realizedPnl ?? 0,
      valuation: valuationByMonth.get(yearMonth) ?? 0,
      cumulativeContribution: cumulative
    }
  })
}

export async function getPortfolioSnapshot(accountTypeCode?: string | null): Promise<PortfolioSnapshot> {
  const db = getDatabase()
  const { rate } = await getUsdKrwRate()

  const conditions = ['a.is_archived = 0']
  const params: unknown[] = []
  if (accountTypeCode) {
    conditions.push('a.account_type_code = ?')
    params.push(accountTypeCode)
  }
  const accountRows = db
    .prepare(
      `SELECT a.id, a.name, a.account_type_code, t.label_ko
       FROM accounts a JOIN account_types t ON t.code = a.account_type_code
       WHERE ${conditions.join(' AND ')}`
    )
    .all(...params) as Array<{ id: number; name: string; account_type_code: string; label_ko: string }>

  const rows: PortfolioRow[] = []

  for (const acct of accountRows) {
    const isForeign = acct.account_type_code === 'FOREIGN_STOCK'
    const fx = isForeign ? rate : 1
    const currency: 'KRW' | 'USD' = isForeign ? 'USD' : 'KRW'

    const allTx = (
      db.prepare(`SELECT * FROM transactions WHERE account_id = ?`).all(acct.id) as any[]
    ).map(rowToTransaction)
    const cashBalance = allTx.reduce((sum, t) => sum + cashImpact(t), 0)

    const holdingRows = db
      .prepare(`SELECT id, name FROM holdings WHERE account_id = ? AND is_archived = 0`)
      .all(acct.id) as Array<{ id: number; name: string }>

    let hasHoldingRows = false
    for (const h of holdingRows) {
      const snap = getHoldingSnapshot(h.id)
      if (snap.quantity <= 0) continue
      hasHoldingRows = true
      const currentPrice = snap.lastKnownPrice ?? snap.avgCost
      const value = currentPrice != null ? snap.quantity * currentPrice * fx : 0
      const profit =
        currentPrice != null && snap.avgCost != null
          ? (currentPrice - snap.avgCost) * snap.quantity * fx
          : null
      rows.push({
        kind: 'holding',
        accountId: acct.id,
        accountTypeLabel: acct.label_ko,
        label: h.name,
        quantity: snap.quantity,
        avgCost: snap.avgCost,
        currentPrice,
        currency,
        value,
        profit,
        weightPercent: 0
      })
    }

    rows.push({
      kind: 'cash',
      accountId: acct.id,
      accountTypeLabel: acct.label_ko,
      label: hasHoldingRows ? `${acct.name} 예수금` : acct.name,
      quantity: null,
      avgCost: null,
      currentPrice: null,
      currency,
      value: cashBalance * fx,
      profit: null,
      weightPercent: 0
    })
  }

  rows.sort((a, b) => b.value - a.value)
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0)
  const totalProfit = rows.reduce((sum, r) => sum + (r.profit ?? 0), 0)
  const weighted = rows.map((r) => ({
    ...r,
    weightPercent: totalValue > 0 ? (r.value / totalValue) * 100 : 0
  }))

  return { rows: weighted, totalValue, totalProfit }
}
