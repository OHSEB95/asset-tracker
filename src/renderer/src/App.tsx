import { useState } from 'react'
import { AccountsProvider } from './state/AccountsContext'
import { ExchangeRateProvider, useExchangeRateContext } from './state/ExchangeRateContext'
import { AuthProvider, useAuthContext } from './state/AuthContext'
import SettingsPage from './pages/SettingsPage'
import TransactionEntryPage from './pages/TransactionEntryPage'
import DashboardPage from './pages/DashboardPage'
import HoldingsPage from './pages/HoldingsPage'
import LoginPage from './pages/LoginPage'

type Tab = 'dashboard' | 'entry' | 'holdings' | 'settings'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'entry', label: '거래 내역' },
  { key: 'holdings', label: '보유종목' },
  { key: 'settings', label: '설정' }
]

function ExchangeRateBadge(): React.JSX.Element {
  const { rate, stale } = useExchangeRateContext()
  return (
    <div className="exchange-rate-badge">
      {rate == null ? (
        '환율 조회 중…'
      ) : (
        <>
          오늘의 환율 USD/KRW {rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {stale && <span className="stale-tag"> (지연)</span>}
        </>
      )}
    </div>
  )
}

function AppShell(): React.JSX.Element {
  const { user, loading } = useAuthContext()
  const [tab, setTab] = useState<Tab>('dashboard')

  if (loading) return <div className="page">로딩 중…</div>
  if (!user) return <LoginPage />

  return (
    <ExchangeRateProvider>
      <AccountsProvider>
        <div className="app-shell">
          <nav className="tab-bar">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab-button ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            <ExchangeRateBadge />
            {user.name && (
              <div className="user-badge">
                <span className="user-badge-name">{user.name}</span>님
              </div>
            )}
          </nav>
          <main className="tab-content">
            {tab === 'dashboard' && <DashboardPage onNavigateToHoldings={() => setTab('holdings')} />}
            {tab === 'entry' && <TransactionEntryPage />}
            {tab === 'holdings' && <HoldingsPage />}
            {tab === 'settings' && <SettingsPage />}
          </main>
        </div>
      </AccountsProvider>
    </ExchangeRateProvider>
  )
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
