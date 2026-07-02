import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { HoldingSnapshot, Transaction, TransactionInput, TransactionType } from '@shared/types'

const TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
  BUY: '매수',
  SELL: '매도',
  DIVIDEND: '배당'
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatWon(value: number | null): string {
  if (value == null) return '-'
  return `${Math.round(value).toLocaleString()}원`
}

function TransactionEntryPage(): React.JSX.Element {
  const { accountTypes, accounts, holdings, refresh } = useAccountsContext()

  const [accountId, setAccountId] = useState<number | null>(null)
  const [date, setDate] = useState(todayDate())
  const [type, setType] = useState<TransactionType>('DEPOSIT')
  const [holdingId, setHoldingId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [snapshots, setSnapshots] = useState<Record<number, HoldingSnapshot>>({})
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})
  const [fetchingHoldingId, setFetchingHoldingId] = useState<number | null>(null)
  const [priceMessage, setPriceMessage] = useState<Record<number, string>>({})
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (accountId == null && accounts.length > 0) {
      setAccountId(accounts[0].id)
    }
  }, [accounts, accountId])

  const accountHoldings = holdings.filter((h) => h.accountId === accountId && !h.isArchived)

  useEffect(() => {
    if (accountId == null) return
    window.api.transactions.listForAccount({ accountId }).then(setTransactions)
  }, [accountId])

  useEffect(() => {
    if (accountHoldings.length === 0) {
      setSnapshots({})
      return
    }
    Promise.all(accountHoldings.map((h) => window.api.holdings.snapshot(h.id))).then((list) => {
      const map: Record<number, HoldingSnapshot> = {}
      list.forEach((s) => (map[s.holdingId] = s))
      setSnapshots(map)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, holdings])

  function resetForm(): void {
    setQuantity('')
    setPrice('')
    setAmount('')
    setNote('')
    setHoldingId(null)
    setFormError(null)
  }

  async function reloadTransactions(): Promise<void> {
    if (accountId == null) return
    const list = await window.api.transactions.listForAccount({ accountId })
    setTransactions(list)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (accountId == null) return
    setFormError(null)
    setSaving(true)

    const input: TransactionInput = {
      accountId,
      type,
      date,
      note: note || null
    }
    if (type === 'BUY' || type === 'SELL') {
      input.holdingId = holdingId
      input.quantity = parseFloat(quantity)
      input.price = parseFloat(price)
    } else {
      input.amount = parseFloat(amount)
      if (type === 'DIVIDEND') input.holdingId = holdingId
    }

    try {
      const result = await window.api.transactions.create(input)
      if ('error' in result) {
        setFormError(result.error)
        return
      }
      resetForm()
      await reloadTransactions()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setDeleteError(null)
    const result = await window.api.transactions.delete(id)
    if ('error' in result) {
      setDeleteError(result.error)
      return
    }
    await reloadTransactions()
    await refresh()
  }

  async function handleAutoFetchPrice(hId: number): Promise<void> {
    setFetchingHoldingId(hId)
    setPriceMessage((prev) => ({ ...prev, [hId]: '' }))
    try {
      const result = await window.api.prices.fetch(hId)
      if ('error' in result) {
        setPriceMessage((prev) => ({ ...prev, [hId]: result.error }))
        return
      }
      setPriceInputs((prev) => ({ ...prev, [hId]: String(Math.round(result.price)) }))
      setPriceMessage((prev) => ({
        ...prev,
        [hId]: `현재가 ${result.price.toLocaleString()}원 (${result.source})`
      }))
    } finally {
      setFetchingHoldingId(null)
    }
  }

  async function handleSavePriceSnapshot(hId: number): Promise<void> {
    const value = parseFloat(priceInputs[hId] ?? '')
    if (!Number.isFinite(value) || value <= 0) return
    await window.api.priceSnapshots.upsert({
      holdingId: hId,
      yearMonth: currentYearMonth(),
      price: value,
      source: 'manual'
    })
    const snap = await window.api.holdings.snapshot(hId)
    setSnapshots((prev) => ({ ...prev, [hId]: snap }))
    setPriceMessage((prev) => ({ ...prev, [hId]: '이번 달 시세로 저장됨' }))
  }

  return (
    <div className="page">
      <section className="card">
        <h2>거래 입력</h2>
        <form onSubmit={handleSubmit} className="tx-form">
          <label className="field-date">
            날짜
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-account">
            계좌
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              {accountTypes.map((t) => {
                const typeAccounts = accounts.filter((a) => a.accountTypeCode === t.code)
                if (typeAccounts.length === 0) return null
                return (
                  <optgroup key={t.code} label={t.labelKo}>
                    {typeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </label>
          <label className="field-type">
            거래유형
            <select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              {Object.entries(TYPE_LABEL).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {(type === 'BUY' || type === 'SELL') && (
            <>
              <label className="field-holding">
                종목
                <select
                  value={holdingId ?? ''}
                  onChange={(e) => setHoldingId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">선택</option>
                  {accountHoldings.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-qty">
                수량
                <input
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label className="field-price">
                단가
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
            </>
          )}

          {(type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') && (
            <label className="field-amount">
              금액
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          )}

          {type === 'DIVIDEND' && accountHoldings.length > 0 && (
            <label className="field-holding">
              종목 (선택)
              <select
                value={holdingId ?? ''}
                onChange={(e) => setHoldingId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">계좌 전체</option>
                {accountHoldings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field-note">
            메모
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="form-actions field-actions">
            <button type="submit" disabled={saving || accountId == null}>
              {saving ? '저장 중…' : '거래 저장'}
            </button>
          </div>

          {(type === 'BUY' || type === 'SELL') &&
            quantity &&
            price &&
            !Number.isNaN(parseFloat(quantity) * parseFloat(price)) && (
              <p className="muted field-hint">
                {type === 'BUY' ? '예수금 차감' : '예수금 증가'}:{' '}
                {formatWon(parseFloat(quantity) * parseFloat(price))}
              </p>
            )}
        </form>
        {formError && <p className="error-text">{formError}</p>}
      </section>

      {accountHoldings.length > 0 && (
        <section className="card">
          <h3>현재가 갱신</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>종목</th>
                <th>보유수량</th>
                <th>평단가</th>
                <th>이번 달 시세</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accountHoldings.map((h) => {
                const snap = snapshots[h.id]
                return (
                  <tr key={h.id}>
                    <td>{h.name}</td>
                    <td>{snap ? snap.quantity.toLocaleString() : '-'}</td>
                    <td>
                      {snap && snap.quantity > 0 && snap.avgCost != null
                        ? formatWon(snap.avgCost)
                        : snap && snap.avgCost != null
                          ? `${formatWon(snap.avgCost)} (전량 매도)`
                          : '-'}
                    </td>
                    <td className="valuation-cell">
                      <input
                        type="number"
                        value={priceInputs[h.id] ?? ''}
                        onChange={(e) =>
                          setPriceInputs((prev) => ({ ...prev, [h.id]: e.target.value }))
                        }
                      />
                      {h.priceSymbol && (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={fetchingHoldingId === h.id}
                          onClick={() => handleAutoFetchPrice(h.id)}
                        >
                          {fetchingHoldingId === h.id ? '조회 중…' : '자동조회'}
                        </button>
                      )}
                    </td>
                    <td>
                      <button type="button" onClick={() => handleSavePriceSnapshot(h.id)}>
                        저장
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {accountHoldings.some((h) => priceMessage[h.id]) && (
            <p className="muted">
              {accountHoldings.map((h) => priceMessage[h.id]).filter(Boolean).join(' / ')}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h3>최근 거래</h3>
        {deleteError && <p className="error-text">{deleteError}</p>}
        {transactions.length === 0 ? (
          <p className="muted">아직 입력된 거래가 없습니다.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>유형</th>
                <th>종목</th>
                <th>수량</th>
                <th>단가</th>
                <th>금액</th>
                <th>매도손익</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{TYPE_LABEL[t.type]}</td>
                  <td>{holdings.find((h) => h.id === t.holdingId)?.name ?? '-'}</td>
                  <td>{t.quantity != null ? t.quantity.toLocaleString() : '-'}</td>
                  <td>{t.price != null ? formatWon(t.price) : '-'}</td>
                  <td>
                    {t.amount != null
                      ? formatWon(t.amount)
                      : t.quantity != null && t.price != null
                        ? formatWon(t.quantity * t.price)
                        : '-'}
                  </td>
                  <td>{t.realizedPnl != null ? formatWon(t.realizedPnl) : '-'}</td>
                  <td>{t.note ?? '-'}</td>
                  <td>
                    <button type="button" onClick={() => handleDelete(t.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default TransactionEntryPage
