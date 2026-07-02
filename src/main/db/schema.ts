// SQL 원본은 schema.sql 참고. 번들된 main 프로세스에서 별도 파일 읽기를 피하기 위해
// 문자열 상수로도 유지한다 (schema.sql과 반드시 동기화할 것).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account_types (
  code TEXT PRIMARY KEY,
  label_ko TEXT NOT NULL,
  is_market_priced INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type_code TEXT NOT NULL REFERENCES account_types(code),
  name TEXT NOT NULL,
  symbol TEXT,
  symbol_source TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  year_month TEXT NOT NULL,
  contribution REAL NOT NULL DEFAULT 0,
  dividends REAL NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  valuation REAL NOT NULL DEFAULT 0,
  holding_quantity REAL,
  price_fetch_source TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_entries_yearmonth ON monthly_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_entries_account ON monthly_entries(account_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

export const DEFAULT_ACCOUNT_TYPES: Array<{
  code: string
  labelKo: string
  isMarketPriced: boolean
  sortOrder: number
}> = [
  { code: 'BITCOIN', labelKo: '비트코인', isMarketPriced: true, sortOrder: 1 },
  { code: 'DOMESTIC_STOCK', labelKo: '국내주식', isMarketPriced: true, sortOrder: 2 },
  { code: 'FOREIGN_STOCK', labelKo: '해외주식', isMarketPriced: true, sortOrder: 3 },
  { code: 'IRP', labelKo: 'IRP', isMarketPriced: false, sortOrder: 4 },
  { code: 'ISA', labelKo: 'ISA', isMarketPriced: false, sortOrder: 5 },
  { code: 'PENSION_FUND', labelKo: '연금저축펀드', isMarketPriced: false, sortOrder: 6 },
  { code: 'YOUTH_SAVINGS', labelKo: '청년도약계좌', isMarketPriced: false, sortOrder: 7 }
]
