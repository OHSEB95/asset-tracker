import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import { useExchangeRateContext } from '../state/ExchangeRateContext'
import NumberInput from '../components/NumberInput'
import type { Account, Holding, HoldingSnapshot } from '@shared/types'

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
  const { accountTypes, accounts, holdings } = useAccountsContext()
  const { rate } = useExchangeRateContext()
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

  function accountOf(h: Holding): Account | undefined {
    return accounts.find((a) => a.id === h.accountId)
  }

  function isSavings(h: Holding): boolean {
    return accountOf(h)?.accountTypeCode === 'YOUTH_SAVINGS'
  }

  function currencyOf(h: Holding): 'KRW' | 'USD' {
    return accountOf(h)?.accountTypeCode === 'FOREIGN_STOCK' ? 'USD' : 'KRW'
  }

  async function handleBulkSave(): Promise<void> {
    setSaving(true)
    try {
      const yearMonth = currentYearMonth()
      const targets = activeHoldings.filter((h) => {
        if (isSavings(h)) return false
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

  const rows = activeHoldings
    .map((holding) => {
      const account = accountOf(holding)
      const typeLabel = accountTypes.find((t) => t.code === account?.accountTypeCode)?.labelKo ?? ''
      const savings = isSavings(holding)
      const currency = currencyOf(holding)
      const fx = currency === 'USD' ? (rate ?? 1) : 1
      const snap = snapshots[holding.id]
      const rawInput = priceInputs[holding.id] ?? ''
      const currentPriceNum = parseFloat(rawInput)
      const hasCurrentPrice = Number.isFinite(currentPriceNum) && currentPriceNum > 0

      const value = savings
        ? (snap?.currentValuation ?? 0)
        : snap && snap.quantity != null && snap.quantity > 0 && hasCurrentPrice
          ? snap.quantity * currentPriceNum * fx
          : 0

      return { account, typeLabel, holding, savings, currency, snap, rawInput, currentPriceNum, hasCurrentPrice, value }
    })
    .filter((r) => r.account != null)
    .sort((a, b) => b.value - a.value)

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
          <table className="data-table compact-table holdings-table">
            <thead>
              <tr>
                <th className="col-type">계좌유형</th>
                <th className="col-account">계좌명</th>
                <th className="col-product">종목/상품</th>
                <th>보유수량</th>
                <th>평단가</th>
                <th className="price-col-narrow">현재가</th>
                <th className="col-value">가치</th>
                <th>수익률</th>
                <th>수익금</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, typeLabel, holding, savings, currency, snap, rawInput, currentPriceNum, hasCurrentPrice, value }) => {
                const profitRate =
                  !savings && snap && snap.avgCost && hasCurrentPrice
                    ? ((currentPriceNum - snap.avgCost) / snap.avgCost) * 100
                    : null
                const profitAmount =
                  !savings && snap && snap.avgCost != null && snap.quantity != null && snap.quantity > 0 && hasCurrentPrice
                    ? (currentPriceNum - snap.avgCost) * snap.quantity
                    : null
                return (
                  <tr key={holding.id}>
                    <td className="col-type">{typeLabel}</td>
                    <td className="col-account">{account?.name}</td>
                    <td className="col-product">{holding.name}</td>
                    <td>{!savings && snap?.quantity != null ? snap.quantity.toLocaleString() : '-'}</td>
                    <td>{!savings && snap?.avgCost != null ? formatMoney(snap.avgCost, currency) : '-'}</td>
                    <td className="valuation-cell price-col-narrow">
                      {savings ? (
                        <span className="price-placeholder">-</span>
                      ) : (
                        <NumberInput
                          value={rawInput}
                          onChange={(v) => setPriceInputs((prev) => ({ ...prev, [holding.id]: v }))}
                        />
                      )}
                    </td>
                    <td className="col-value value-cell">{formatKrw(value)}</td>
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
