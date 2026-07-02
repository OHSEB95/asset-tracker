import { useEffect, useState } from 'react'
import { useAccountsContext } from '../state/AccountsContext'
import type { AccountInput } from '@shared/types'

const SYMBOL_SOURCE_LABEL: Record<string, string> = {
  coingecko: '코인게코 (비트코인 등)',
  naver: '네이버 금융 (국내주식)',
  yahoo: '야후 파이낸스 (해외주식)'
}

function emptyForm(defaultType: string): AccountInput {
  return { accountTypeCode: defaultType, name: '', symbol: '', symbolSource: null }
}

function SettingsPage(): React.JSX.Element {
  const { accountTypes, accounts, refresh } = useAccountsContext()
  const [dataDir, setDataDir] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<AccountInput>(emptyForm(''))
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    window.api.settings.get().then((s) => setDataDir(s.dataDirPath ?? ''))
  }, [])

  useEffect(() => {
    if (!form.accountTypeCode && accountTypes.length > 0) {
      setForm(emptyForm(accountTypes[0].code))
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

  function isMarketType(code: string): boolean {
    return accountTypes.find((t) => t.code === code)?.isMarketPriced ?? false
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload: AccountInput = {
      ...form,
      symbol: isMarketType(form.accountTypeCode) ? form.symbol || null : null,
      symbolSource: isMarketType(form.accountTypeCode) ? form.symbolSource : null
    }
    if (editingId) {
      await window.api.accounts.update(editingId, payload)
    } else {
      await window.api.accounts.create(payload)
    }
    setForm(emptyForm(accountTypes[0]?.code ?? ''))
    setEditingId(null)
    await refresh()
  }

  function startEdit(id: number): void {
    const acct = accounts.find((a) => a.id === id)
    if (!acct) return
    setEditingId(id)
    setForm({
      accountTypeCode: acct.accountTypeCode,
      name: acct.name,
      symbol: acct.symbol ?? '',
      symbolSource: acct.symbolSource
    })
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
          {isMarketType(form.accountTypeCode) && (
            <>
              <label>
                시세 조회 소스
                <select
                  value={form.symbolSource ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      symbolSource: (e.target.value || null) as AccountInput['symbolSource']
                    })
                  }
                >
                  <option value="">사용 안 함 (수동 입력만)</option>
                  {Object.entries(SYMBOL_SOURCE_LABEL).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                심볼/티커
                <input
                  value={form.symbol ?? ''}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  placeholder="예: BTC, 005930, AAPL"
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="submit">{editingId ? '수정 저장' : '계좌 추가'}</button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(emptyForm(accountTypes[0]?.code ?? ''))
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
              <th>심볼</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{accountTypes.find((t) => t.code === a.accountTypeCode)?.labelKo}</td>
                <td>{a.name}</td>
                <td>{a.symbol ?? '-'}</td>
                <td className="row-actions">
                  <button onClick={() => startEdit(a.id)}>수정</button>
                  <button onClick={() => handleArchive(a.id)}>보관</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default SettingsPage
