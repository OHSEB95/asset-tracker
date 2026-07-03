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

export const MIGRATIONS: Migration[] = [
  { version: 1, up: migrateTransactionsAdjustCash },
  { version: 2, up: migrateYouthSavingsLabel }
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
