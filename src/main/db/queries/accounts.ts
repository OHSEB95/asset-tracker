import { getDatabase } from '../index'
import type { Account, AccountInput, AccountType } from '@shared/types'

function rowToAccountType(row: any): AccountType {
  return {
    code: row.code,
    labelKo: row.label_ko,
    sortOrder: row.sort_order
  }
}

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    accountTypeCode: row.account_type_code,
    name: row.name,
    isArchived: !!row.is_archived
  }
}

export function listAccountTypes(): AccountType[] {
  const db = getDatabase()
  const rows = db.prepare(`SELECT * FROM account_types ORDER BY sort_order`).all()
  return rows.map(rowToAccountType)
}

export function listAccounts(includeArchived = false): Account[] {
  const db = getDatabase()
  const sql = includeArchived
    ? `SELECT a.* FROM accounts a JOIN account_types t ON a.account_type_code = t.code ORDER BY t.sort_order, a.id`
    : `SELECT a.* FROM accounts a JOIN account_types t ON a.account_type_code = t.code WHERE a.is_archived = 0 ORDER BY t.sort_order, a.id`
  const rows = db.prepare(sql).all()
  return rows.map(rowToAccount)
}

export function getAccountById(id: number): Account | null {
  const db = getDatabase()
  const row = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id)
  return row ? rowToAccount(row) : null
}

export function createAccount(input: AccountInput): Account {
  const db = getDatabase()
  const result = db
    .prepare(`INSERT INTO accounts (account_type_code, name) VALUES (@accountTypeCode, @name)`)
    .run({ accountTypeCode: input.accountTypeCode, name: input.name })
  const row = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(result.lastInsertRowid)
  return rowToAccount(row)
}

export function updateAccount(id: number, input: AccountInput): Account {
  const db = getDatabase()
  db.prepare(`UPDATE accounts SET account_type_code = @accountTypeCode, name = @name WHERE id = @id`).run({
    id,
    accountTypeCode: input.accountTypeCode,
    name: input.name
  })
  const row = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id)
  return rowToAccount(row)
}

export function archiveAccount(id: number, archived: boolean): void {
  const db = getDatabase()
  db.prepare(`UPDATE accounts SET is_archived = ? WHERE id = ?`).run(archived ? 1 : 0, id)
}
