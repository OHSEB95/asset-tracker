export interface AccountType {
  code: string
  labelKo: string
  isMarketPriced: boolean
  sortOrder: number
}

export interface Account {
  id: number
  accountTypeCode: string
  name: string
  symbol: string | null
  symbolSource: 'coingecko' | 'naver' | 'yahoo' | null
  isArchived: boolean
}

export interface AccountInput {
  accountTypeCode: string
  name: string
  symbol?: string | null
  symbolSource?: 'coingecko' | 'naver' | 'yahoo' | null
}

export interface MonthlyEntry {
  id: number
  accountId: number
  yearMonth: string // 'YYYY-MM'
  contribution: number
  dividends: number
  realizedPnl: number
  valuation: number
  holdingQuantity: number | null
  priceFetchSource: string | null
  note: string | null
}

export interface MonthlyEntryInput {
  accountId: number
  yearMonth: string
  contribution: number
  dividends: number
  realizedPnl: number
  valuation: number
  holdingQuantity?: number | null
  priceFetchSource?: string | null
  note?: string | null
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
