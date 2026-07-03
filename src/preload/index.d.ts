import type {
  Account,
  AccountInput,
  AccountType,
  AppSettings,
  DashboardFilter,
  ExchangeRateInfo,
  Holding,
  HoldingInput,
  HoldingSnapshot,
  MonthlySummaryRow,
  PortfolioSnapshot,
  PriceFetchError,
  PriceFetchResult,
  PriceSnapshotInput,
  Transaction,
  TransactionInput,
  TransactionListFilter
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
  holdings: {
    listForAccount(accountId: number, includeArchived?: boolean): Promise<Holding[]>
    create(input: HoldingInput): Promise<Holding>
    update(id: number, input: HoldingInput): Promise<Holding>
    archive(id: number, archived: boolean): Promise<void>
    snapshot(holdingId: number): Promise<HoldingSnapshot>
  }
  transactions: {
    list(filter: TransactionListFilter): Promise<Transaction[]>
    create(input: TransactionInput): Promise<{ data: Transaction } | { error: string }>
    delete(id: number): Promise<{ ok: true } | { error: string }>
  }
  prices: {
    fetch(holdingId: number): Promise<PriceFetchResult | PriceFetchError>
  }
  priceSnapshots: {
    upsert(input: PriceSnapshotInput): Promise<void>
  }
  rates: {
    getUsdKrw(): Promise<ExchangeRateInfo>
  }
  settings: {
    get(): Promise<AppSettings>
    setDataDir(dir: string): Promise<AppSettings>
    chooseDataDir(): Promise<string | null>
  }
  dashboard: {
    getMonthlySummary(filter: DashboardFilter): Promise<MonthlySummaryRow[]>
    getPortfolioSnapshot(accountTypeCode?: string | null): Promise<PortfolioSnapshot>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
