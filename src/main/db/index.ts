import Database from 'better-sqlite3'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ACCOUNT_TYPES, SCHEMA_SQL } from './schema'

const DB_FILE_NAME = 'asset-tracker.db'
const BACKUP_DIR_NAME = 'backups'
const MAX_BACKUPS = 10

let db: Database.Database | null = null
let currentDataDir: string | null = null

function backupBeforeOpen(dataDir: string, dbPath: string): void {
  if (!existsSync(dbPath)) return
  const backupDir = join(dataDir, BACKUP_DIR_NAME)
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  copyFileSync(dbPath, join(backupDir, `asset-tracker-${stamp}.db`))

  const backups = readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const old of backups.slice(MAX_BACKUPS)) {
    unlinkSync(join(backupDir, old.f))
  }
}

function seedAccountTypes(instance: Database.Database): void {
  const insert = instance.prepare(
    `INSERT OR IGNORE INTO account_types (code, label_ko, is_market_priced, sort_order)
     VALUES (@code, @labelKo, @isMarketPriced, @sortOrder)`
  )
  const tx = instance.transaction(() => {
    for (const type of DEFAULT_ACCOUNT_TYPES) {
      insert.run({
        code: type.code,
        labelKo: type.labelKo,
        isMarketPriced: type.isMarketPriced ? 1 : 0,
        sortOrder: type.sortOrder
      })
    }
  })
  tx()
}

export function openDatabase(dataDir: string): Database.Database {
  if (db && currentDataDir === dataDir) return db
  if (db) {
    db.close()
    db = null
  }

  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, DB_FILE_NAME)

  backupBeforeOpen(dataDir, dbPath)

  const instance = new Database(dbPath)
  // WAL 대신 기본 rollback journal 유지: iCloud/OneDrive 동기화 시 -wal/-shm
  // 사이드카 파일이 따로 동기화되며 깨질 위험을 피하기 위함.
  instance.pragma('journal_mode = DELETE')
  instance.pragma('foreign_keys = ON')

  const integrity = instance.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    throw new Error(`데이터베이스 무결성 검사 실패: ${integrity}`)
  }

  instance.exec(SCHEMA_SQL)
  seedAccountTypes(instance)

  db = instance
  currentDataDir = dataDir
  return instance
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call openDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    currentDataDir = null
  }
}

export function moveDatabaseFile(fromDir: string, toDir: string): void {
  const fromPath = join(fromDir, DB_FILE_NAME)
  mkdirSync(toDir, { recursive: true })
  const toPath = join(toDir, DB_FILE_NAME)
  if (existsSync(fromPath) && fromPath !== toPath) {
    copyFileSync(fromPath, toPath)
  }
}
