import { Fragment, useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import { useAuthContext } from '../state/AuthContext'
import NumberInput from '../components/NumberInput'
import type { AccountInput, DividendCycleType, Holding, HoldingInput, HoldingSnapshot, PriceSource } from '@shared/types'

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  coingecko: '코인게코 (비트코인 등)',
  naver: '네이버 금융 (국내주식)',
  yahoo: '야후 파이낸스 (해외주식)'
}

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function emptyAccountForm(defaultType: string): AccountInput {
  return { accountTypeCode: defaultType, name: '' }
}

function emptyHoldingForm(accountId: number): HoldingInput {
  return { accountId, name: '', priceSymbol: '', priceSource: null }
}

function formatDividendInfo(h: Holding, isForeign: boolean): string {
  if (h.dividendPerShare == null || !h.dividendCycleType) return '-'
  const amount = isForeign
    ? `$${h.dividendPerShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${h.dividendPerShare.toLocaleString()}원`
  const cycle = h.dividendCycleType === 'MONTHLY' ? '월배당' : `${(h.dividendMonths ?? []).join(', ')}월`
  return `${amount} · ${cycle}`
}

function MonthPickerPopup({
  initialMonths,
  onConfirm,
  onCancel
}: {
  initialMonths: number[]
  onConfirm: (months: number[]) => void
  onCancel: () => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<number[]>(initialMonths)

  function toggle(m: number): void {
    setSelected((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)
    )
  }

  return (
    <div className="popup-backdrop" onClick={onCancel}>
      <div className="popup-panel" onClick={(e) => e.stopPropagation()}>
        <h4>배당 지급월 선택</h4>
        <div className="month-grid">
          {ALL_MONTHS.map((m) => (
            <label key={m} className="month-checkbox">
              <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
              {m}월
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => onConfirm(selected)} disabled={selected.length === 0}>
            확인
          </button>
          <button type="button" className="ghost-button" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

function HoldingsPanel({ accountId }: { accountId: number }): React.JSX.Element {
  const { accounts, refresh } = useAccountsContext()
  const isForeign = accounts.find((a) => a.id === accountId)?.accountTypeCode === 'FOREIGN_STOCK'
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [snapshots, setSnapshots] = useState<Record<number, HoldingSnapshot>>({})
  const [form, setForm] = useState<HoldingInput>(emptyHoldingForm(accountId))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dividendPerShareInput, setDividendPerShareInput] = useState('')
  const [dividendCycleType, setDividendCycleType] = useState<DividendCycleType | null>(null)
  const [dividendMonths, setDividendMonths] = useState<number[]>([])
  const [showMonthPopup, setShowMonthPopup] = useState(false)

  const hasDividend = dividendPerShareInput.trim() !== ''

  async function load(): Promise<void> {
    const list = await window.api.holdings.listForAccount(accountId)
    setHoldings(list)
    const snapList = await Promise.all(list.map((h) => window.api.holdings.snapshot(h.id)))
    const map: Record<number, HoldingSnapshot> = {}
    snapList.forEach((s) => (map[s.holdingId] = s))
    setSnapshots(map)
  }

  // 전량 매도(또는 잔액 0)해서 더 이상 보유하지 않는 종목은 목록 아래로 자동 정렬한다.
  function isActiveHolding(h: Holding): boolean {
    const snap = snapshots[h.id]
    if (!snap) return true
    if (snap.quantity != null) return snap.quantity > 0
    return (snap.currentValuation ?? 0) > 0
  }
  const sortedHoldings = [...holdings].sort(
    (a, b) => Number(!isActiveHolding(a)) - Number(!isActiveHolding(b))
  )

  useEffect(() => {
    load()
  }, [accountId])

  useEffect(() => {
    if (!hasDividend) {
      setDividendCycleType(null)
      setDividendMonths([])
    }
  }, [hasDividend])

  function resetForm(): void {
    setForm(emptyHoldingForm(accountId))
    setDividendPerShareInput('')
    setDividendCycleType(null)
    setDividendMonths([])
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name.trim()) return
    const input: HoldingInput = {
      ...form,
      dividendPerShare: hasDividend ? parseFloat(dividendPerShareInput) : null,
      dividendCycleType: hasDividend ? dividendCycleType : null,
      dividendMonths: hasDividend && dividendCycleType === 'CUSTOM' ? dividendMonths : null
    }
    if (editingId) {
      await window.api.holdings.update(editingId, input)
    } else {
      await window.api.holdings.create(input)
    }
    resetForm()
    await load()
    await refresh()
  }

  function startEdit(h: Holding): void {
    setEditingId(h.id)
    setForm({
      accountId,
      name: h.name,
      priceSymbol: h.priceSymbol ?? '',
      priceSource: h.priceSource
    })
    setDividendPerShareInput(h.dividendPerShare != null ? String(h.dividendPerShare) : '')
    setDividendCycleType(h.dividendCycleType)
    setDividendMonths(h.dividendMonths ?? [])
  }

  async function handleArchive(id: number): Promise<void> {
    await window.api.holdings.archive(id, true)
    await load()
    await refresh()
  }

  function handleCycleTypeChange(value: string): void {
    if (value === 'CUSTOM') {
      setDividendCycleType('CUSTOM')
      setShowMonthPopup(true)
    } else if (value === '') {
      setDividendCycleType(null)
      setDividendMonths([])
    } else {
      setDividendCycleType(value as DividendCycleType)
      setDividendMonths([])
    }
  }

  return (
    <div className="holdings-panel">
      <h4>보유종목</h4>
      <form onSubmit={handleSubmit} className="tx-form">
        <label className="field-holding-name">
          종목 이름
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: KODEX 미국 AI 테크 TOP10 타겟 커버드콜"
          />
        </label>
        <label className="field-price-source">
          시세 조회 소스
          <select
            value={form.priceSource ?? ''}
            onChange={(e) =>
              setForm({ ...form, priceSource: (e.target.value || null) as PriceSource | null })
            }
          >
            <option value="">사용 안 함 (수동 입력만)</option>
            {Object.entries(PRICE_SOURCE_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-symbol">
          심볼/티커
          <input
            value={form.priceSymbol ?? ''}
            onChange={(e) => setForm({ ...form, priceSymbol: e.target.value })}
            placeholder="예: BTC, 005930, AAPL"
          />
        </label>
        <label className="field-dividend-amount">
          1주 배당금{isForeign ? ' ($)' : ' (원)'}
          <NumberInput value={dividendPerShareInput} onChange={setDividendPerShareInput} placeholder="없으면 비워두세요" />
        </label>
        <label className="field-dividend-cycle">
          배당주기
          <select
            value={dividendCycleType ?? ''}
            disabled={!hasDividend}
            onChange={(e) => handleCycleTypeChange(e.target.value)}
          >
            <option value="">선택</option>
            <option value="MONTHLY">월배당</option>
            <option value="CUSTOM">
              {dividendCycleType === 'CUSTOM' && dividendMonths.length > 0
                ? `${dividendMonths.join(', ')}월`
                : '임의'}
            </option>
          </select>
        </label>
        {dividendCycleType === 'CUSTOM' && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowMonthPopup(true)}
          >
            월 선택
          </button>
        )}
        <div className="form-actions">
          <button type="submit">{editingId ? '수정 저장' : '종목 추가'}</button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              취소
            </button>
          )}
        </div>
      </form>

      {showMonthPopup && (
        <MonthPickerPopup
          initialMonths={dividendMonths}
          onConfirm={(months) => {
            setDividendMonths(months)
            setShowMonthPopup(false)
          }}
          onCancel={() => setShowMonthPopup(false)}
        />
      )}

      {holdings.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>심볼</th>
              <th>배당정보</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => (
              <tr key={h.id} className={isActiveHolding(h) ? '' : 'muted'}>
                <td>{h.name}</td>
                <td>{h.priceSymbol ?? '-'}</td>
                <td>{formatDividendInfo(h, isForeign)}</td>
                <td className="row-actions">
                  <button type="button" onClick={() => startEdit(h)}>
                    수정
                  </button>
                  <button type="button" onClick={() => handleArchive(h.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const MIN_PASSWORD_LENGTH = 8

function PasswordChangeCard(): React.JSX.Element {
  const { changePassword } = useAuthContext()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!currentPassword || !newPassword) return
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setIsError(true)
      setMessage(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const err = await changePassword(currentPassword, newPassword)
      if (err) {
        setIsError(true)
        setMessage(err)
      } else {
        setIsError(false)
        setMessage('비밀번호가 변경되었습니다.')
        setCurrentPassword('')
        setNewPassword('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card">
      <h2>비밀번호 변경</h2>
      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          현재 비밀번호
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label>
          새 비밀번호
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`최소 ${MIN_PASSWORD_LENGTH}자`}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            변경
          </button>
        </div>
      </form>
      {message && <p className={isError ? 'error-text' : 'success-text'}>{message}</p>}
    </section>
  )
}

function SyncCard(): React.JSX.Element {
  const { user, logout } = useAuthContext()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.sync.getStatus().then((s) => setLastSyncedAt(s.lastSyncedAt))
  }, [])

  async function handleSync(force = false): Promise<void> {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await window.api.sync.push(force)
      if (result.conflict) {
        const confirmed = window.confirm(
          '클라우드에 이 기기가 모르는 최신 데이터가 있습니다. 지금 이 기기의 데이터로 덮어쓰면 ' +
            '그 변경사항을 잃게 됩니다.\n\n계속해서 이 기기의 데이터로 덮어쓸까요?\n' +
            '(취소를 누르고 로그아웃 후 다시 로그인하면 클라우드의 최신 데이터를 먼저 받아올 수 있습니다.)'
        )
        if (confirmed) {
          await handleSync(true)
          return
        }
        setSyncMessage('백업이 취소되었습니다. 최신 데이터를 받으려면 로그아웃 후 다시 로그인해주세요.')
        return
      }
      if (result.accountDeletion) {
        const names = (result.deletedAccountNames ?? []).join(', ')
        const confirmed = window.confirm(
          `이 기기에는 없는 다음 계좌가 클라우드에서 삭제됩니다: ${names}\n\n` +
            '이 계좌들을 이 기기가 아직 받아온 적이 없어서 생기는 문제일 수 있습니다.\n' +
            '정말로 계속해서 삭제할까요? (취소를 누르고 로그아웃 후 다시 로그인하면 ' +
            '해당 계좌를 이 기기로 먼저 받아올 수 있습니다.)'
        )
        if (confirmed) {
          await handleSync(true)
          return
        }
        setSyncMessage('백업이 취소되었습니다. 로그아웃 후 다시 로그인해서 누락된 계좌를 먼저 받아와주세요.')
        return
      }
      if (result.error) {
        setSyncMessage(`백업 실패: ${result.error}`)
      } else {
        setLastSyncedAt(result.lastSyncedAt ?? null)
        setSyncMessage('이 기기의 데이터를 클라우드에 백업했습니다.')
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="card">
      <h2>클라우드 동기화</h2>
      <p className="muted">
        {user?.email} 계정으로 로그인되어 있습니다. 로그인할 때 클라우드의 최신 데이터를
        받아오고, 앱을 종료할 때 이 기기의 데이터를 클라우드에 자동으로 백업합니다.
      </p>
      <p className="path-display">
        마지막 백업: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : '없음'}
      </p>
      <div className="form-actions">
        <button onClick={() => handleSync(false)} disabled={syncing}>
          이 기기 데이터를 클라우드에 백업
        </button>
        <button type="button" className="ghost-button" onClick={logout}>
          로그아웃
        </button>
      </div>
      {syncMessage && <p className={syncMessage.includes('실패') || syncMessage.includes('취소') ? 'error-text' : 'success-text'}>{syncMessage}</p>}
    </section>
  )
}

function SettingsPage(): React.JSX.Element {
  const { accountTypes, accounts, refresh } = useAccountsContext()
  const [dataDir, setDataDir] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<AccountInput>(emptyAccountForm(''))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    window.api.settings.get().then((s) => setDataDir(s.dataDirPath ?? ''))
  }, [])

  useEffect(() => {
    if (!form.accountTypeCode && accountTypes.length > 0) {
      setForm(emptyAccountForm(accountTypes[0].code))
    }
  }, [accountTypes, form.accountTypeCode])

  async function handleChooseFolder(): Promise<void> {
    const picked = await window.api.settings.chooseDataDir()
    if (!picked) return
    setSaving(true)
    setMessage(null)
    try {
      const updated = await window.api.settings.setDataDir(picked)
      setDataDir(updated.dataDirPath ?? '')
      setMessage('데이터 저장 위치가 변경되었습니다. iCloud Drive/OneDrive 폴더 안이라면 다른 기기와 자동 동기화됩니다.')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editingId) {
      await window.api.accounts.update(editingId, form)
    } else {
      await window.api.accounts.create(form)
    }
    setForm(emptyAccountForm(accountTypes[0]?.code ?? ''))
    setEditingId(null)
    await refresh()
  }

  function startEdit(id: number): void {
    const acct = accounts.find((a) => a.id === id)
    if (!acct) return
    setEditingId(id)
    setForm({ accountTypeCode: acct.accountTypeCode, name: acct.name })
  }

  async function handleArchive(id: number): Promise<void> {
    await window.api.accounts.archive(id, true)
    await refresh()
  }

  return (
    <div className="page">
      <SyncCard />

      <section className="card">
        <h2>계좌 {editingId ? '수정' : '추가'}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            계좌 유형
            <select
              value={form.accountTypeCode}
              onChange={(e) => setForm({ ...form, accountTypeCode: e.target.value })}
            >
              {accountTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.labelKo}
                </option>
              ))}
            </select>
          </label>
          <label>
            계좌 이름
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 업비트 BTC, 미래에셋 IRP"
            />
          </label>
          <div className="form-actions">
            <button type="submit">{editingId ? '수정 저장' : '계좌 추가'}</button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(emptyAccountForm(accountTypes[0]?.code ?? ''))
                }}
              >
                취소
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>계좌 목록</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>유형</th>
              <th>이름</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>{accountTypes.find((t) => t.code === a.accountTypeCode)?.labelKo}</td>
                  <td>{a.name}</td>
                  <td className="row-actions">
                    <button onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                      {expandedId === a.id ? '종목 닫기' : '종목 관리'}
                    </button>
                    <button onClick={() => startEdit(a.id)}>수정</button>
                    <button onClick={() => handleArchive(a.id)}>삭제</button>
                  </td>
                </tr>
                {expandedId === a.id && (
                  <tr>
                    <td colSpan={3}>
                      <HoldingsPanel accountId={a.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>데이터 저장 위치</h2>
        <p className="muted">
          맥북/데스크탑 두 기기에서 같은 데이터를 보려면 iCloud Drive 또는 OneDrive 안의 폴더를
          선택하세요.
        </p>
        <p className="path-display">{dataDir || '(기본 위치)'}</p>
        <button onClick={handleChooseFolder} disabled={saving}>
          폴더 선택/변경
        </button>
        {message && <p className="success-text">{message}</p>}
      </section>

      <PasswordChangeCard />
    </div>
  )
}

export default SettingsPage
