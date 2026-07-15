import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ExchangeRateInfo } from '@shared/types'

interface ExchangeRateContextValue {
  rate: number | null
  fetchedAt: string | null
  stale: boolean
  refresh: () => Promise<void>
}

const ExchangeRateContext = createContext<ExchangeRateContextValue | null>(null)
const REFRESH_INTERVAL_MS = 60 * 1000

export function ExchangeRateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [info, setInfo] = useState<ExchangeRateInfo | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.api.rates.getUsdKrw()
    setInfo(result)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const value = useMemo(
    () => ({
      rate: info?.rate ?? null,
      fetchedAt: info?.fetchedAt ?? null,
      stale: info?.stale ?? false,
      refresh
    }),
    [info, refresh]
  )

  return <ExchangeRateContext.Provider value={value}>{children}</ExchangeRateContext.Provider>
}

export function useExchangeRateContext(): ExchangeRateContextValue {
  const ctx = useContext(ExchangeRateContext)
  if (!ctx) throw new Error('useExchangeRateContext must be used within ExchangeRateProvider')
  return ctx
}
