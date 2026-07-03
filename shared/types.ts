export interface AccountType {
  code: string
  labelKo: string
  sortOrder: number
}

export interface Account {
  id: number
  accountTypeCode: string
  name: string
  isArchived: boolean
}

export interface AccountInput {
  accountTypeCode: string
  name: string
}

export type PriceSource = 'coingecko' | 'naver' | 'yahoo'

export interface Holding {
  id: number
  accountId: number
  name: string
  priceSymbol: string | null
  priceSource: PriceSource | null
  isArchived: boolean
}

export interface HoldingInput {
  accountId: number
  name: string
  priceSymbol?: string | null
  priceSource?: PriceSource | null
}

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'ADJUST' | 'DIVIDEND'

export interface Transaction {
  id: number
  accountId: number
  holdingId: number | null
  type: TransactionType
  date: string // 'YYYY-MM-DD'
  quantity: number | null
  price: number | null
  amount: number | null
  realizedPnl: number | null
  note: string | null
}

export interface TransactionInput {
  accountId: number
  holdingId?: number | null
  type: TransactionType
  date: string
  quantity?: number | null
  price?: number | null
  amount?: number | null
  note?: string | null
}

export interface TransactionListFilter {
  accountId: number
  from?: string
  to?: string
}

export interface HoldingSnapshot {
  holdingId: number
  quantity: number
  avgCost: number | null
  lastKnownPrice: number | null
  lastKnownPriceMonth: string | null
  currentValuation: number | null
}

export interface PriceSnapshotInput {
  holdingId: number
  yearMonth: string
  price: number
  source?: string | null
}

export interface PriceFetchResult {
  price: number
  currency: 'KRW' | 'USD'
  fetchedAt: string
  source: string
}

export interface PriceFetchError {
  error: string
}

export interface MonthlySummaryRow {
  yearMonth: string
  contribution: number
  dividends: number
  realizedPnl: number
  valuation: number
  cumulativeContribution: number
}

export interface DashboardFilter {
  from?: string
  to?: string
  accountTypeCode?: string | null
  accountId?: number | null
}

export interface AppSettings {
  dataDirPath: string | null
}

export interface ExchangeRateInfo {
  rate: number
  fetchedAt: string
  stale: boolean
}
