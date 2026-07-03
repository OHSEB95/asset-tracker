import { useState } from 'react'
import { AccountsProvider } from './state/AccountsContext'
import { ExchangeRateProvider, useExchangeRateContext } from './state/ExchangeRateContext'
import SettingsPage from './pages/SettingsPage'
import TransactionEntryPage from './pages/TransactionEntryPage'
import DashboardPage from './pages/DashboardPage'

type Tab = 'dashboard' | 'entry' | 'settings'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'entry', label: '거래 입력' },
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

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('dashboard')

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
          </nav>
          <main className="tab-content">
            {tab === 'dashboard' && <DashboardPage />}
            {tab === 'entry' && <TransactionEntryPage />}
            {tab === 'settings' && <SettingsPage />}
          </main>
        </div>
      </AccountsProvider>
    </ExchangeRateProvider>
  )
}

export default App
