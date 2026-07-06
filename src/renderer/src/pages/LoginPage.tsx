import { useEffect, useState } from 'react'
import { useAuthContext } from '../state/AuthContext'
import logoUrl from '../assets/icon.png'

const MIN_PASSWORD_LENGTH = 8

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function LoginPage(): React.JSX.Element {
  const { forcedLogoutMessage, clearForcedLogoutMessage, login, register } = useAuthContext()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRegister = mode === 'register'

  useEffect(() => {
    window.api.auth.getRememberedEmail().then((saved) => {
      if (saved) {
        setEmail(saved)
        setRememberEmail(true)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (isRegister) {
      if (!name.trim() || !phoneNumber.trim()) return
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
        return
      }
    }
    setSubmitting(true)
    setError(null)
    clearForcedLogoutMessage()
    try {
      const err = isRegister
        ? await register(email, password, name, phoneNumber, false, false)
        : await login(email, password, rememberEmail, autoLogin)
      if (err) setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logoUrl} alt="" className="login-logo" />
        <h1 className="login-title">자산 관리 프로그램</h1>

        {forcedLogoutMessage && <p className="error-text login-message">{forcedLogoutMessage}</p>}

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </label>
          <label className="login-field">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? '영문 대소문자 사용 가능, 최소 8자' : ''}
            />
          </label>

          {isRegister && (
            <>
              <label className="login-field">
                이름
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
              </label>
              <label className="login-field">
                전화번호
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder="010-1234-5678"
                />
              </label>
            </>
          )}

          {!isRegister && (
            <div className="login-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                />
                이메일 저장
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={autoLogin}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                />
                자동 로그인
              </label>
            </div>
          )}

          {error && <p className="error-text login-message">{error}</p>}

          <button type="submit" className="login-submit" disabled={submitting}>
            {mode === 'login' ? '로그인' : '계정 만들기'}
          </button>
        </form>

        <button
          type="button"
          className="login-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? '계정이 없으신가요? 만들기' : '이미 계정이 있나요? 로그인'}
        </button>
      </div>
    </div>
  )
}

export default LoginPage
