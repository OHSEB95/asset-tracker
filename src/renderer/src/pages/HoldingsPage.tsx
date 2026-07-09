import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { PortfolioSnapshot, PortfolioRow, TransactionInput } from '@shared/types'
import { typeRowClass } from '../utils/accountTypeStyle'

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

function HoldingsPage(): React.JSX.Element {
  const { holdings } = useAccountsContext()
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [showCashOnly, setShowCashOnly] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [cashEditValue, setCashEditValue] = useState('')
  const [cashSaving, setCashSaving] = useState(false)
  const [cashEditError, setCashEditError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const data = await window.api.dashboard.getPortfolioSnapshot(null)
    setPortfolio(data)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 종목코드가 있는 보유종목의 현재가는 API가 충분히 정확하게 내려주므로, 탭 진입 시
  // 조용히 자동 조회해 이번 달 시세로 저장한다(사용자가 직접 입력할 필요 없음).
  useEffect(() => {
    const activeHoldings = holdings.filter((h) => !h.isArchived && h.priceSymbol)
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

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <h2>자산현황</h2>
          <button type="button" className="ghost-button detail-button" onClick={() => setShowCashOnly((v) => !v)}>
            {showCashOnly ? '전체 보기' : '예수금'}
          </button>
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
                <th className="col-qty">보유수량</th>
                <th>평단가</th>
                <th className="price-col-narrow">현재가</th>
                <th className="col-value">가치</th>
                <th className="col-value">달러가치</th>
                <th>손익</th>
                <th>비중</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.rows.map((r, idx) => (
                <tr key={idx} className={typeRowClass(r.accountTypeLabel)}>
                  <td className="col-type">{r.accountTypeLabel}</td>
                  <td className="col-product">{r.label}</td>
                  <td className="col-qty">{r.quantity != null ? r.quantity.toLocaleString() : '-'}</td>
                  <td>{r.avgCost != null ? formatMoney(r.avgCost, r.currency) : '-'}</td>
                  <td className="price-col-narrow">{r.currentPrice != null ? formatMoney(r.currentPrice, r.currency) : '-'}</td>
                  <td className="col-value value-cell">{formatKrw(r.value)}</td>
                  <td className="col-value">{formatUsdValue(r.currency, r.rawValue)}</td>
                  <td className={r.profit == null ? '' : r.profit >= 0 ? 'gain' : 'loss'}>
                    {r.profit != null ? formatKrw(r.profit) : '-'}
                  </td>
                  <td>{r.weightPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="holdings-total-row">
              <tr>
                <td colSpan={5}>합계</td>
                <td className="value-cell">{formatKrw(portfolio.totalValue)}</td>
                <td></td>
                <td className={portfolio.totalProfit >= 0 ? 'gain' : 'loss'}>
                  {formatKrw(portfolio.totalProfit)}
                </td>
                <td>100.00%</td>
              </tr>
            </tfoot>
          </table>
        )}
        {cashEditError && <p className="error-text">{cashEditError}</p>}
        {portfolio?.pricesUpdatedAt && (
          <p className="prices-updated-at">현재가 마지막 갱신: {formatUpdatedAt(portfolio.pricesUpdatedAt)}</p>
        )}
      </section>
    </div>
  )
}

export default HoldingsPage
