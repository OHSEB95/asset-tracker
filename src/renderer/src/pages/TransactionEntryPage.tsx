import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import { useExchangeRateContext } from '../state/ExchangeRateContext'
import type { Transaction, TransactionInput, TransactionType } from '@shared/types'

const TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
  BUY: '매수',
  SELL: '매도',
  ADJUST: '정리',
  DIVIDEND: '배당'
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatMoney(value: number | null, currency: 'KRW' | 'USD'): string {
  if (value == null) return '-'
  if (currency === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${Math.round(value).toLocaleString()}원`
}

function TransactionEntryPage(): React.JSX.Element {
  const { accountTypes, accounts, holdings, refresh } = useAccountsContext()
  const { rate } = useExchangeRateContext()

  const [accountId, setAccountId] = useState<number | null>(null)
  const [date, setDate] = useState(todayDate())
  const [type, setType] = useState<TransactionType>('DEPOSIT')
  const [adjustTarget, setAdjustTarget] = useState<'holding' | 'cash'>('holding')
  const [holdingId, setHoldingId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [inputInKrw, setInputInKrw] = useState(false)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (accountId == null && accounts.length > 0) {
      setAccountId(accounts[0].id)
    }
  }, [accounts, accountId])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isForeignAccount = selectedAccount?.accountTypeCode === 'FOREIGN_STOCK'
  const accountHoldings = holdings.filter((h) => h.accountId === accountId && !h.isArchived)

  useEffect(() => {
    setInputInKrw(false)
  }, [accountId])

  useEffect(() => {
    if (accountId == null) return
    window.api.transactions.listForAccount({ accountId }).then(setTransactions)
  }, [accountId])

  useEffect(() => {
    if (type !== 'ADJUST') setAdjustTarget('holding')
  }, [type])

  const isHoldingShaped =
    type === 'BUY' || type === 'SELL' || (type === 'ADJUST' && adjustTarget === 'holding')
  const isCashShaped =
    type === 'DEPOSIT' ||
    type === 'WITHDRAWAL' ||
    type === 'DIVIDEND' ||
    (type === 'ADJUST' && adjustTarget === 'cash')

  // 해외주식 계좌는 항상 USD가 저장 기준. inputInKrw는 입력/표시 시점의 변환 방향만 바꾼다.
  function toStoredAmount(rawInput: string): number {
    const parsed = parseFloat(rawInput)
    if (isForeignAccount && inputInKrw && rate) return parsed / rate
    return parsed
  }

  function displayMoney(value: number | null): string {
    if (value == null) return '-'
    if (!isForeignAccount) return formatMoney(value, 'KRW')
    if (inputInKrw && rate) return formatMoney(value * rate, 'KRW')
    return formatMoney(value, 'USD')
  }

  function resetForm(): void {
    setQuantity('')
    setPrice('')
    setAmount('')
    setNote('')
    setHoldingId(null)
    setAdjustTarget('holding')
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
    if (isHoldingShaped) {
      input.holdingId = holdingId
      input.quantity = parseFloat(quantity)
      input.price = toStoredAmount(price)
    } else {
      input.amount = toStoredAmount(amount)
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

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <h2>거래 입력</h2>
          {isForeignAccount && (
            <button
              type="button"
              className="ghost-button currency-toggle"
              onClick={() => setInputInKrw((v) => !v)}
            >
              {inputInKrw ? 'KRW 환산 입력 중 (누르면 USD로)' : 'USD 입력 중 (누르면 KRW 환산으로)'}
            </button>
          )}
        </div>
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

          {type === 'ADJUST' && (
            <label className="field-type">
              정리 대상
              <select
                value={adjustTarget}
                onChange={(e) => setAdjustTarget(e.target.value as 'holding' | 'cash')}
              >
                <option value="holding">종목</option>
                <option value="cash">예수금</option>
              </select>
            </label>
          )}

          {isHoldingShaped && (
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
                단가{isForeignAccount ? (inputInKrw ? ' (₩)' : ' ($)') : ''}
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
            </>
          )}

          {isCashShaped && (
            <label className="field-amount">
              금액{isForeignAccount ? (inputInKrw ? ' (₩)' : ' ($)') : ''}
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

          {isHoldingShaped &&
            quantity &&
            price &&
            !Number.isNaN(parseFloat(quantity) * toStoredAmount(price)) && (
              <p className="muted field-hint">
                {type === 'ADJUST'
                  ? '정리 (예수금 변동 없음)'
                  : type === 'SELL'
                    ? '예수금 증가'
                    : '예수금 차감'}
                :{' '}
                {type === 'ADJUST'
                  ? displayMoney(0)
                  : displayMoney(parseFloat(quantity) * toStoredAmount(price))}
              </p>
            )}

          {type === 'ADJUST' &&
            adjustTarget === 'cash' &&
            amount &&
            !Number.isNaN(toStoredAmount(amount)) && (
              <p className="muted field-hint">
                정리 (예수금 증가): {displayMoney(toStoredAmount(amount))}
              </p>
            )}
        </form>
        {formError && <p className="error-text">{formError}</p>}
      </section>

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
                  <td>{t.price != null ? displayMoney(t.price) : '-'}</td>
                  <td>
                    {t.amount != null
                      ? displayMoney(t.amount)
                      : t.quantity != null && t.price != null
                        ? displayMoney(t.quantity * t.price)
                        : '-'}
                  </td>
                  <td>{t.realizedPnl != null ? displayMoney(t.realizedPnl) : '-'}</td>
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
