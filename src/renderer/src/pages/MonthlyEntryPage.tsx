import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { MonthlyEntry, MonthlyEntryInput } from '@shared/types'

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

type RowState = {
  contribution: string
  dividends: string
  realizedPnl: string
  valuation: string
  holdingQuantity: string
}

function emptyRow(): RowState {
  return { contribution: '0', dividends: '0', realizedPnl: '0', valuation: '0', holdingQuantity: '' }
}

function entryToRow(entry: MonthlyEntry): RowState {
  return {
    contribution: String(entry.contribution),
    dividends: String(entry.dividends),
    realizedPnl: String(entry.realizedPnl),
    valuation: String(entry.valuation),
    holdingQuantity: entry.holdingQuantity != null ? String(entry.holdingQuantity) : ''
  }
}

function MonthlyEntryPage(): React.JSX.Element {
  const { accountTypes, accounts } = useAccountsContext()
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [fetchingId, setFetchingId] = useState<number | null>(null)
  const [priceMessage, setPriceMessage] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    window.api.entries.listByMonth(yearMonth).then((entries) => {
      if (cancelled) return
      const byAccount: Record<number, RowState> = {}
      for (const acct of accounts) {
        const existing = entries.find((e) => e.accountId === acct.id)
        byAccount[acct.id] = existing ? entryToRow(existing) : emptyRow()
      }
      setRows(byAccount)
    })
    return () => {
      cancelled = true
    }
  }, [yearMonth, accounts])

  function updateField(accountId: number, field: keyof RowState, value: string): void {
    setRows((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] ?? emptyRow()), [field]: value }
    }))
  }

  async function handleAutoFetch(accountId: number): Promise<void> {
    setFetchingId(accountId)
    setPriceMessage((prev) => ({ ...prev, [accountId]: '' }))
    try {
      const result = await window.api.prices.fetch(accountId)
      if ('error' in result) {
        setPriceMessage((prev) => ({ ...prev, [accountId]: result.error }))
        return
      }
      const row = rows[accountId] ?? emptyRow()
      const qty = parseFloat(row.holdingQuantity)
      const valuation = Number.isFinite(qty) && qty > 0 ? qty * result.price : result.price
      setRows((prev) => ({
        ...prev,
        [accountId]: { ...row, valuation: String(Math.round(valuation)) }
      }))
      setPriceMessage((prev) => ({
        ...prev,
        [accountId]: `현재가 ${result.price.toLocaleString()}원 (${result.source}) 기준으로 계산됨`
      }))
    } finally {
      setFetchingId(null)
    }
  }

  async function handleSave(accountId: number): Promise<void> {
    const row = rows[accountId] ?? emptyRow()
    setSavingId(accountId)
    const input: MonthlyEntryInput = {
      accountId,
      yearMonth,
      contribution: parseFloat(row.contribution) || 0,
      dividends: parseFloat(row.dividends) || 0,
      realizedPnl: parseFloat(row.realizedPnl) || 0,
      valuation: parseFloat(row.valuation) || 0,
      holdingQuantity: row.holdingQuantity ? parseFloat(row.holdingQuantity) : null
    }
    try {
      await window.api.entries.upsert(input)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="page">
      <section className="card">
        <h2>월별 데이터 입력</h2>
        <label className="month-picker">
          월 선택
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
        </label>
      </section>

      {accounts.length === 0 && (
        <p className="muted">먼저 설정 화면에서 계좌를 추가해주세요.</p>
      )}

      {accountTypes.map((type) => {
        const typeAccounts = accounts.filter((a) => a.accountTypeCode === type.code)
        if (typeAccounts.length === 0) return null
        return (
          <section className="card" key={type.code}>
            <h3>{type.labelKo}</h3>
            <table className="data-table entry-table">
              <thead>
                <tr>
                  <th>계좌</th>
                  <th>납입액</th>
                  <th>배당</th>
                  <th>매도손익</th>
                  {type.isMarketPriced && <th>보유수량</th>}
                  <th>평가금액</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {typeAccounts.map((acct) => {
                  const row = rows[acct.id] ?? emptyRow()
                  return (
                    <tr key={acct.id}>
                      <td>{acct.name}</td>
                      <td>
                        <input
                          type="number"
                          value={row.contribution}
                          onChange={(e) => updateField(acct.id, 'contribution', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.dividends}
                          onChange={(e) => updateField(acct.id, 'dividends', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.realizedPnl}
                          onChange={(e) => updateField(acct.id, 'realizedPnl', e.target.value)}
                        />
                      </td>
                      {type.isMarketPriced && (
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={row.holdingQuantity}
                            onChange={(e) =>
                              updateField(acct.id, 'holdingQuantity', e.target.value)
                            }
                          />
                        </td>
                      )}
                      <td className="valuation-cell">
                        <input
                          type="number"
                          value={row.valuation}
                          onChange={(e) => updateField(acct.id, 'valuation', e.target.value)}
                        />
                        {type.isMarketPriced && acct.symbol && (
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={fetchingId === acct.id}
                            onClick={() => handleAutoFetch(acct.id)}
                          >
                            {fetchingId === acct.id ? '조회 중…' : '자동조회'}
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleSave(acct.id)}
                          disabled={savingId === acct.id}
                        >
                          {savingId === acct.id ? '저장 중…' : '저장'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {typeAccounts.some((a) => priceMessage[a.id]) && (
              <p className="muted">
                {typeAccounts.map((a) => priceMessage[a.id]).filter(Boolean).join(' / ')}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

export default MonthlyEntryPage
