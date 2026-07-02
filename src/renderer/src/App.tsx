import { useState } from 'react'
import { AccountsProvider } from './state/AccountsContext'
import SettingsPage from './pages/SettingsPage'
import TransactionEntryPage from './pages/TransactionEntryPage'
import DashboardPage from './pages/DashboardPage'

type Tab = 'dashboard' | 'entry' | 'settings'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'entry', label: '거래 입력' },
  { key: 'settings', label: '설정' }
]

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
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
        </nav>
        <main className="tab-content">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'entry' && <TransactionEntryPage />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </AccountsProvider>
  )
}

export default App
