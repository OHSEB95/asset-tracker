import type {
  Account,
  AccountInput,
  AccountType,
  AppSettings,
  DashboardFilter,
  MonthlyEntry,
  MonthlyEntryInput,
  MonthlySummaryRow,
  PriceFetchError,
  PriceFetchResult
} from '@shared/types'

export interface Api {
  accountTypes: {
    list(): Promise<AccountType[]>
  }
  accounts: {
    list(includeArchived?: boolean): Promise<Account[]>
    create(input: AccountInput): Promise<Account>
    update(id: number, input: AccountInput): Promise<Account>
    archive(id: number, archived: boolean): Promise<void>
  }
  entries: {
    listByMonth(yearMonth: string): Promise<MonthlyEntry[]>
    upsert(input: MonthlyEntryInput): Promise<MonthlyEntry>
  }
  prices: {
    fetch(accountId: number): Promise<PriceFetchResult | PriceFetchError>
  }
  settings: {
    get(): Promise<AppSettings>
    setDataDir(dir: string): Promise<AppSettings>
    chooseDataDir(): Promise<string | null>
  }
  dashboard: {
    getMonthlySummary(filter: DashboardFilter): Promise<MonthlySummaryRow[]>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
