import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { DividendOverview, DividendPayout } from '@shared/types'
import DividendChart from '../components/charts/DividendChart'
import { typeRowClass } from '../utils/accountTypeStyle'

function currentYear(): number {
  return new Date().getFullYear()
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString()}원`
}

function formatCycle(cycleType: 'MONTHLY' | 'CUSTOM', months: number[] | null): string {
  return cycleType === 'MONTHLY' ? '월배당' : `${(months ?? []).join(', ')}월`
}

function formatPerShare(value: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${value.toLocaleString()}원`
}

function formatUsdNumber(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 해외주식은 실제로 달러로 입금되므로, 예상 배당액을 달러(원화) 형태로 함께 보여준다.
function formatPayoutAmount(p: DividendPayout): string {
  const krw = formatKrw(p.amount)
  if (p.currency !== 'USD') return krw
  return `$${formatUsdNumber(p.rawAmount)} (${krw})`
}

// 실제 배당 수령 여부/금액 - 아직 거래내역에 배당 기록이 없으면 '-'.
function formatActualPayoutAmount(p: DividendPayout): string {
  if (p.rawActualAmount == null || p.actualAmount == null) return '-'
  const krw = formatKrw(p.actualAmount)
  if (p.currency !== 'USD') return krw
  return `$${formatUsdNumber(p.rawActualAmount)} (${krw})`
}

function formatActualDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}월 ${d}일`
}

// 종목별 배당 상세는 반대로 원화를 앞에, 달러를 괄호에 표기한다.
function formatKrwWithUsd(krwValue: number, rawValue: number, currency: 'KRW' | 'USD'): string {
  const krw = formatKrw(krwValue)
  if (currency !== 'USD') return krw
  return `${krw} ($${formatUsdNumber(rawValue)})`
}

interface PayoutGroup {
  accountTypeLabel: string
  currency: 'KRW' | 'USD'
  payouts: DividendPayout[]
  totalKrw: number
  totalRaw: number
  totalActualKrw: number
  totalActualRaw: number
  hasActual: boolean
}

function formatGroupTotal(g: PayoutGroup): string {
  if (g.currency !== 'USD') return formatKrw(g.totalKrw)
  return `$${formatUsdNumber(g.totalRaw)} (${formatKrw(g.totalKrw)})`
}

function formatGroupActualTotal(g: PayoutGroup): string {
  if (!g.hasActual) return '-'
  if (g.currency !== 'USD') return formatKrw(g.totalActualKrw)
  return `$${formatUsdNumber(g.totalActualRaw)} (${formatKrw(g.totalActualKrw)})`
}

function formatDayInMonth(day: number, baseMonth: string): string {
  const m = Number(baseMonth.slice(5, 7))
  return `${m}월 ${day}일`
}

function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${y}년 ${m}월`
}

// "이번달 배당 예정 종목" 표는 배당일(지급)이 이번 달인 종목들이므로, 배당락일은 그 지급을
// 결정한 시점 - 배당일이 배당락일보다 이르면(예: 배당락 29일, 배당일 2일) 배당락은 전달에
// 있었던 것으로 본다.
function exMonthForThisPayment(exDay: number, payDay: number | null, nowMonth: string): string {
  if (payDay != null && payDay < exDay) return prevMonth(nowMonth)
  return nowMonth
}

function DividendPage(): React.JSX.Element {
  const { holdings } = useAccountsContext()
  const [year, setYear] = useState(currentYear())
  const [overview, setOverview] = useState<DividendOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const [payoutMonth, setPayoutMonth] = useState(currentYearMonth())
  const [monthPayouts, setMonthPayouts] = useState<DividendPayout[]>([])
  const [monthPayoutsLoading, setMonthPayoutsLoading] = useState(true)
  const [showPayoutMonthPicker, setShowPayoutMonthPicker] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.dividends
      .getOverview(year, null)
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  useEffect(() => {
    let cancelled = false
    setMonthPayoutsLoading(true)
    window.api.dividends
      .getPayoutsForMonth(payoutMonth, null)
      .then((data) => {
        if (!cancelled) setMonthPayouts(data)
      })
      .finally(() => {
        if (!cancelled) setMonthPayoutsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [payoutMonth])

  const isCurrentYear = year === currentYear()
  const totalLabel = isCurrentYear ? '올해 예상 총 배당' : `${year}년 총 배당`

  const yearOptions = [currentYear(), currentYear() - 1, currentYear() - 2]

  const monthPayoutsTotal = monthPayouts.reduce((sum, p) => sum + p.amount, 0)
  const monthPayoutsKrwTotal = monthPayouts
    .filter((p) => p.currency === 'KRW')
    .reduce((sum, p) => sum + p.amount, 0)
  const monthPayoutsUsdTotal = monthPayouts
    .filter((p) => p.currency === 'USD')
    .reduce((sum, p) => sum + p.rawAmount, 0)

  const hasAnyActual = monthPayouts.some((p) => p.actualAmount != null)
  const monthPayoutsActualTotal = monthPayouts.reduce((sum, p) => sum + (p.actualAmount ?? 0), 0)
  const monthPayoutsActualKrwTotal = monthPayouts
    .filter((p) => p.currency === 'KRW')
    .reduce((sum, p) => sum + (p.actualAmount ?? 0), 0)
  const monthPayoutsActualUsdTotal = monthPayouts
    .filter((p) => p.currency === 'USD')
    .reduce((sum, p) => sum + (p.rawActualAmount ?? 0), 0)

  // 배당일(예상) 날짜 순으로 정렬 - 배당일이 없는 종목은 맨 뒤로.
  const sortedMonthPayouts = [...monthPayouts].sort((a, b) => {
    const dayA = holdings.find((h) => h.id === a.holdingId)?.dividendPayDay ?? null
    const dayB = holdings.find((h) => h.id === b.holdingId)?.dividendPayDay ?? null
    if (dayA == null && dayB == null) return 0
    if (dayA == null) return 1
    if (dayB == null) return -1
    return dayA - dayB
  })

  // 계좌 구분별로 묶어서 구분마다 얼마씩 들어오는지 한눈에 보이게 한다.
  const payoutGroups = Object.values(
    sortedMonthPayouts.reduce<Record<string, PayoutGroup>>((acc, p) => {
      const g = acc[p.accountTypeLabel] ?? {
        accountTypeLabel: p.accountTypeLabel,
        currency: p.currency,
        payouts: [],
        totalKrw: 0,
        totalRaw: 0,
        totalActualKrw: 0,
        totalActualRaw: 0,
        hasActual: false
      }
      g.payouts.push(p)
      g.totalKrw += p.amount
      g.totalRaw += p.rawAmount
      if (p.actualAmount != null) {
        g.hasActual = true
        g.totalActualKrw += p.actualAmount
        g.totalActualRaw += p.rawActualAmount ?? 0
      }
      acc[p.accountTypeLabel] = g
      return acc
    }, {})
  ).sort((a, b) => b.totalKrw - a.totalKrw)


  return (
    <div className="page">
      <section className="card dashboard-topbar">
        <div className="filter-group">
          <label>
            연도
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </label>
        </div>

        {overview && (
          <div className="summary-group">
            <div>
              <span className="summary-label">{totalLabel}</span>
              <span className="summary-value">{formatKrw(overview.annualProjectedTotal)}</span>
            </div>
            {isCurrentYear && (
              <>
                <div>
                  <span className="summary-label">이번달 실제 배당</span>
                  <span className="summary-value">{formatKrw(overview.thisMonthActual)}</span>
                </div>
                <div>
                  <span className="summary-label">이번달 예상 배당</span>
                  <span className="summary-value projected-value">{formatKrw(overview.thisMonthProjected)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-header payout-month-header">
          <h3>배당 예정 종목</h3>
          <div className="payout-month-nav">
            <button type="button" className="ghost-button" onClick={() => setPayoutMonth((m) => prevMonth(m))}>
              ◀
            </button>
            <button type="button" className="ghost-button payout-month-label" onClick={() => setShowPayoutMonthPicker(true)}>
              {monthLabel(payoutMonth)}
            </button>
            <button type="button" className="ghost-button" onClick={() => setPayoutMonth((m) => nextMonth(m))}>
              ▶
            </button>
          </div>
        </div>

        {showPayoutMonthPicker && (
          <div className="popup-backdrop" onClick={() => setShowPayoutMonthPicker(false)}>
            <div className="popup-panel" onClick={(e) => e.stopPropagation()}>
              <h4>이동할 달 선택</h4>
              <input
                type="month"
                value={payoutMonth}
                onChange={(e) => {
                  setPayoutMonth(e.target.value)
                  setShowPayoutMonthPicker(false)
                }}
              />
              <div className="form-actions">
                <button type="button" className="ghost-button" onClick={() => setShowPayoutMonthPicker(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {!monthPayoutsLoading && monthPayouts.length === 0 ? (
          <p className="muted">이 달에는 배당 예정 종목이 없습니다.</p>
        ) : (
          <table className="data-table compact-table payout-total-table">
            <thead>
              <tr>
                <th>종목</th>
                <th>배당락일</th>
                <th>배당일 (예상)</th>
                <th>실제 배당일</th>
                <th>예상 배당액</th>
                <th>실제 배당</th>
              </tr>
            </thead>
            {payoutGroups.map((g) => (
              <tbody key={g.accountTypeLabel}>
                <tr className={`payout-group-row ${typeRowClass(g.accountTypeLabel)}`}>
                  <td colSpan={4}>{g.accountTypeLabel} 합계</td>
                  <td>{formatGroupTotal(g)}</td>
                  <td>{formatGroupActualTotal(g)}</td>
                </tr>
                {g.payouts.map((p) => {
                  const holding = holdings.find((h) => h.id === p.holdingId)
                  return (
                    <tr key={p.holdingId} className={typeRowClass(p.accountTypeLabel)}>
                      <td>
                        {p.actualDate != null && (
                          <span className="dividend-received-check" title="이번 달 배당 수령 완료">
                            ✓{' '}
                          </span>
                        )}
                        {p.holdingName}
                      </td>
                      <td>
                        {holding?.dividendExDay != null
                          ? formatDayInMonth(
                              holding.dividendExDay,
                              exMonthForThisPayment(holding.dividendExDay, holding.dividendPayDay, payoutMonth)
                            )
                          : '-'}
                      </td>
                      <td>
                        {holding?.dividendPayDay != null
                          ? formatDayInMonth(holding.dividendPayDay, payoutMonth)
                          : '-'}
                      </td>
                      <td>{p.actualDate != null ? formatActualDate(p.actualDate) : '-'}</td>
                      <td>{formatPayoutAmount(p)}</td>
                      <td>{formatActualPayoutAmount(p)}</td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <td colSpan={4}>합계</td>
                <td>
                  {formatKrw(monthPayoutsTotal)}
                  {monthPayoutsUsdTotal > 0 && (
                    <>
                      {' '}
                      ({formatKrw(monthPayoutsKrwTotal)} + $
                      {monthPayoutsUsdTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      )
                    </>
                  )}
                </td>
                <td>
                  {hasAnyActual ? (
                    <>
                      {formatKrw(monthPayoutsActualTotal)}
                      {monthPayoutsActualUsdTotal > 0 && (
                        <>
                          {' '}
                          ({formatKrw(monthPayoutsActualKrwTotal)} + $
                          {monthPayoutsActualUsdTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                          )
                        </>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {!loading && overview && overview.monthlyRows.length > 0 && (
        <section className="card chart-card dividend-chart-card">
          <h3>{year}년 월별 배당 · 예상 배당</h3>
          <div className="chart-body">
            <DividendChart data={overview.monthlyRows} />
          </div>
        </section>
      )}

      <section className="card">
        <h3>종목별 배당 상세</h3>
        {!overview || overview.holdings.length === 0 ? (
          <p className="muted">배당 정보가 등록된 종목이 없습니다.</p>
        ) : (
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>종목</th>
                <th>계좌유형</th>
                <th>배당주기</th>
                <th>1주 배당금</th>
                <th>보유수량</th>
                <th>연 예상 배당액</th>
                <th>{year}년 누적 실수령액</th>
              </tr>
            </thead>
            <tbody>
              {overview.holdings.map((h) => (
                <tr key={h.holdingId}>
                  <td>{h.holdingName}</td>
                  <td>{h.accountTypeLabel}</td>
                  <td>{formatCycle(h.dividendCycleType, h.dividendMonths)}</td>
                  <td>{formatPerShare(h.dividendPerShare, h.currency)}</td>
                  <td>{h.quantity.toLocaleString()}</td>
                  <td>{formatKrwWithUsd(h.annualProjected, h.rawAnnualProjected, h.currency)}</td>
                  <td>{formatKrwWithUsd(h.receivedThisYear, h.rawReceivedThisYear, h.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default DividendPage
