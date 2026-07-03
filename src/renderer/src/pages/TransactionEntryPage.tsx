import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import { useExchangeRateContext } from '../state/ExchangeRateContext'
import NumberInput from '../components/NumberInput'
import type {
  Transaction,
  TransactionInput,
  TransactionListFilter,
  TransactionType
} from '@shared/types'

const TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
  BUY: '매수',
  SELL: '매도',
  ADJUST: '정리',
  DIVIDEND: '배당',
  CLOSE: '해지'
}

const STOCK_TYPE_CODES: TransactionType[] = ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'ADJUST', 'DIVIDEND']
const SAVINGS_TYPE_CODES: TransactionType[] = ['DEPOSIT', 'WITHDRAWAL', 'ADJUST', 'CLOSE']

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

  const [assetTypeCode, setAssetTypeCode] = useState('')
  const [secondaryAccountId, setSecondaryAccountId] = useState<number | null>(null)
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
  const [closeBalance, setCloseBalance] = useState<number | null>(null)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isAllSelected = assetTypeCode === ''
  const matchingAccounts = accounts.filter((a) => a.accountTypeCode === assetTypeCode)
  const resolvedAccountId =
    matchingAccounts.length === 1 ? matchingAccounts[0].id : matchingAccounts.length > 1 ? secondaryAccountId : null

  const selectedAccount = accounts.find((a) => a.id === resolvedAccountId)
  const isForeignAccount = selectedAccount?.accountTypeCode === 'FOREIGN_STOCK'
  const isSavingsAccount = selectedAccount?.accountTypeCode === 'YOUTH_SAVINGS'
  const accountHoldings = holdings.filter((h) => h.accountId === resolvedAccountId && !h.isArchived)

  useEffect(() => {
    setSecondaryAccountId(null)
  }, [assetTypeCode])

  useEffect(() => {
    setInputInKrw(false)
  }, [resolvedAccountId])

  useEffect(() => {
    if (isSavingsAccount && (type === 'BUY' || type === 'SELL' || type === 'DIVIDEND')) {
      setType('DEPOSIT')
    }
    if (!isSavingsAccount && type === 'CLOSE') {
      setType('DEPOSIT')
    }
  }, [isSavingsAccount, type])

  useEffect(() => {
    if (type !== 'ADJUST') setAdjustTarget('holding')
  }, [type])

  useEffect(() => {
    if (isSavingsAccount && type === 'CLOSE' && holdingId != null) {
      window.api.holdings.snapshot(holdingId).then((s) => setCloseBalance(s.currentValuation))
    } else {
      setCloseBalance(null)
    }
  }, [isSavingsAccount, type, holdingId])

  function buildFilter(): TransactionListFilter | null {
    if (isAllSelected) return {}
    if (resolvedAccountId != null) return { accountId: resolvedAccountId }
    if (matchingAccounts.length > 1) return { accountTypeCode: assetTypeCode }
    return null
  }

  useEffect(() => {
    let cancelled = false
    const filter = buildFilter()
    if (filter == null) {
      setTransactions([])
      return
    }
    window.api.transactions.list(filter).then((list) => {
      if (!cancelled) setTransactions(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTypeCode, resolvedAccountId, matchingAccounts.length])

  const isHoldingShapedStock =
    !isSavingsAccount &&
    (type === 'BUY' || type === 'SELL' || (type === 'ADJUST' && adjustTarget === 'holding'))
  const isCashShapedStock =
    !isSavingsAccount &&
    (type === 'DEPOSIT' ||
      type === 'WITHDRAWAL' ||
      type === 'DIVIDEND' ||
      (type === 'ADJUST' && adjustTarget === 'cash'))

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

  function currencyForTx(t: Transaction): 'KRW' | 'USD' {
    const acct = accounts.find((a) => a.id === t.accountId)
    return acct?.accountTypeCode === 'FOREIGN_STOCK' ? 'USD' : 'KRW'
  }

  function displayMoneyForTx(t: Transaction, value: number | null): string {
    if (value == null) return '-'
    if (!isAllSelected) return displayMoney(value)
    return formatMoney(value, currencyForTx(t))
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
    const filter = buildFilter()
    if (filter == null) {
      setTransactions([])
      return
    }
    const list = await window.api.transactions.list(filter)
    setTransactions(list)
  }

  // 종목 거래(매수/매도/정리) 저장 후 시세를 자동 조회해 이번 달 현재가로 저장해둔다.
  async function autoUpdateHoldingPrice(hId: number): Promise<void> {
    const holding = holdings.find((h) => h.id === hId)
    if (!holding?.priceSymbol) return
    const result = await window.api.prices.fetch(hId)
    if ('error' in result) return
    await window.api.priceSnapshots.upsert({
      holdingId: hId,
      yearMonth: currentYearMonth(),
      price: result.price,
      source: result.source
    })
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (resolvedAccountId == null) return
    setFormError(null)
    setSaving(true)

    const input: TransactionInput = {
      accountId: resolvedAccountId,
      type,
      date,
      note: note || null
    }
    if (isSavingsAccount) {
      input.holdingId = holdingId
      input.amount = type === 'CLOSE' ? (closeBalance ?? 0) : parseFloat(amount)
    } else if (isHoldingShapedStock) {
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
      if (isHoldingShapedStock && input.holdingId) {
        await autoUpdateHoldingPrice(input.holdingId)
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

  function renderHint(): React.JSX.Element | null {
    if (isSavingsAccount) {
      if (type === 'CLOSE') {
        if (closeBalance == null) return null
        return <p className="muted field-hint">해지 (전액 출금): {displayMoney(closeBalance)}</p>
      }
      const amt = parseFloat(amount)
      if (!amount || Number.isNaN(amt)) return null
      const label =
        type === 'DEPOSIT'
          ? '입금 (상품 잔액 증가)'
          : type === 'WITHDRAWAL'
            ? '출금 (상품 잔액 감소)'
            : '정리 (상품 잔액 등록, 신규입금 아님)'
      return (
        <p className="muted field-hint">
          {label}: {displayMoney(amt)}
        </p>
      )
    }
    if (isHoldingShapedStock && quantity && price && !Number.isNaN(parseFloat(quantity) * toStoredAmount(price))) {
      return (
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
      )
    }
    if (type === 'ADJUST' && adjustTarget === 'cash' && amount && !Number.isNaN(toStoredAmount(amount))) {
      return (
        <p className="muted field-hint">정리 (예수금 증가): {displayMoney(toStoredAmount(amount))}</p>
      )
    }
    return null
  }

  const visibleTypeCodes = isSavingsAccount ? SAVINGS_TYPE_CODES : STOCK_TYPE_CODES
  const hideStockColumns = isSavingsAccount
  const productLabel = isSavingsAccount ? '상품명' : '종목'
  const canSubmit =
    !saving &&
    resolvedAccountId != null &&
    !(isSavingsAccount && type === 'CLOSE' && (closeBalance == null || closeBalance <= 0))

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <h2>거래 내역</h2>
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

        <div className="tx-form">
          <label className="field-type">
            자산유형
            <select value={assetTypeCode} onChange={(e) => setAssetTypeCode(e.target.value)}>
              <option value="">전체</option>
              {accountTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.labelKo}
                </option>
              ))}
            </select>
          </label>
          {!isAllSelected && matchingAccounts.length > 1 && (
            <label className="field-account">
              계좌명
              <select
                value={secondaryAccountId ?? ''}
                onChange={(e) => setSecondaryAccountId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">선택</option>
                {matchingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {isAllSelected && <p className="muted">새 거래를 입력하려면 자산유형을 선택하세요.</p>}
        {!isAllSelected && matchingAccounts.length === 0 && (
          <p className="muted">이 자산유형에 등록된 계좌가 없습니다. 설정에서 계좌를 추가해주세요.</p>
        )}

        {resolvedAccountId != null && (
          <form onSubmit={handleSubmit} className="tx-form">
            <label className="field-date">
              날짜
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field-type">
              거래유형
              <select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                {visibleTypeCodes.map((code) => (
                  <option key={code} value={code}>
                    {TYPE_LABEL[code]}
                  </option>
                ))}
              </select>
            </label>

            {!isSavingsAccount && type === 'ADJUST' && (
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

            {isSavingsAccount && (
              <label className="field-holding">
                상품명
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
            )}

            {isHoldingShapedStock && (
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
                  <NumberInput value={quantity} onChange={setQuantity} />
                </label>
                <label className="field-price">
                  단가{isForeignAccount ? (inputInKrw ? ' (₩)' : ' ($)') : ''}
                  <NumberInput value={price} onChange={setPrice} />
                </label>
              </>
            )}

            {isCashShapedStock && (
              <label className="field-amount">
                금액{isForeignAccount ? (inputInKrw ? ' (₩)' : ' ($)') : ''}
                <NumberInput value={amount} onChange={setAmount} />
              </label>
            )}

            {isSavingsAccount && type !== 'CLOSE' && (
              <label className="field-amount">
                금액
                <NumberInput value={amount} onChange={setAmount} />
              </label>
            )}

            {isSavingsAccount && type === 'CLOSE' && (
              <div className="field-amount">
                <span>해지 금액</span>
                <div>
                  {closeBalance != null ? displayMoney(closeBalance) : '조회 중…'} (현재 잔액 전액)
                </div>
              </div>
            )}

            {type === 'DIVIDEND' && !isSavingsAccount && accountHoldings.length > 0 && (
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
              <button type="submit" disabled={!canSubmit}>
                {saving ? '저장 중…' : '거래 저장'}
              </button>
            </div>

            {renderHint()}
          </form>
        )}
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
                <th>{productLabel}</th>
                {!hideStockColumns && <th>수량</th>}
                {!hideStockColumns && <th>단가</th>}
                <th>금액</th>
                {!hideStockColumns && <th>매도손익</th>}
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
                  {!hideStockColumns && (
                    <td>{t.quantity != null ? t.quantity.toLocaleString() : '-'}</td>
                  )}
                  {!hideStockColumns && <td>{t.price != null ? displayMoneyForTx(t, t.price) : '-'}</td>}
                  <td>
                    {t.amount != null
                      ? displayMoneyForTx(t, t.amount)
                      : t.quantity != null && t.price != null
                        ? displayMoneyForTx(t, t.quantity * t.price)
                        : '-'}
                  </td>
                  {!hideStockColumns && (
                    <td>{t.realizedPnl != null ? displayMoneyForTx(t, t.realizedPnl) : '-'}</td>
                  )}
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
