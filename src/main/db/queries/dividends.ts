import { getDatabase } from '../index'
import type { DividendHoldingDetail, DividendOverview, DividendPayout } from '@shared/types'
import { getHoldingSnapshot } from './holdings'
import { getMonthlySummary } from './dashboard'
import { getUsdKrwRate } from '../../services/priceService'

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function getDividendOverview(
  year: number,
  accountTypeCode?: string | null
): Promise<DividendOverview> {
  const db = getDatabase()
  const nowMonth = currentYearMonth()

  const monthlyRows = await getMonthlySummary({
    from: `${year}-01`,
    to: `${year}-12`,
    accountTypeCode: accountTypeCode ?? null
  })

  // 지난 달까지는 실제 수령액, 이번 달부터는 예상액을 합산해 "올해 예상 총 배당"을 구한다.
  const annualProjectedTotal = monthlyRows.reduce((sum, row) => {
    const value = row.yearMonth < nowMonth ? row.dividends : (row.projectedDividends ?? 0)
    return sum + value
  }, 0)

  const thisMonthRow = monthlyRows.find((r) => r.yearMonth === nowMonth)
  const thisMonthActual = thisMonthRow?.dividends ?? 0
  const thisMonthProjected = thisMonthRow?.projectedDividends ?? 0

  const { rate } = await getUsdKrwRate()

  const conditions = ['h.is_archived = 0', 'a.is_archived = 0', 'h.dividend_per_share IS NOT NULL']
  const params: unknown[] = []
  if (accountTypeCode) {
    conditions.push('a.account_type_code = ?')
    params.push(accountTypeCode)
  }
  const holdingRows = db
    .prepare(
      `SELECT h.id, h.name, h.dividend_per_share, h.dividend_cycle_type, h.dividend_months,
              a.account_type_code, t.label_ko
       FROM holdings h
       JOIN accounts a ON a.id = h.account_id
       JOIN account_types t ON t.code = a.account_type_code
       WHERE ${conditions.join(' AND ')}`
    )
    .all(...params) as Array<{
    id: number
    name: string
    dividend_per_share: number
    dividend_cycle_type: 'MONTHLY' | 'CUSTOM'
    dividend_months: string | null
    account_type_code: string
    label_ko: string
  }>

  const receivedStmt = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE holding_id = ? AND type = 'DIVIDEND' AND substr(date, 1, 4) = ?`
  )

  const holdings: DividendHoldingDetail[] = []
  const thisMonthPayouts: DividendPayout[] = []

  for (const h of holdingRows) {
    const fx = h.account_type_code === 'FOREIGN_STOCK' ? rate : 1
    const dividendMonths = h.dividend_months ? h.dividend_months.split(',').map(Number) : null
    const snapshot = getHoldingSnapshot(h.id)
    const quantity = snapshot.quantity ?? 0

    const payoutsPerYear = h.dividend_cycle_type === 'MONTHLY' ? 12 : (dividendMonths?.length ?? 0)
    const annualProjected = quantity * h.dividend_per_share * payoutsPerYear * fx

    const received = receivedStmt.get(h.id, String(year)) as { total: number }
    const receivedThisYear = received.total * fx

    holdings.push({
      holdingId: h.id,
      holdingName: h.name,
      accountTypeLabel: h.label_ko,
      dividendCycleType: h.dividend_cycle_type,
      dividendMonths,
      dividendPerShare: h.dividend_per_share,
      currency: h.account_type_code === 'FOREIGN_STOCK' ? 'USD' : 'KRW',
      quantity,
      annualProjected,
      receivedThisYear
    })

    if (quantity > 0) {
      const nowMonthNum = Number(nowMonth.slice(5, 7))
      const isPayoutThisMonth =
        h.dividend_cycle_type === 'MONTHLY' || (dividendMonths ?? []).includes(nowMonthNum)
      if (isPayoutThisMonth) {
        thisMonthPayouts.push({
          holdingId: h.id,
          holdingName: h.name,
          amount: quantity * h.dividend_per_share * fx
        })
      }
    }
  }

  holdings.sort((a, b) => b.annualProjected - a.annualProjected)
  thisMonthPayouts.sort((a, b) => b.amount - a.amount)

  return {
    year,
    monthlyRows,
    annualProjectedTotal,
    thisMonthActual,
    thisMonthProjected,
    holdings,
    thisMonthPayouts
  }
}
