import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { Holding, HoldingSnapshot } from '@shared/types'

function formatMoney(value: number | null, currency: 'KRW' | 'USD'): string {
  if (value == null) return '-'
  if (currency === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${Math.round(value).toLocaleString()}원`
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function HoldingsPage(): React.JSX.Element {
  const { accountTypes, accounts, holdings } = useAccountsContext()
  const [snapshots, setSnapshots] = useState<Record<number, HoldingSnapshot>>({})
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const activeHoldings = holdings.filter((h) => !h.isArchived)

  useEffect(() => {
    if (activeHoldings.length === 0) {
      setSnapshots({})
      return
    }
    Promise.all(activeHoldings.map((h) => window.api.holdings.snapshot(h.id))).then((list) => {
      const map: Record<number, HoldingSnapshot> = {}
      list.forEach((s) => (map[s.holdingId] = s))
      setSnapshots(map)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings])

  // 탭 진입 시 심볼이 있는 종목의 현재가를 조용히 자동 조회해 채워둔다.
  useEffect(() => {
    activeHoldings.forEach((h) => {
      if (!h.priceSymbol) return
      window.api.prices.fetch(h.id).then((result) => {
        if ('error' in result) return
        const value =
          result.currency === 'USD' ? result.price.toFixed(2) : String(Math.round(result.price))
        setPriceInputs((prev) => ({ ...prev, [h.id]: value }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings])

  function currencyOf(h: Holding): 'KRW' | 'USD' {
    const acct = accounts.find((a) => a.id === h.accountId)
    return acct?.accountTypeCode === 'FOREIGN_STOCK' ? 'USD' : 'KRW'
  }

  async function handleBulkSave(): Promise<void> {
    setSaving(true)
    try {
      const yearMonth = currentYearMonth()
      const targets = activeHoldings.filter((h) => {
        const value = parseFloat(priceInputs[h.id] ?? '')
        return Number.isFinite(value) && value > 0
      })
      await Promise.all(
        targets.map((h) =>
          window.api.priceSnapshots.upsert({
            holdingId: h.id,
            yearMonth,
            price: parseFloat(priceInputs[h.id]),
            source: 'manual'
          })
        )
      )
      const list = await Promise.all(targets.map((h) => window.api.holdings.snapshot(h.id)))
      setSnapshots((prev) => {
        const next = { ...prev }
        list.forEach((s) => (next[s.holdingId] = s))
        return next
      })
    } finally {
      setSaving(false)
    }
  }

  const orderedAccounts = [...accounts].sort((a, b) => {
    const ta = accountTypes.find((t) => t.code === a.accountTypeCode)?.sortOrder ?? 0
    const tb = accountTypes.find((t) => t.code === b.accountTypeCode)?.sortOrder ?? 0
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name)
  })

  const rows = orderedAccounts.flatMap((acct) => {
    const typeLabel = accountTypes.find((t) => t.code === acct.accountTypeCode)?.labelKo ?? ''
    return activeHoldings
      .filter((h) => h.accountId === acct.id)
      .map((h) => ({ account: acct, typeLabel, holding: h }))
  })

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <h2>보유종목</h2>
          <button type="button" onClick={handleBulkSave} disabled={saving || rows.length === 0}>
            {saving ? '저장 중…' : '일괄 저장'}
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted">등록된 보유종목이 없습니다.</p>
        ) : (
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>계좌유형</th>
                <th>계좌명</th>
                <th>종목</th>
                <th>보유수량</th>
                <th>평단가</th>
                <th>현재가</th>
                <th>수익률</th>
                <th>수익금</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, typeLabel, holding }) => {
                const currency = currencyOf(holding)
                const snap = snapshots[holding.id]
                const rawInput = priceInputs[holding.id] ?? ''
                const currentPriceNum = parseFloat(rawInput)
                const hasCurrentPrice = Number.isFinite(currentPriceNum) && currentPriceNum > 0
                const profitRate =
                  snap && snap.avgCost && hasCurrentPrice
                    ? ((currentPriceNum - snap.avgCost) / snap.avgCost) * 100
                    : null
                const profitAmount =
                  snap && snap.avgCost != null && snap.quantity > 0 && hasCurrentPrice
                    ? (currentPriceNum - snap.avgCost) * snap.quantity
                    : null
                return (
                  <tr key={holding.id}>
                    <td>{typeLabel}</td>
                    <td>{account.name}</td>
                    <td>{holding.name}</td>
                    <td>{snap ? snap.quantity.toLocaleString() : '-'}</td>
                    <td>
                      {snap && snap.avgCost != null
                        ? formatMoney(snap.avgCost, currency)
                        : '-'}
                    </td>
                    <td className="valuation-cell">
                      <input
                        type="number"
                        value={rawInput}
                        onChange={(e) =>
                          setPriceInputs((prev) => ({ ...prev, [holding.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className={profitRate == null ? '' : profitRate >= 0 ? 'gain' : 'loss'}>
                      {profitRate != null ? `${profitRate.toFixed(2)}%` : '-'}
                    </td>
                    <td className={profitAmount == null ? '' : profitAmount >= 0 ? 'gain' : 'loss'}>
                      {profitAmount != null ? formatMoney(profitAmount, currency) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default HoldingsPage
