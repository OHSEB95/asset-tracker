import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { PortfolioSnapshot, PortfolioRow, TransactionInput } from '@shared/types'
import { typeRowClass } from '../utils/accountTypeStyle'
import { EyeIcon, EyeOffIcon } from '../components/icons/EyeIcons'
import { PencilIcon, SaveIcon } from '../components/icons/ActionIcons'

function formatMoney(value: number | null, currency: 'KRW' | 'USD'): string {
  if (value == null) return '-'
  if (currency === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${Math.round(value).toLocaleString()}원`
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString()}원`
}

function formatUsdValue(currency: 'KRW' | 'USD', rawValue: number): string {
  return currency === 'USD' ? formatMoney(rawValue, 'USD') : '-'
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

function buildAiCopyText(portfolio: PortfolioSnapshot, filterLabel: string): string {
  const lines: string[] = []
  lines.push(`# 자산현황 (${todayDate()} 기준, 필터: ${filterLabel})`)
  lines.push('')
  lines.push('| 구분 | 종목 | 보유수량 | 평단가 | 현재가 | 가치(원화) | 가치(달러) | 손익(원화) | 비중 |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const r of portfolio.rows) {
    const qty = r.quantity != null ? r.quantity.toLocaleString() : '-'
    const avgCost = r.avgCost != null ? formatMoney(r.avgCost, r.currency) : '-'
    const currentPrice = r.currentPrice != null ? formatMoney(r.currentPrice, r.currency) : '-'
    const value = formatKrw(r.value)
    const usdValue = formatUsdValue(r.currency, r.rawValue)
    const profit = r.profit != null ? formatKrw(r.profit) : '-'
    lines.push(
      `| ${r.accountTypeLabel} | ${r.label} | ${qty} | ${avgCost} | ${currentPrice} | ${value} | ${usdValue} | ${profit} | ${r.weightPercent.toFixed(2)}% |`
    )
  }
  lines.push(
    `| 합계 |  |  |  |  | ${formatKrw(portfolio.totalValue)} |  | ${formatKrw(portfolio.totalProfit)} | 100.00% |`
  )
  if (portfolio.pricesUpdatedAt) {
    lines.push('')
    lines.push(`(현재가 마지막 갱신: ${formatUpdatedAt(portfolio.pricesUpdatedAt)})`)
  }
  return lines.join('\n')
}

function HoldingsPage(): React.JSX.Element {
  const { accountTypes, holdings } = useAccountsContext()
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [showCashOnly, setShowCashOnly] = useState(false)
  const [accountTypeFilters, setAccountTypeFilters] = useState<string[]>([])
  const [hideValues, setHideValues] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [cashEditValue, setCashEditValue] = useState('')
  const [cashSaving, setCashSaving] = useState(false)
  const [cashEditError, setCashEditError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [avgCostEditMode, setAvgCostEditMode] = useState(false)
  const [avgCostEdits, setAvgCostEdits] = useState<Record<number, string>>({})
  const [avgCostSaving, setAvgCostSaving] = useState(false)
  const [avgCostError, setAvgCostError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const data = await window.api.dashboard.getPortfolioSnapshot(
      accountTypeFilters.length > 0 ? accountTypeFilters : null
    )
    setPortfolio(data)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTypeFilters])

  function toggleAccountTypeFilter(code: string): void {
    setAccountTypeFilters((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  // 시세 소스가 설정된 보유종목의 현재가는 API가 충분히 정확하게 내려주므로, 탭 진입 시
  // 조용히 자동 조회해 이번 달 시세로 저장한다(사용자가 직접 입력할 필요 없음). naver_gold는
  // 종목별 심볼이 없는 소스라 priceSymbol이 아니라 priceSource 유무로 판단해야 한다.
  useEffect(() => {
    const activeHoldings = holdings.filter((h) => !h.isArchived && h.priceSource)
    if (activeHoldings.length === 0) return
    const yearMonth = currentYearMonth()
    Promise.all(
      activeHoldings.map(async (h) => {
        const result = await window.api.prices.fetch(h.id)
        if ('error' in result) return
        await window.api.priceSnapshots.upsert({
          holdingId: h.id,
          yearMonth,
          price: result.price,
          source: result.source
        })
      })
    ).then(refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings])

  function startEditCash(row: PortfolioRow): void {
    setEditingAccountId(row.accountId)
    setCashEditValue(
      row.currency === 'USD' ? row.rawValue.toFixed(2) : String(Math.round(row.rawValue))
    )
    setCashEditError(null)
  }

  function cancelEditCash(): void {
    setEditingAccountId(null)
    setCashEditError(null)
  }

  async function saveEditCash(row: PortfolioRow): Promise<void> {
    const newValue = parseFloat(cashEditValue)
    if (!Number.isFinite(newValue)) {
      setCashEditError('숫자를 입력해주세요.')
      return
    }
    const delta = newValue - row.rawValue
    if (Math.abs(delta) < 0.005) {
      setEditingAccountId(null)
      return
    }
    setCashSaving(true)
    setCashEditError(null)
    try {
      const input: TransactionInput = {
        accountId: row.accountId,
        type: delta > 0 ? 'ADJUST' : 'WITHDRAWAL',
        date: todayDate(),
        amount: Math.abs(delta),
        note: '예수금 잔액 수정 (자산현황)'
      }
      const result = await window.api.transactions.create(input)
      if ('error' in result) {
        setCashEditError(result.error)
        return
      }
      setEditingAccountId(null)
      await refresh()
    } finally {
      setCashSaving(false)
    }
  }

  const cashRows = portfolio ? portfolio.rows.filter((r) => r.kind === 'cash') : []

  async function copyForAi(): Promise<void> {
    if (!portfolio || portfolio.rows.length === 0) return
    const filterLabel =
      accountTypeFilters.length > 0
        ? accountTypes
            .filter((t) => accountTypeFilters.includes(t.code))
            .map((t) => t.labelKo)
            .join(', ')
        : '전체'
    const text = buildAiCopyText(portfolio, filterLabel)
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  function startAvgCostEdit(): void {
    if (!portfolio) return
    const initial: Record<number, string> = {}
    for (const r of portfolio.rows) {
      if (r.holdingId != null && r.avgCost != null) {
        initial[r.holdingId] = r.currency === 'USD' ? r.avgCost.toFixed(2) : String(Math.round(r.avgCost))
      }
    }
    setAvgCostEdits(initial)
    setAvgCostEditMode(true)
    setAvgCostError(null)
  }

  async function saveAvgCostEdits(): Promise<void> {
    if (!portfolio) return
    setAvgCostSaving(true)
    setAvgCostError(null)
    try {
      for (const r of portfolio.rows) {
        if (r.holdingId == null || r.avgCost == null) continue
        const editedStr = avgCostEdits[r.holdingId]
        if (editedStr == null || editedStr.trim() === '') continue
        // 편집 모드 진입 시 넣어준 초기값과 문자열 그대로 같으면 "안 건드린" 것으로 본다.
        // 실제 평단가(소수점이 긴 값)와 화면에 반올림해 보여준 초기값을 숫자로 비교하면
        // 반올림 오차 때문에 손 안 댄 행도 "바뀐 값"으로 오인될 수 있어서 문자열로 비교한다.
        const originalStr = r.currency === 'USD' ? r.avgCost.toFixed(2) : String(Math.round(r.avgCost))
        if (editedStr === originalStr) continue
        const parsed = parseFloat(editedStr)
        if (!Number.isFinite(parsed)) {
          setAvgCostError(`${r.label}: 숫자를 입력해주세요.`)
          return
        }
        const result = await window.api.holdings.setAvgCost(r.holdingId, parsed)
        if ('error' in result) {
          setAvgCostError(`${r.label}: ${result.error}`)
          return
        }
      }
      setAvgCostEditMode(false)
      setAvgCostEdits({})
      await refresh()
    } finally {
      setAvgCostSaving(false)
    }
  }

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <div className="section-header-title">
            <h2>자산현황</h2>
            <button
              type="button"
              className="ghost-button detail-button"
              onClick={copyForAi}
              disabled={!portfolio || portfolio.rows.length === 0}
            >
              {copyStatus === 'copied' ? '복사됨!' : copyStatus === 'error' ? '복사 실패' : 'AI 분석용 복사'}
            </button>
          </div>
          <div className="section-header-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => setHideValues((v) => !v)}
              title={hideValues ? '보유수량/가치/손익 표시' : '보유수량/가치/손익 숨기기'}
              aria-label={hideValues ? '보유수량/가치/손익 표시' : '보유수량/가치/손익 숨기기'}
            >
              {hideValues ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button type="button" className="ghost-button detail-button" onClick={() => setShowCashOnly((v) => !v)}>
              {showCashOnly ? '전체 보기' : '예수금'}
            </button>
          </div>
        </div>

        <div className="account-type-checkbox-row">
          {accountTypes.map((t) => (
            <label key={t.code} className="account-type-checkbox">
              <input
                type="checkbox"
                checked={accountTypeFilters.includes(t.code)}
                onChange={() => toggleAccountTypeFilter(t.code)}
              />
              {t.labelKo}
            </label>
          ))}
        </div>

        {showCashOnly ? (
          cashRows.length === 0 ? (
            <p className="muted">예수금이 있는 계좌가 없습니다.</p>
          ) : (
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>계좌</th>
                  <th>잔액</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cashRows.map((r) => (
                  <tr key={r.accountId} className={typeRowClass(r.accountTypeLabel)}>
                    <td>{r.accountTypeLabel}</td>
                    <td>{r.label}</td>
                    <td>
                      {editingAccountId === r.accountId ? (
                        <input
                          value={cashEditValue}
                          onChange={(e) => setCashEditValue(e.target.value)}
                          className="cash-edit-input"
                        />
                      ) : (
                        formatMoney(r.rawValue, r.currency)
                      )}
                    </td>
                    <td className="row-actions">
                      {editingAccountId === r.accountId ? (
                        <>
                          <button type="button" onClick={() => saveEditCash(r)} disabled={cashSaving}>
                            {cashSaving ? '저장 중…' : '저장'}
                          </button>
                          <button type="button" onClick={cancelEditCash} disabled={cashSaving}>
                            취소
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEditCash(r)}>
                          수정
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !portfolio || portfolio.rows.length === 0 ? (
          <p className="muted">등록된 계좌/보유종목이 없습니다.</p>
        ) : (
          <table className="data-table compact-table holdings-table">
            <thead>
              <tr>
                <th className="col-type">구분</th>
                <th className="col-product">종목</th>
                {!hideValues && <th className="col-qty">보유수량</th>}
                <th className="col-avg-cost">
                  평단가
                  <button
                    type="button"
                    className="row-icon-button avg-cost-edit-toggle"
                    title={avgCostEditMode ? '평단가 저장' : '평단가 수정'}
                    aria-label={avgCostEditMode ? '평단가 저장' : '평단가 수정'}
                    onClick={avgCostEditMode ? saveAvgCostEdits : startAvgCostEdit}
                    disabled={avgCostSaving}
                  >
                    {avgCostEditMode ? <SaveIcon /> : <PencilIcon />}
                  </button>
                </th>
                <th className="price-col-narrow">현재가</th>
                {!hideValues && (
                  <>
                    <th className="col-value">가치</th>
                    <th className="col-value">달러가치</th>
                    <th className="col-profit">손익</th>
                  </>
                )}
                <th className="col-weight">비중</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.rows.map((r, idx) => (
                <tr key={idx} className={typeRowClass(r.accountTypeLabel)}>
                  <td className="col-type">{r.accountTypeLabel}</td>
                  <td className="col-product">{r.label}</td>
                  {!hideValues && (
                    <td className="col-qty">{r.quantity != null ? r.quantity.toLocaleString() : '-'}</td>
                  )}
                  <td className="col-avg-cost">
                    {avgCostEditMode && r.holdingId != null && r.avgCost != null ? (
                      <input
                        value={avgCostEdits[r.holdingId] ?? ''}
                        onChange={(e) =>
                          setAvgCostEdits((prev) => ({ ...prev, [r.holdingId!]: e.target.value }))
                        }
                        className="avg-cost-edit-input"
                        disabled={avgCostSaving}
                      />
                    ) : r.avgCost != null ? (
                      formatMoney(r.avgCost, r.currency)
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="price-col-narrow">{r.currentPrice != null ? formatMoney(r.currentPrice, r.currency) : '-'}</td>
                  {!hideValues && (
                    <>
                      <td className="col-value value-cell">{formatKrw(r.value)}</td>
                      <td className="col-value">{formatUsdValue(r.currency, r.rawValue)}</td>
                      <td className={`col-profit ${r.profit == null ? '' : r.profit >= 0 ? 'gain' : 'loss'}`}>
                        {r.profit != null ? formatKrw(r.profit) : '-'}
                      </td>
                    </>
                  )}
                  <td className="col-weight">{r.weightPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="holdings-total-row">
              <tr>
                <td colSpan={hideValues ? 4 : 5}>합계</td>
                {!hideValues && (
                  <>
                    <td className="value-cell">{formatKrw(portfolio.totalValue)}</td>
                    <td></td>
                    <td className={portfolio.totalProfit >= 0 ? 'gain' : 'loss'}>
                      {formatKrw(portfolio.totalProfit)}
                    </td>
                  </>
                )}
                <td>100.00%</td>
              </tr>
            </tfoot>
          </table>
        )}
        {cashEditError && <p className="error-text">{cashEditError}</p>}
        {avgCostError && <p className="error-text">{avgCostError}</p>}
        {portfolio?.pricesUpdatedAt && (
          <p className="prices-updated-at">현재가 마지막 갱신: {formatUpdatedAt(portfolio.pricesUpdatedAt)}</p>
        )}
      </section>
    </div>
  )
}

export default HoldingsPage
