import { useEffect, useState } from 'react'
import type { DividendOverview } from '@shared/types'
import DividendChart from '../components/charts/DividendChart'

function currentYear(): number {
  return new Date().getFullYear()
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function addMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  let year = y
  let month = m + delta
  while (month > 12) {
    month -= 12
    year += 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString()}원`
}

function formatMonthLabel(yearMonth: string): string {
  return `${Number(yearMonth.slice(5, 7))}월`
}

function formatCycle(cycleType: 'MONTHLY' | 'CUSTOM', months: number[] | null): string {
  return cycleType === 'MONTHLY' ? '월배당' : `${(months ?? []).join(', ')}월`
}

function DividendPage(): React.JSX.Element {
  const [year, setYear] = useState(currentYear())
  const [overview, setOverview] = useState<DividendOverview | null>(null)
  const [loading, setLoading] = useState(true)

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

  const nowMonth = currentYearMonth()
  const isCurrentYear = year === currentYear()
  const totalLabel = isCurrentYear ? '올해 예상 총 배당' : `${year}년 총 배당`

  const yearOptions = [currentYear(), currentYear() - 1, currentYear() - 2]

  const upcomingByMonth = new Map<string, string[]>()
  if (overview) {
    for (const u of overview.upcoming) {
      const list = upcomingByMonth.get(u.yearMonth) ?? []
      list.push(u.holdingName)
      upcomingByMonth.set(u.yearMonth, list)
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
                  <span className="summary-value">{formatKrw(overview.thisMonthProjected)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {!loading && isCurrentYear && overview && (
        <section className="card">
          <p>
            <strong>이번달({formatMonthLabel(nowMonth)}) 배당 예정:</strong>{' '}
            {(upcomingByMonth.get(nowMonth) ?? []).join(', ') || '없음'}
          </p>
          <p>
            <strong>다음달({formatMonthLabel(addMonth(nowMonth, 1))}) 배당 예정:</strong>{' '}
            {(upcomingByMonth.get(addMonth(nowMonth, 1)) ?? []).join(', ') || '없음'}
          </p>
        </section>
      )}

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
                  <td>{h.dividendPerShare.toLocaleString()}</td>
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
