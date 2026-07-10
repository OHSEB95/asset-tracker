import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { DividendOverview, DividendPayout, Holding, HoldingInput } from '@shared/types'
import DividendChart from '../components/charts/DividendChart'

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
  const { holdings, refresh } = useAccountsContext()
  const [year, setYear] = useState(currentYear())
  const [overview, setOverview] = useState<DividendOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingPayDayId, setEditingPayDayId] = useState<number | null>(null)
  const [payDayInput, setPayDayInput] = useState('')
  const [payDaySaving, setPayDaySaving] = useState(false)

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

  // 배당일(예상) 날짜 순으로 정렬 - 배당일이 없는 종목은 맨 뒤로.
  const sortedMonthPayouts = [...monthPayouts].sort((a, b) => {
    const dayA = holdings.find((h) => h.id === a.holdingId)?.dividendPayDay ?? null
    const dayB = holdings.find((h) => h.id === b.holdingId)?.dividendPayDay ?? null
    if (dayA == null && dayB == null) return 0
    if (dayA == null) return 1
    if (dayB == null) return -1
    return dayA - dayB
  })

  function startEditPayDay(holding: Holding): void {
    setEditingPayDayId(holding.id)
    setPayDayInput(holding.dividendPayDay != null ? String(holding.dividendPayDay) : '')
  }

  function cancelEditPayDay(): void {
    setEditingPayDayId(null)
  }

  async function savePayDay(holding: Holding): Promise<void> {
    const day = parseInt(payDayInput, 10)
    if (!Number.isFinite(day) || day < 1 || day > 31) return
    setPayDaySaving(true)
    try {
      const input: HoldingInput = {
        accountId: holding.accountId,
        name: holding.name,
        priceSymbol: holding.priceSymbol,
        priceSource: holding.priceSource,
        dividendPerShare: holding.dividendPerShare,
        dividendCycleType: holding.dividendCycleType,
        dividendMonths: holding.dividendMonths,
        dividendExDay: holding.dividendExDay,
        dividendPayDay: day
      }
      await window.api.holdings.update(holding.id, input)
      setEditingPayDayId(null)
      await refresh()
      const data = await window.api.dividends.getPayoutsForMonth(payoutMonth, null)
      setMonthPayouts(data)
    } finally {
      setPayDaySaving(false)
    }
  }

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
                <th>예상 배당액</th>
              </tr>
            </thead>
            <tbody>
              {sortedMonthPayouts.map((p) => {
                const holding = holdings.find((h) => h.id === p.holdingId)
                return (
                  <tr key={p.holdingId}>
                    <td>{p.holdingName}</td>
                    <td>
                      {holding?.dividendExDay != null
                        ? formatDayInMonth(
                            holding.dividendExDay,
                            exMonthForThisPayment(holding.dividendExDay, holding.dividendPayDay, payoutMonth)
                          )
                        : '-'}
                    </td>
                    <td>
                      {editingPayDayId === p.holdingId ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={payDayInput}
                            onChange={(e) => setPayDayInput(e.target.value)}
                            className="pay-day-input"
                          />
                          <button
                            type="button"
                            onClick={() => holding && savePayDay(holding)}
                            disabled={payDaySaving}
                          >
                            저장
                          </button>
                          <button type="button" onClick={cancelEditPayDay} disabled={payDaySaving}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          {holding?.dividendPayDay != null
                            ? formatDayInMonth(holding.dividendPayDay, payoutMonth)
                            : '-'}
                          {holding && (
                            <button type="button" className="ghost-button" onClick={() => startEditPayDay(holding)}>
                              수정
                            </button>
                          )}
                        </>
                      )}
                    </td>
                    <td>{formatKrw(p.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>합계</td>
                <td>{formatKrw(monthPayoutsTotal)}</td>
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
                  <td>{formatKrw(h.annualProjected)}</td>
                  <td>{formatKrw(h.receivedThisYear)}</td>
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
