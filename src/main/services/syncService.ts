import { getDatabase } from '../db'
import { listAccounts, listHoldingsForAccount, listTransactions } from '../db/queries'
import type { Account, Holding, Transaction, SyncStatus } from '@shared/types'
import {
  firestoreCommit,
  firestoreGetDocument,
  firestoreListCollection,
  firestorePatchDocument,
  type FirestoreWrite
} from './firebase/firestoreApi'
import { getIdTokenForSync } from './authSession'

function accountDocPath(uid: string, id: number): string {
  return `users/${uid}/accounts/${id}`
}
function holdingDocPath(uid: string, id: number): string {
  return `users/${uid}/holdings/${id}`
}
function transactionDocPath(uid: string, id: number): string {
  return `users/${uid}/transactions/${id}`
}

async function buildSyncWrites<T extends { id: number }>(
  idToken: string,
  uid: string,
  collection: string,
  docPath: (uid: string, id: number) => string,
  localItems: T[]
): Promise<FirestoreWrite[]> {
  const remote = await firestoreListCollection(idToken, `users/${uid}/${collection}`)
  const remoteIds = new Set(remote.map((d) => Number(d.id)))
  const localIds = new Set(localItems.map((i) => i.id))

  const writes: FirestoreWrite[] = localItems.map((item) => ({
    kind: 'set',
    docPath: docPath(uid, item.id),
    fields: item as unknown as Record<string, unknown>
  }))
  for (const remoteId of remoteIds) {
    if (!localIds.has(remoteId)) writes.push({ kind: 'delete', docPath: docPath(uid, remoteId) })
  }
  return writes
}

/** 로컬 accounts/holdings/transactions 전체를 Firestore에 덮어쓴다 (마지막 push가 항상 이김). */
export async function pushToFirestore(): Promise<string> {
  const { idToken, uid } = await getIdTokenForSync()

  const accounts = listAccounts(true)
  const holdings = accounts.flatMap((a) => listHoldingsForAccount(a.id, true))
  const transactions = listTransactions({})

  const [accountWrites, holdingWrites, transactionWrites] = await Promise.all([
    buildSyncWrites(idToken, uid, 'accounts', accountDocPath, accounts),
    buildSyncWrites(idToken, uid, 'holdings', holdingDocPath, holdings),
    buildSyncWrites(idToken, uid, 'transactions', transactionDocPath, transactions)
  ])

  await firestoreCommit(idToken, [...accountWrites, ...holdingWrites, ...transactionWrites])

  const lastSyncedAt = new Date().toISOString()
  await firestorePatchDocument(idToken, `users/${uid}`, { lastSyncedAt })
  return lastSyncedAt
}

/** Firestore의 데이터로 로컬 accounts/holdings/transactions를 완전히 대체한다. */
export async function pullFromFirestore(): Promise<void> {
  const { idToken, uid } = await getIdTokenForSync()

  const [accountDocs, holdingDocs, transactionDocs] = await Promise.all([
    firestoreListCollection(idToken, `users/${uid}/accounts`),
    firestoreListCollection(idToken, `users/${uid}/holdings`),
    firestoreListCollection(idToken, `users/${uid}/transactions`)
  ])

  if (accountDocs.length === 0 && holdingDocs.length === 0 && transactionDocs.length === 0) {
    // 원격에 아직 아무 데이터도 없으면(최초 로그인 등) 로컬 데이터를 그대로 둔다.
    return
  }

  const db = getDatabase()
  const replaceAll = db.transaction(() => {
    db.prepare('DELETE FROM transactions').run()
    // price_snapshots는 Firestore에 동기화되지 않는 로컬 전용 데이터라 여기서 복원할 수 없음 —
    // holdings를 지우기 전에 먼저 비워야 FK 제약(holding_id REFERENCES holdings(id))에 안 걸림.
    db.prepare('DELETE FROM price_snapshots').run()
    db.prepare('DELETE FROM holdings').run()
    db.prepare('DELETE FROM accounts').run()

    const insertAccount = db.prepare(
      `INSERT INTO accounts (id, account_type_code, name, is_archived)
       VALUES (@id, @accountTypeCode, @name, @isArchived)`
    )
    for (const d of accountDocs) {
      const a = d.fields as unknown as Account
      insertAccount.run({
        id: Number(d.id),
        accountTypeCode: a.accountTypeCode,
        name: a.name,
        isArchived: a.isArchived ? 1 : 0
      })
    }

    const insertHolding = db.prepare(
      `INSERT INTO holdings
         (id, account_id, name, price_symbol, price_source, is_archived,
          dividend_per_share, dividend_cycle_type, dividend_months)
       VALUES (@id, @accountId, @name, @priceSymbol, @priceSource, @isArchived,
               @dividendPerShare, @dividendCycleType, @dividendMonths)`
    )
    for (const d of holdingDocs) {
      const h = d.fields as unknown as Holding
      insertHolding.run({
        id: Number(d.id),
        accountId: h.accountId,
        name: h.name,
        priceSymbol: h.priceSymbol ?? null,
        priceSource: h.priceSource ?? null,
        isArchived: h.isArchived ? 1 : 0,
        dividendPerShare: h.dividendPerShare ?? null,
        dividendCycleType: h.dividendCycleType ?? null,
        dividendMonths: h.dividendMonths?.length ? h.dividendMonths.join(',') : null
      })
    }

    const insertTransaction = db.prepare(
      `INSERT INTO transactions
         (id, account_id, holding_id, type, date, quantity, price, amount, realized_pnl, note)
       VALUES (@id, @accountId, @holdingId, @type, @date, @quantity, @price, @amount, @realizedPnl, @note)`
    )
    for (const d of transactionDocs) {
      const t = d.fields as unknown as Transaction
      insertTransaction.run({
        id: Number(d.id),
        accountId: t.accountId,
        holdingId: t.holdingId ?? null,
        type: t.type,
        date: t.date,
        quantity: t.quantity ?? null,
        price: t.price ?? null,
        amount: t.amount ?? null,
        realizedPnl: t.realizedPnl ?? null,
        note: t.note ?? null
      })
    }
  })
  replaceAll()
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const { idToken, uid } = await getIdTokenForSync()
  const doc = await firestoreGetDocument(idToken, `users/${uid}`)
  return { lastSyncedAt: (doc?.lastSyncedAt as string | undefined) ?? null }
}
