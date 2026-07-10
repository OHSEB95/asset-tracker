import { getDatabase } from '../index'
import type { DividendHoldingDetail, DividendOverview, DividendPayout } from '@shared/types'
import { getHoldingSnapshot, getHoldingQuantityAsOf } from './holdings'
import { getMonthlySummary, exDivDateForMonth, exMonthForPayment } from './dashboard'
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
              h.dividend_ex_day, h.dividend_pay_day, a.account_type_code, t.label_ko
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
    dividend_ex_day: number | null
    dividend_pay_day: number | null
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

    const payoutMonths =
      h.dividend_cycle_type === 'MONTHLY' ? Array.from({ length: 12 }, (_, i) => i + 1) : (dividendMonths ?? [])

    // 배당락일이 설정돼 있으면 각 배당월의 배당락일 시점 보유수량으로, 없으면 현재 보유수량을
    // 전체 배당월 수에 곱해서 계산한다(배당락일 이후 매수/정리는 다음 배당락일부터 반영됨).
    let annualProjected = 0
    if (h.dividend_ex_day != null) {
      for (const m of payoutMonths) {
        const ym = `${year}-${String(m).padStart(2, '0')}`
        const exMonth = exMonthForPayment(ym, h.dividend_ex_day, h.dividend_pay_day)
        const eligibleQty = getHoldingQuantityAsOf(h.id, exDivDateForMonth(exMonth, h.dividend_ex_day))
        if (eligibleQty > 0) annualProjected += eligibleQty * h.dividend_per_share * fx
      }
    } else {
      annualProjected = quantity * h.dividend_per_share * payoutMonths.length * fx
    }

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

    const nowMonthNum = Number(nowMonth.slice(5, 7))
    const isPayoutThisMonth =
      h.dividend_cycle_type === 'MONTHLY' || (dividendMonths ?? []).includes(nowMonthNum)
    if (isPayoutThisMonth) {
      const eligibleQtyThisMonth =
        h.dividend_ex_day != null
          ? getHoldingQuantityAsOf(
              h.id,
              exDivDateForMonth(
                exMonthForPayment(nowMonth, h.dividend_ex_day, h.dividend_pay_day),
                h.dividend_ex_day
              )
            )
          : quantity
      if (eligibleQtyThisMonth > 0) {
        thisMonthPayouts.push({
          holdingId: h.id,
          holdingName: h.name,
          amount: eligibleQtyThisMonth * h.dividend_per_share * fx
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
