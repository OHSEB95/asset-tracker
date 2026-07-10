import type Database from 'better-sqlite3'

interface Migration {
  version: number
  up: (db: Database.Database) => void
}

/** ADJUST 타입이 예수금 전용(quantity/price 없이 amount만)으로도 저장될 수 있도록 CHECK 재생성 */
function migrateTransactionsAdjustCash(db: Database.Database): void {
  db.exec(`
    ALTER TABLE transactions RENAME TO transactions_old;

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      holding_id INTEGER REFERENCES holdings(id),
      type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','BUY','SELL','ADJUST','DIVIDEND')),
      date TEXT NOT NULL,
      quantity REAL,
      price REAL,
      amount REAL,
      realized_pnl REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (type IN ('DEPOSIT','WITHDRAWAL','DIVIDEND')
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

    INSERT INTO transactions SELECT * FROM transactions_old;
    DROP TABLE transactions_old;

    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_tx_holding_date ON transactions(holding_id, date);
  `)
}

/** 청년도약계좌 -> 안전자산 명칭 변경 (기존 DB에 이미 시드된 라벨 갱신) */
function migrateYouthSavingsLabel(db: Database.Database): void {
  db.prepare(`UPDATE account_types SET label_ko = '안전자산' WHERE code = 'YOUTH_SAVINGS'`).run()
}

/** 안전자산 상품의 '해지' 거래유형(CLOSE)을 저장할 수 있도록 CHECK 재생성 */
function migrateTransactionsCloseType(db: Database.Database): void {
  db.exec(`
    ALTER TABLE transactions RENAME TO transactions_old;

    CREATE TABLE transactions (
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

    INSERT INTO transactions SELECT * FROM transactions_old;
    DROP TABLE transactions_old;

    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_tx_holding_date ON transactions(holding_id, date);
  `)
}

/**
 * 안전자산 도입 이전에는 YOUTH_SAVINGS 계좌의 상품도 일반 종목처럼 수량×단가로 '정리' 거래가
 * 저장됐다. 이제 안전자산 상품은 amount(잔액) 기반으로 읽으므로, 그런 옛 행을 amount 모양으로
 * 재해석해준다 (수량×단가 → amount, quantity/price는 NULL).
 */
function migrateSavingsHoldingAdjustShape(db: Database.Database): void {
  db.prepare(
    `UPDATE transactions
     SET amount = quantity * price, quantity = NULL, price = NULL
     WHERE type = 'ADJUST' AND amount IS NULL
       AND holding_id IN (
         SELECT h.id FROM holdings h JOIN accounts a ON a.id = h.account_id
         WHERE a.account_type_code = 'YOUTH_SAVINGS'
       )`
  ).run()
}

/** 보유종목에 배당 정보(1주 배당금/배당주기/배당월) 컬럼 추가 */
function migrateHoldingsDividendColumns(db: Database.Database): void {
  db.exec(`
    ALTER TABLE holdings ADD COLUMN dividend_per_share REAL;
    ALTER TABLE holdings ADD COLUMN dividend_cycle_type TEXT;
    ALTER TABLE holdings ADD COLUMN dividend_months TEXT;
  `)
}

/** 보유종목에 배당락일/배당일(예상) 컬럼 추가 - 배당락일 기준 보유수량으로 배당 예상액 계산에 사용 */
function migrateHoldingsDividendDayColumns(db: Database.Database): void {
  db.exec(`
    ALTER TABLE holdings ADD COLUMN dividend_ex_day INTEGER;
    ALTER TABLE holdings ADD COLUMN dividend_pay_day INTEGER;
  `)
}

/** 거래내역에 sort_order 컬럼 추가 - 같은 날짜 거래끼리 표시 순서를 수동으로 바꿀 수 있게 함 */
function migrateTransactionsSortOrder(db: Database.Database): void {
  db.exec(`ALTER TABLE transactions ADD COLUMN sort_order INTEGER;`)
}

export const MIGRATIONS: Migration[] = [
  { version: 1, up: migrateTransactionsAdjustCash },
  { version: 2, up: migrateYouthSavingsLabel },
  { version: 3, up: migrateTransactionsCloseType },
  { version: 4, up: migrateSavingsHoldingAdjustShape },
  { version: 5, up: migrateHoldingsDividendColumns },
  { version: 6, up: migrateHoldingsDividendDayColumns },
  { version: 7, up: migrateTransactionsSortOrder }
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined
  return row ? Number(row.value) : 0
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', @version)
     ON CONFLICT(key) DO UPDATE SET value = @version`
  ).run({ version: String(version) })
}

/** 새로 생성된 DB는 이미 최신 스키마이므로 마이그레이션 없이 버전만 기록한다. */
export function markAsLatestSchema(db: Database.Database): void {
  setSchemaVersion(db, LATEST_SCHEMA_VERSION)
}

/** 기존 DB에 대해 아직 적용되지 않은 마이그레이션을 순서대로 실행한다. */
export function runPendingMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db)
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  )
  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db)
      setSchemaVersion(db, migration.version)
    })
    tx()
  }
}
