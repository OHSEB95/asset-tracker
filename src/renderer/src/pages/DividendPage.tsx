import { useEffect, useState } from 'react'
import type { DividendOverview } from '@shared/types'
import DividendChart from '../components/charts/DividendChart'

function currentYear(): number {
  return new Date().getFullYear()
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

  const isCurrentYear = year === currentYear()
  const totalLabel = isCurrentYear ? '올해 예상 총 배당' : `${year}년 총 배당`

  const yearOptions = [currentYear(), currentYear() - 1, currentYear() - 2]

  const thisMonthPayoutsTotal = overview?.thisMonthPayouts.reduce((sum, p) => sum + p.amount, 0) ?? 0

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

      {!loading && isCurrentYear && overview && (
        <section className="card">
          <h3>이번달 배당 예정 종목</h3>
          {overview.thisMonthPayouts.length === 0 ? (
            <p className="muted">이번달 배당 예정 종목이 없습니다.</p>
          ) : (
            <table className="data-table compact-table payout-total-table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>예상 배당액</th>
                </tr>
              </thead>
              <tbody>
                {overview.thisMonthPayouts.map((p) => (
                  <tr key={p.holdingId}>
                    <td>{p.holdingName}</td>
                    <td>{formatKrw(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>합계</td>
                  <td>{formatKrw(thisMonthPayoutsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
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
