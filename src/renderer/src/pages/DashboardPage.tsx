import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { MonthlySummaryRow } from '@shared/types'
import PrincipalVsValueChart from '../components/charts/PrincipalVsValueChart'
import DividendsChart from '../components/charts/DividendsChart'
import RealizedPnlChart from '../components/charts/RealizedPnlChart'

function startOfCurrentYear(): string {
  return `${new Date().getFullYear()}-01`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function DashboardPage(): React.JSX.Element {
  const { accountTypes } = useAccountsContext()
  const [from, setFrom] = useState(startOfCurrentYear())
  const [to, setTo] = useState(currentYearMonth())
  const [accountTypeCode, setAccountTypeCode] = useState<string>('')
  const [rows, setRows] = useState<MonthlySummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.dashboard
      .getMonthlySummary({ from, to, accountTypeCode: accountTypeCode || null })
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, accountTypeCode])

  const latest = rows[rows.length - 1]
  const totalGain = latest ? latest.valuation - latest.cumulativeContribution : 0

  return (
    <div className="dashboard-page">
      <section className="card dashboard-topbar">
        <div className="filter-group">
          <label>
            시작월
            <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            종료월
            <input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            계좌 유형
            <select value={accountTypeCode} onChange={(e) => setAccountTypeCode(e.target.value)}>
              <option value="">전체</option>
              {accountTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.labelKo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {latest && (
          <div className="summary-group">
            <div>
              <span className="summary-label">누적 원금</span>
              <span className="summary-value">
                {Math.round(latest.cumulativeContribution).toLocaleString()}원
              </span>
            </div>
            <div>
              <span className="summary-label">총 평가자산</span>
              <span className="summary-value">{Math.round(latest.valuation).toLocaleString()}원</span>
            </div>
            <div>
              <span className={`summary-label ${totalGain >= 0 ? 'gain' : 'loss'}`}>평가손익</span>
              <span className={`summary-value ${totalGain >= 0 ? 'gain' : 'loss'}`}>
                {totalGain >= 0 ? '+' : ''}
                {Math.round(totalGain).toLocaleString()}원
              </span>
            </div>
          </div>
        )}
      </section>

      {!loading && rows.length === 0 && (
        <p className="muted">선택한 기간에 입력된 데이터가 없습니다. 거래 입력 화면에서 데이터를 추가해주세요.</p>
      )}

      {rows.length > 0 && (
        <div className="dashboard-charts">
          <section className="card chart-card chart-main">
            <h3>원금누적 vs 총평가자산</h3>
            <div className="chart-body">
              <PrincipalVsValueChart data={rows} />
            </div>
          </section>
          <section className="card chart-card chart-secondary">
            <h3>월별 배당</h3>
            <div className="chart-body">
              <DividendsChart data={rows} />
            </div>
          </section>
          <section className="card chart-card chart-secondary">
            <h3>월별 매도손익</h3>
            <div className="chart-body">
              <RealizedPnlChart data={rows} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default DashboardPage
