import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { MonthlySummaryRow, PortfolioSnapshot } from '@shared/types'
import PrincipalVsValueChart from '../components/charts/PrincipalVsValueChart'
import DividendChart from '../components/charts/DividendChart'
import SellPnlChart from '../components/charts/SellPnlChart'
import AssetAllocationChart, { type AllocationSlice } from '../components/charts/AssetAllocationChart'
import { typeRowClass } from '../utils/accountTypeStyle'
import { EyeIcon, EyeOffIcon } from '../components/icons/EyeIcons'
import { PencilIcon, SaveIcon } from '../components/icons/ActionIcons'

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

function DashboardPage({
  onNavigateToHoldings,
  onNavigateToDividend
}: {
  onNavigateToHoldings?: () => void
  onNavigateToDividend?: () => void
}): React.JSX.Element {
  const { accountTypes } = useAccountsContext()
  const [from, setFrom] = useState(startOfCurrentYear())
  const [to, setTo] = useState(currentYearMonth())
  const [accountTypeCode, setAccountTypeCode] = useState<string>('')
  const [rows, setRows] = useState<MonthlySummaryRow[]>([])
  const [dividendRows, setDividendRows] = useState<MonthlySummaryRow[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [hideValues, setHideValues] = useState(false)
  const [pnlEditMode, setPnlEditMode] = useState(false)
  const [pnlEdits, setPnlEdits] = useState<Record<string, string>>({})
  const [pnlSaving, setPnlSaving] = useState(false)
  const [pnlError, setPnlError] = useState<string | null>(null)

  async function refreshRows(): Promise<void> {
    const data = await window.api.dashboard.getMonthlySummary({
      from,
      to,
      accountTypeCode: accountTypeCode || null
    })
    setRows(data)
  }

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

  function startPnlEdit(): void {
    const initial: Record<string, string> = {}
    for (const r of rows) {
      initial[r.yearMonth] = String(Math.round(r.realizedPnl))
    }
    setPnlEdits(initial)
    setPnlEditMode(true)
    setPnlError(null)
  }

  async function savePnlEdits(): Promise<void> {
    setPnlSaving(true)
    setPnlError(null)
    try {
      for (const r of rows) {
        const editedStr = pnlEdits[r.yearMonth]
        if (editedStr == null || editedStr.trim() === '') continue
        const originalStr = String(Math.round(r.realizedPnl))
        if (editedStr === originalStr) continue
        const parsed = parseFloat(editedStr)
        if (!Number.isFinite(parsed)) {
          setPnlError(`${r.yearMonth}: 숫자를 입력해주세요.`)
          return
        }
        const result = await window.api.dashboard.setRealizedPnlOverride(r.yearMonth, parsed)
        if ('error' in result) {
          setPnlError(`${r.yearMonth}: ${result.error}`)
          return
        }
      }
      setPnlEditMode(false)
      setPnlEdits({})
      await refreshRows()
    } finally {
      setPnlSaving(false)
    }
  }

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

  const allocationData: AllocationSlice[] = portfolio
    ? Object.values(
        portfolio.rows.reduce<Record<string, AllocationSlice>>((acc, r) => {
          const slice = acc[r.accountTypeLabel] ?? { name: r.accountTypeLabel, value: 0 }
          slice.value += r.value
          acc[r.accountTypeLabel] = slice
          return acc
        }, {})
      )
    : []

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
            <div>
              <span className="summary-label">누적 원금</span>
              <span className="summary-value projected-value">
                {Math.round(latest.principal).toLocaleString()}원
              </span>
            </div>
          </div>
        )}
      </section>

      {!loading && rows.length === 0 && (
        <p className="muted">선택한 기간에 입력된 데이터가 없습니다. 거래 입력 화면에서 데이터를 추가해주세요.</p>
      )}

      {rows.length > 0 && (
        <div className="dashboard-top-row">
          <section className="card chart-card dashboard-principal-chart">
            <h3>원금누적 vs 총평가자산</h3>
            <div className="chart-body">
              <PrincipalVsValueChart data={rows} />
            </div>
          </section>

          <section className="card chart-card allocation-chart-card">
            <h3>자산 비중</h3>
            <div className="chart-body">
              {allocationData.length > 0 ? (
                <AssetAllocationChart data={allocationData} />
              ) : (
                <p className="muted">데이터가 없습니다.</p>
              )}
            </div>
          </section>
        </div>
      )}

      <div className="dashboard-lower">
        <section className="card chart-card split-chart-card">
          <div className="split-chart-half">
            <div className="section-header">
              <h3>{new Date().getFullYear()}년 월별 배당 · 예상 배당</h3>
              {onNavigateToDividend && (
                <button type="button" className="ghost-button detail-button" onClick={onNavigateToDividend}>
                  상세
                </button>
              )}
            </div>
            <div className="chart-body">
              {dividendRows.length > 0 ? (
                <DividendChart data={dividendRows} />
              ) : (
                <p className="muted">데이터가 없습니다.</p>
              )}
            </div>
          </div>
          <div className="split-chart-half">
            <div className="section-header">
              <h3>{new Date().getFullYear()}년 매도손익</h3>
              {!accountTypeCode && (
                <button
                  type="button"
                  className="row-icon-button"
                  title={pnlEditMode ? '매도손익 저장' : '매도손익 수동 보정'}
                  aria-label={pnlEditMode ? '매도손익 저장' : '매도손익 수동 보정'}
                  onClick={pnlEditMode ? savePnlEdits : startPnlEdit}
                  disabled={pnlSaving}
                >
                  {pnlEditMode ? <SaveIcon /> : <PencilIcon />}
                </button>
              )}
            </div>
            <div className="chart-body">
              {rows.length === 0 ? (
                <p className="muted">데이터가 없습니다.</p>
              ) : pnlEditMode ? (
                <div className="pnl-edit-list">
                  {rows.map((r) => (
                    <label key={r.yearMonth} className="pnl-edit-row">
                      <span>{Number(r.yearMonth.slice(5, 7))}월</span>
                      <input
                        value={pnlEdits[r.yearMonth] ?? ''}
                        onChange={(e) =>
                          setPnlEdits((prev) => ({ ...prev, [r.yearMonth]: e.target.value }))
                        }
                        disabled={pnlSaving}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <SellPnlChart data={rows} />
              )}
            </div>
            {pnlError && <p className="error-text">{pnlError}</p>}
          </div>
        </section>

        <section className="card asset-list-card">
          <div className="section-header">
            <h3>자산 TOP 10</h3>
            <div className="section-header-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => setHideValues((v) => !v)}
                title={hideValues ? '가치/손익 표시' : '가치/손익 숨기기'}
                aria-label={hideValues ? '가치/손익 표시' : '가치/손익 숨기기'}
              >
                {hideValues ? <EyeOffIcon /> : <EyeIcon />}
              </button>
              {onNavigateToHoldings && (
                <button type="button" className="ghost-button detail-button" onClick={onNavigateToHoldings}>
                  상세
                </button>
              )}
            </div>
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
                    {!hideValues && (
                      <>
                        <th>가치</th>
                        <th>손익</th>
                      </>
                    )}
                    <th>비중</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.rows.slice(0, 10).map((r, idx) => (
                    <tr key={idx} className={typeRowClass(r.accountTypeLabel)}>
                      <td>{r.accountTypeLabel}</td>
                      <td>{r.label}</td>
                      {!hideValues && (
                        <>
                          <td>{formatKrw(r.value)}</td>
                          <td className={r.profit == null ? '' : r.profit >= 0 ? 'gain' : 'loss'}>
                            {r.profit != null ? formatKrw(r.profit) : '-'}
                          </td>
                        </>
                      )}
                      <td>{r.weightPercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default DashboardPage
