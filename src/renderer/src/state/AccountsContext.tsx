import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, AccountType, Holding } from '@shared/types'

interface AccountsContextValue {
  accountTypes: AccountType[]
  accounts: Account[]
  holdings: Holding[]
  loading: boolean
  refresh: () => Promise<void>
}

const AccountsContext = createContext<AccountsContextValue | null>(null)

export function AccountsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [types, accts] = await Promise.all([
      window.api.accountTypes.list(),
      window.api.accounts.list(false)
    ])
    setAccountTypes(types)
    setAccounts(accts)

    const holdingsByAccount = await Promise.all(
      accts.map((a) => window.api.holdings.listForAccount(a.id))
    )
    setHoldings(holdingsByAccount.flat())

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ accountTypes, accounts, holdings, loading, refresh }),
    [accountTypes, accounts, holdings, loading, refresh]
  )

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

export function useAccountsContext(): AccountsContextValue {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccountsContext must be used within AccountsProvider')
  return ctx
}
