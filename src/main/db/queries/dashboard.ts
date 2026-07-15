import { getDatabase } from '../index'
import type {
  Account,
  DashboardFilter,
  MonthlySummaryRow,
  PortfolioRow,
  PortfolioSnapshot,
  Transaction
} from '@shared/types'
import { cashImpact, replayCashHoldingState, replayHoldingState } from './replay'
import { getHoldingSnapshot, getHoldingQuantityAsOf } from './holdings'
import { getUsdKrwRate } from '../../services/priceService'

/** yearMonth의 day일에 해당하는 날짜 문자열. day가 그 달의 마지막 날보다 크면(예: 31일인데
 * 2월인 경우) 그 달의 마지막 날로 맞춘다. */
export function exDivDateForMonth(yearMonth: string, day: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const clampedDay = Math.min(day, lastDay)
  return `${yearMonth}-${String(clampedDay).padStart(2, '0')}`
}

function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * 배당월(=배당이 지급되는 달) 기준으로, 그 지급을 결정하는 배당락일이 속한 달을 구한다.
 * 배당일(payDay)이 배당락일(exDay)보다 이르면 배당락은 전달에 있었던 것으로 본다
 * (예: 배당락일 29일, 배당일 2일 -> 7월 지급이면 배당락은 6월 29일).
 * payDay 정보가 없으면 같은 달로 취급한다(하위호환).
 */
export function exMonthForPayment(paymentMonth: string, exDay: number, payDay: number | null): string {
  if (payDay != null && payDay < exDay) return prevMonth(paymentMonth)
  return paymentMonth
}

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

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
      projectedDividends: null,
      realizedPnl: 0,
      valuation: 0,
      principal: 0
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
  ).map((row) => ({
    id: row.id as number,
    accountId: row.account_id as number,
    dividendPerShare: row.dividend_per_share as number | null,
    dividendCycleType: row.dividend_cycle_type as 'MONTHLY' | 'CUSTOM' | null,
    dividendMonths: row.dividend_months
      ? (row.dividend_months as string).split(',').map((m: string) => Number(m))
      : null,
    dividendExDay: row.dividend_ex_day as number | null,
    dividendPayDay: row.dividend_pay_day as number | null
  }))

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

  // 원금 = 예수금 + Σ(보유수량 × 평단가), 평가금액 = 예수금 + Σ(보유수량 × 현재가)
  const valuationByMonth = new Map<string, number>()
  const principalByMonth = new Map<string, number>()
  for (const month of months) {
    let valuationTotal = 0
    let principalTotal = 0
    const txUpToMonth = allTx.filter((t) => t.date.slice(0, 7) <= month)

    for (const acct of accounts) {
      const fx = acct.accountTypeCode === 'FOREIGN_STOCK' ? rate : 1
      const acctTx = txUpToMonth.filter((t) => t.accountId === acct.id)
      const acctCash = acctTx.reduce((sum, t) => sum + cashImpact(t), 0)
      valuationTotal += acctCash * fx
      principalTotal += acctCash * fx

      const acctHoldings = holdings.filter((h) => h.accountId === acct.id)
      for (const holding of acctHoldings) {
        if (acct.accountTypeCode === 'YOUTH_SAVINGS') {
          const holdingTx = acctTx.filter(
            (t) =>
              t.holdingId === holding.id &&
              (t.type === 'DEPOSIT' ||
                t.type === 'WITHDRAWAL' ||
                t.type === 'ADJUST' ||
                t.type === 'CLOSE')
          )
          if (holdingTx.length === 0) continue
          const { balance } = replayCashHoldingState(holdingTx)
          principalTotal += balance * fx
          valuationTotal += balance * fx
          continue
        }

        const holdingTx = acctTx.filter(
          (t) =>
            t.holdingId === holding.id &&
            (t.type === 'BUY' || t.type === 'SELL' || t.type === 'ADJUST')
        )
        if (holdingTx.length === 0) continue
        const state = replayHoldingState(holdingTx)
        if (state.quantity <= 0) continue
        if (state.avgCost != null) principalTotal += state.quantity * state.avgCost * fx
        const price = forwardFilledPrice(holding.id, month) ?? state.avgCost
        if (price != null) valuationTotal += state.quantity * price * fx
      }
    }
    valuationByMonth.set(month, valuationTotal)
    principalByMonth.set(month, principalTotal)
  }

  // 3) 예상 배당: 종목별 "현재" 보유수량이 앞으로도 유지된다고 가정하고, 배당주기에 맞는
  //    미래 달에 (보유수량 × 1주 배당금)을 더한다. 이번 달 이전은 null(계산 안 함).
  const nowMonth = currentYearMonth()
  const projectedByMonth = new Map<string, number>()
  for (const holding of holdings) {
    if (holding.dividendPerShare == null || !holding.dividendCycleType) continue
    const snapshot = getHoldingSnapshot(holding.id)
    if (!snapshot.quantity || snapshot.quantity <= 0) continue

    const acct = accounts.find((a) => a.id === holding.accountId)
    const fx = acct?.accountTypeCode === 'FOREIGN_STOCK' ? rate : 1

    for (const month of months) {
      if (month < nowMonth) continue
      const monthNum = Number(month.slice(5, 7))
      const isPayoutMonth =
        holding.dividendCycleType === 'MONTHLY' ||
        (holding.dividendCycleType === 'CUSTOM' && (holding.dividendMonths ?? []).includes(monthNum))
      if (!isPayoutMonth) continue

      // 배당락일이 설정돼 있으면 그 시점 기준 보유수량으로, 없으면 현재 보유수량으로 계산한다.
      // 배당락일 이후에 매수/정리한 수량은 이번 배당락일에는 반영되지 않고 다음 배당락일부터 반영됨.
      // 배당일(payDay)이 배당락일(exDay)보다 이르면 배당락은 전달에 있었던 것으로 본다.
      const eligibleQty =
        holding.dividendExDay != null
          ? getHoldingQuantityAsOf(
              holding.id,
              exDivDateForMonth(
                exMonthForPayment(month, holding.dividendExDay, holding.dividendPayDay),
                holding.dividendExDay
              )
            )
          : snapshot.quantity
      if (eligibleQty <= 0) continue
      const perPayout = eligibleQty * holding.dividendPerShare * fx
      projectedByMonth.set(month, (projectedByMonth.get(month) ?? 0) + perPayout)
    }
  }

  return months.map((yearMonth) => {
    const flow = flowByMonth.get(yearMonth)
    return {
      yearMonth,
      contribution: flow?.contribution ?? 0,
      dividends: flow?.dividends ?? 0,
      projectedDividends: yearMonth < nowMonth ? null : (projectedByMonth.get(yearMonth) ?? 0),
      realizedPnl: flow?.realizedPnl ?? 0,
      valuation: valuationByMonth.get(yearMonth) ?? 0,
      principal: principalByMonth.get(yearMonth) ?? 0
    }
  })
}

export async function getPortfolioSnapshot(
  accountTypeCode?: string | string[] | null
): Promise<PortfolioSnapshot> {
  const db = getDatabase()
  const { rate } = await getUsdKrwRate()

  const codes = accountTypeCode == null ? [] : Array.isArray(accountTypeCode) ? accountTypeCode : [accountTypeCode]

  const conditions = ['a.is_archived = 0']
  const params: unknown[] = []
  if (codes.length > 0) {
    conditions.push(`a.account_type_code IN (${codes.map(() => '?').join(',')})`)
    params.push(...codes)
  }
  const accountRows = db
    .prepare(
      `SELECT a.id, a.name, a.account_type_code, t.label_ko
       FROM accounts a JOIN account_types t ON t.code = a.account_type_code
       WHERE ${conditions.join(' AND ')}`
    )
    .all(...params) as Array<{ id: number; name: string; account_type_code: string; label_ko: string }>

  const rows: PortfolioRow[] = []
  const priceHoldingIds: number[] = []

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

    const isSavings = acct.account_type_code === 'YOUTH_SAVINGS'
    let hasHoldingRows = false
    for (const h of holdingRows) {
      const snap = getHoldingSnapshot(h.id)

      if (isSavings) {
        const balance = snap.currentValuation ?? 0
        if (balance === 0) continue
        hasHoldingRows = true
        rows.push({
          kind: 'holding',
          accountId: acct.id,
          accountTypeLabel: acct.label_ko,
          label: h.name,
          quantity: null,
          avgCost: null,
          currentPrice: null,
          currency,
          value: balance * fx,
          rawValue: balance,
          profit: null,
          rawProfit: null,
          weightPercent: 0
        })
        continue
      }

      if (snap.quantity == null || snap.quantity <= 0) continue
      hasHoldingRows = true
      priceHoldingIds.push(h.id)
      const currentPrice = snap.lastKnownPrice ?? snap.avgCost
      const rawValue = currentPrice != null ? snap.quantity * currentPrice : 0
      const value = rawValue * fx
      const rawProfit =
        currentPrice != null && snap.avgCost != null ? (currentPrice - snap.avgCost) * snap.quantity : null
      const profit = rawProfit != null ? rawProfit * fx : null
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
        rawValue,
        profit,
        rawProfit,
        weightPercent: 0
      })
    }

    if (!isSavings) {
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
        rawValue: cashBalance,
        profit: null,
        rawProfit: null,
        weightPercent: 0
      })
    } else if (cashBalance !== 0) {
      // 특정 상품(holding)에 연결되지 않은 입금/출금 (세부 종목 미등록 상태로 거래한 경우)
      rows.push({
        kind: 'cash',
        accountId: acct.id,
        accountTypeLabel: acct.label_ko,
        label: hasHoldingRows ? `${acct.name} (미분류)` : acct.name,
        quantity: null,
        avgCost: null,
        currentPrice: null,
        currency,
        value: cashBalance * fx,
        rawValue: cashBalance,
        profit: null,
        rawProfit: null,
        weightPercent: 0
      })
    }
  }

  rows.sort((a, b) => b.value - a.value)
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0)
  const totalProfit = rows.reduce((sum, r) => sum + (r.profit ?? 0), 0)
  const weighted = rows.map((r) => ({
    ...r,
    weightPercent: totalValue > 0 ? (r.value / totalValue) * 100 : 0
  }))

  let pricesUpdatedAt: string | null = null
  if (priceHoldingIds.length > 0) {
    const placeholders = priceHoldingIds.map(() => '?').join(',')
    const row = db
      .prepare(`SELECT MAX(updated_at) AS maxUpdated FROM price_snapshots WHERE holding_id IN (${placeholders})`)
      .get(...priceHoldingIds) as { maxUpdated: string | null }
    // SQLite datetime('now')는 UTC를 공백 구분 형식으로 저장하므로, 렌더러에서 안전하게
    // 로컬시간으로 파싱할 수 있도록 ISO 8601(Z) 형식으로 바꿔서 내려준다.
    pricesUpdatedAt = row.maxUpdated ? `${row.maxUpdated.replace(' ', 'T')}Z` : null
  }

  return { rows: weighted, totalValue, totalProfit, pricesUpdatedAt }
}
