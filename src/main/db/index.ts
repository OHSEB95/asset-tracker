import Database from 'better-sqlite3'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ACCOUNT_TYPES, SCHEMA_SQL } from './schema'
import { markAsLatestSchema, runPendingMigrations } from './migrations'

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
  // ON CONFLICT DO UPDATE: 코드에 정의된 라벨/정렬순서가 바뀌면 기존 DB에도 항상 반영되도록 함
  // (account_types는 사용자 데이터가 아니라 코드가 정의하는 참조용 목록이라 매번 최신화해도 안전함)
  const upsert = instance.prepare(
    `INSERT INTO account_types (code, label_ko, sort_order)
     VALUES (@code, @labelKo, @sortOrder)
     ON CONFLICT(code) DO UPDATE SET label_ko = excluded.label_ko, sort_order = excluded.sort_order`
  )
  const tx = instance.transaction(() => {
    for (const type of DEFAULT_ACCOUNT_TYPES) {
      upsert.run({
        code: type.code,
        labelKo: type.labelKo,
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
  const isNewDb = !existsSync(dbPath)

  backupBeforeOpen(dataDir, dbPath)

  const instance = new Database(dbPath)
  // WAL 대신 기본 rollback journal 유지: iCloud/OneDrive 동기화 시 -wal/-shm
  // 사이드카 파일이 따로 동기화되며 깨질 위험을 피하기 위함.
  instance.pragma('journal_mode = DELETE')

  const integrity = instance.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    throw new Error(`데이터베이스 무결성 검사 실패: ${integrity}`)
  }

  instance.exec(SCHEMA_SQL)
  seedAccountTypes(instance)

  if (isNewDb) {
    markAsLatestSchema(instance)
  } else {
    // 마이그레이션 중엔 foreign_keys를 명시적으로 꺼둔다 - rename+재생성 방식 마이그레이션(예:
    // holdings 테이블) 중에 foreign_keys=ON이면 RENAME TABLE이 다른 테이블의 참조(예:
    // transactions.holding_id)를 자동으로 옛 이름(_old)으로 바꿔버려서, 이후
    // DROP TABLE ..._old가 FK 위반으로 실패한다.
    instance.pragma('foreign_keys = OFF')
    runPendingMigrations(instance)
  }

  // 정상 사용 시점부터는 참조 무결성을 강제한다(마이그레이션 완료 후에만 켬).
  instance.pragma('foreign_keys = ON')

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
