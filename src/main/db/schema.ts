export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account_types (
  code TEXT PRIMARY KEY,
  label_ko TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type_code TEXT NOT NULL REFERENCES account_types(code),
  name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  price_symbol TEXT,
  price_source TEXT CHECK (price_source IN ('coingecko','naver','yahoo') OR price_source IS NULL),
  is_archived INTEGER NOT NULL DEFAULT 0,
  dividend_per_share REAL,
  dividend_cycle_type TEXT,
  dividend_months TEXT,
  dividend_ex_day INTEGER,
  dividend_pay_day INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  holding_id INTEGER REFERENCES holdings(id),
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','BUY','SELL','ADJUST','DIVIDEND','CLOSE')),
  date TEXT NOT NULL,
  quantity REAL,
  price REAL,
  amount REAL,
  realized_pnl REAL,
  note TEXT,
  sort_order INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (type IN ('DEPOSIT','WITHDRAWAL','DIVIDEND','CLOSE')
       AND amount IS NOT NULL AND amount > 0
       AND quantity IS NULL AND price IS NULL AND realized_pnl IS NULL)
    OR
    (type = 'BUY'
       AND quantity IS NOT NULL AND quantity > 0
       AND price IS NOT NULL AND price > 0
       AND amount IS NULL AND realized_pnl IS NULL)
    OR
    (type = 'ADJUST' AND realized_pnl IS NULL AND (
      (quantity IS NOT NULL AND quantity > 0
         AND price IS NOT NULL AND price > 0
         AND amount IS NULL)
      OR
      (amount IS NOT NULL AND amount > 0
         AND quantity IS NULL AND price IS NULL)
    ))
    OR
    (type = 'SELL'
       AND quantity IS NOT NULL AND quantity > 0
       AND price IS NOT NULL AND price > 0
       AND amount IS NULL AND realized_pnl IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_holding_date ON transactions(holding_id, date);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holding_id INTEGER NOT NULL REFERENCES holdings(id),
  year_month TEXT NOT NULL,
  price REAL NOT NULL,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(holding_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_holding_month ON price_snapshots(holding_id, year_month);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

export const DEFAULT_ACCOUNT_TYPES: Array<{
  code: string
  labelKo: string
  sortOrder: number
}> = [
  { code: 'FOREIGN_STOCK', labelKo: '해외주식', sortOrder: 1 },
  { code: 'DOMESTIC_STOCK', labelKo: '국내주식', sortOrder: 2 },
  { code: 'YOUTH_SAVINGS', labelKo: '안전자산', sortOrder: 3 },
  { code: 'PENSION_FUND', labelKo: '연금저축펀드', sortOrder: 4 },
  { code: 'IRP', labelKo: 'IRP', sortOrder: 5 },
  { code: 'ISA', labelKo: 'ISA', sortOrder: 6 },
  { code: 'BITCOIN', labelKo: '비트코인', sortOrder: 7 }
]
