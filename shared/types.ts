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

export type DividendCycleType = 'MONTHLY' | 'ANNUAL' | 'CUSTOM'

export interface Holding {
  id: number
  accountId: number
  name: string
  priceSymbol: string | null
  priceSource: PriceSource | null
  isArchived: boolean
  dividendPerShare: number | null
  dividendCycleType: DividendCycleType | null
  dividendMonths: number[] | null
}

export interface HoldingInput {
  accountId: number
  name: string
  priceSymbol?: string | null
  priceSource?: PriceSource | null
  dividendPerShare?: number | null
  dividendCycleType?: DividendCycleType | null
  dividendMonths?: number[] | null
}

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'ADJUST' | 'DIVIDEND' | 'CLOSE'

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
  accountId?: number | null
  accountTypeCode?: string | null
  from?: string
  to?: string
}

export interface HoldingSnapshot {
  holdingId: number
  quantity: number | null
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
  principal: number
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

export interface PortfolioRow {
  kind: 'holding' | 'cash'
  accountId: number
  accountTypeLabel: string
  label: string
  quantity: number | null
  avgCost: number | null
  currentPrice: number | null
  currency: 'KRW' | 'USD'
  value: number
  profit: number | null
  weightPercent: number
}

export interface PortfolioSnapshot {
  rows: PortfolioRow[]
  totalValue: number
  totalProfit: number
}
