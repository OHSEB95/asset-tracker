import { Fragment, useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { AccountInput, Holding, HoldingInput, PriceSource } from '@shared/types'

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  coingecko: '코인게코 (비트코인 등)',
  naver: '네이버 금융 (국내주식)',
  yahoo: '야후 파이낸스 (해외주식)'
}

function emptyAccountForm(defaultType: string): AccountInput {
  return { accountTypeCode: defaultType, name: '' }
}

function emptyHoldingForm(accountId: number): HoldingInput {
  return { accountId, name: '', priceSymbol: '', priceSource: null }
}

function HoldingsPanel({ accountId }: { accountId: number }): React.JSX.Element {
  const { refresh } = useAccountsContext()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [form, setForm] = useState<HoldingInput>(emptyHoldingForm(accountId))
  const [editingId, setEditingId] = useState<number | null>(null)

  async function load(): Promise<void> {
    const list = await window.api.holdings.listForAccount(accountId)
    setHoldings(list)
  }

  useEffect(() => {
    load()
  }, [accountId])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editingId) {
      await window.api.holdings.update(editingId, form)
    } else {
      await window.api.holdings.create(form)
    }
    setForm(emptyHoldingForm(accountId))
    setEditingId(null)
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
  }

  async function handleArchive(id: number): Promise<void> {
    await window.api.holdings.archive(id, true)
    await load()
    await refresh()
  }

  return (
    <div className="holdings-panel">
      <h4>보유종목</h4>
      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          종목 이름
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: KODEX 미국 AI 테크 TOP10 타겟 커버드콜"
          />
        </label>
        <label>
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
        <label>
          심볼/티커
          <input
            value={form.priceSymbol ?? ''}
            onChange={(e) => setForm({ ...form, priceSymbol: e.target.value })}
            placeholder="예: BTC, 005930, AAPL"
          />
        </label>
        <div className="form-actions">
          <button type="submit">{editingId ? '수정 저장' : '종목 추가'}</button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setForm(emptyHoldingForm(accountId))
              }}
            >
              취소
            </button>
          )}
        </div>
      </form>

      {holdings.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>심볼</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td>{h.priceSymbol ?? '-'}</td>
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
    </div>
  )
}

export default SettingsPage
