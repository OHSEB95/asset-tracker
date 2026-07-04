import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { MonthlySummaryRow, PortfolioSnapshot } from '@shared/types'
import PrincipalVsValueChart from '../components/charts/PrincipalVsValueChart'
import DividendChart from '../components/charts/DividendChart'
import SellPnlChart from '../components/charts/SellPnlChart'

function startOfCurrentYear(): string {
  return `${new Date().getFullYear()}-01`
}

function endOfCurrentYear(): string {
  return `${new Date().getFullYear()}-12`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString()}원`
}

function formatByCurrency(value: number | null, currency: 'KRW' | 'USD'): string {
  if (value == null) return '-'
  if (currency === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return formatKrw(value)
}

function DashboardPage({
  onNavigateToHoldings
}: {
  onNavigateToHoldings?: () => void
}): React.JSX.Element {
  const { accountTypes } = useAccountsContext()
  const [from, setFrom] = useState(startOfCurrentYear())
  const [to, setTo] = useState(currentYearMonth())
  const [accountTypeCode, setAccountTypeCode] = useState<string>('')
  const [rows, setRows] = useState<MonthlySummaryRow[]>([])
  const [dividendRows, setDividendRows] = useState<MonthlySummaryRow[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
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

  useEffect(() => {
    let cancelled = false
    window.api.dashboard
      .getMonthlySummary({
        from: startOfCurrentYear(),
        to: endOfCurrentYear(),
        accountTypeCode: accountTypeCode || null
      })
      .then((data) => {
        if (!cancelled) setDividendRows(data)
      })
    return () => {
      cancelled = true
    }
  }, [accountTypeCode])

  useEffect(() => {
    let cancelled = false
    window.api.dashboard.getPortfolioSnapshot(accountTypeCode || null).then((data) => {
      if (!cancelled) setPortfolio(data)
    })
    return () => {
      cancelled = true
    }
  }, [accountTypeCode])

  const latest = rows[rows.length - 1]
  const totalGain = latest ? latest.valuation - latest.principal : 0

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
                {Math.round(latest.principal).toLocaleString()}원
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
        <section className="card chart-card dashboard-principal-chart">
          <h3>원금누적 vs 총평가자산</h3>
          <div className="chart-body">
            <PrincipalVsValueChart data={rows} />
          </div>
        </section>
      )}

      <div className="dashboard-lower">
        <section className="card chart-card split-chart-card">
          <div className="split-chart-half">
            <h3>월별 배당 · 예상 배당 ({new Date().getFullYear()}년)</h3>
            <div className="chart-body">
              {dividendRows.length > 0 ? (
                <DividendChart data={dividendRows} />
              ) : (
                <p className="muted">데이터가 없습니다.</p>
              )}
            </div>
          </div>
          <div className="split-chart-half">
            <h3>매도손익</h3>
            <div className="chart-body">
              {rows.length > 0 ? <SellPnlChart data={rows} /> : <p className="muted">데이터가 없습니다.</p>}
            </div>
          </div>
        </section>

        <section className="card asset-list-card">
          <div className="section-header">
            <h3>총 자산 목록</h3>
            {onNavigateToHoldings && (
              <button type="button" className="ghost-button detail-button" onClick={onNavigateToHoldings}>
                상세
              </button>
            )}
          </div>
          <div className="asset-list-body">
            {!portfolio || portfolio.rows.length === 0 ? (
              <p className="muted">등록된 계좌/보유종목이 없습니다.</p>
            ) : (
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>종목</th>
                    <th>수량</th>
                    <th>평단가</th>
                    <th>현재가</th>
                    <th>가치</th>
                    <th>손익</th>
                    <th>비중</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.rows.map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.accountTypeLabel}</td>
                      <td>{r.label}</td>
                      <td>{r.quantity != null ? r.quantity.toLocaleString() : '-'}</td>
                      <td>{formatByCurrency(r.avgCost, r.currency)}</td>
                      <td>{formatByCurrency(r.currentPrice, r.currency)}</td>
                      <td>{formatKrw(r.value)}</td>
                      <td className={r.profit == null ? '' : r.profit >= 0 ? 'gain' : 'loss'}>
                        {r.profit != null ? formatKrw(r.profit) : '-'}
                      </td>
                      <td>{r.weightPercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>합계</td>
                    <td>{formatKrw(portfolio.totalValue)}</td>
                    <td className={portfolio.totalProfit >= 0 ? 'gain' : 'loss'}>
                      {formatKrw(portfolio.totalProfit)}
                    </td>
                    <td>100.00%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default DashboardPage
