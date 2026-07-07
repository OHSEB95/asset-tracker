import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { PortfolioSnapshot } from '@shared/types'
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

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}


function HoldingsPage(): React.JSX.Element {
  const { holdings } = useAccountsContext()
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)

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

  return (
    <div className="page">
      <section className="card">
        <h2>자산현황</h2>
        {!portfolio || portfolio.rows.length === 0 ? (
          <p className="muted">등록된 계좌/보유종목이 없습니다.</p>
        ) : (
          <table className="data-table compact-table holdings-table">
            <thead>
              <tr>
                <th className="col-type">구분</th>
                <th className="col-product">종목</th>
                <th>보유수량</th>
                <th>평단가</th>
                <th className="price-col-narrow">현재가</th>
                <th className="col-value">가치</th>
                <th>손익</th>
                <th>비중</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.rows.map((r, idx) => (
                <tr key={idx} className={typeRowClass(r.accountTypeLabel)}>
                  <td className="col-type">{r.accountTypeLabel}</td>
                  <td className="col-product">{r.label}</td>
                  <td>{r.quantity != null ? r.quantity.toLocaleString() : '-'}</td>
                  <td>{r.avgCost != null ? formatMoney(r.avgCost, r.currency) : '-'}</td>
                  <td className="price-col-narrow">{r.currentPrice != null ? formatMoney(r.currentPrice, r.currency) : '-'}</td>
                  <td className="col-value value-cell">{formatKrw(r.value)}</td>
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
                <td className={portfolio.totalProfit >= 0 ? 'gain' : 'loss'}>
                  {formatKrw(portfolio.totalProfit)}
                </td>
                <td>100.00%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  )
}

export default HoldingsPage
