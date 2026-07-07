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
import { readKnownRemoteSyncedAt, writeKnownRemoteSyncedAt } from './authStore'

/** push 시점에 클라우드가 이 기기가 모르는 사이 더 최신으로 바뀌어 있을 때(다른 기기가 먼저
 * 동기화한 경우) 던져진다. 그대로 덮어쓰면 그 변경사항을 잃으므로, 강제 진행 여부를
 * 사용자에게 먼저 물어봐야 한다. */
export class SyncConflictError extends Error {
  remoteLastSyncedAt: string | null
  constructor(remoteLastSyncedAt: string | null) {
    super('클라우드에 이 기기가 모르는 최신 데이터가 있습니다.')
    this.name = 'SyncConflictError'
    this.remoteLastSyncedAt = remoteLastSyncedAt
  }
}

/** push는 로컬에 없는 계좌를 클라우드에서도 삭제한다. 이 기기의 로컬 데이터가 애초에
 * 불완전하면(예: 다른 기기에서만 입력한 계좌를 이 기기가 한 번도 받아본 적 없는 경우)
 * push 한 번으로 클라우드의 계좌가 통째로 사라질 수 있어, 계좌 단위 삭제가 감지되면
 * 강제 진행 여부를 먼저 물어봐야 한다. */
export class AccountDeletionGuardError extends Error {
  deletedAccountNames: string[]
  constructor(deletedAccountNames: string[]) {
    super('이 기기에 없는 계좌가 클라우드에서 삭제됩니다.')
    this.name = 'AccountDeletionGuardError'
    this.deletedAccountNames = deletedAccountNames
  }
}

async function getRemoteLastSyncedAt(idToken: string, uid: string): Promise<string | null> {
  const doc = await firestoreGetDocument(idToken, `users/${uid}`)
  return (doc?.lastSyncedAt as string | undefined) ?? null
}

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

/**
 * 로컬 accounts/holdings/transactions 전체를 Firestore에 덮어쓴다.
 * force가 아니면 push 전에 이 기기가 모르는 사이 클라우드가 더 최신으로 바뀌었는지 먼저
 * 확인하고, 그렇다면 덮어쓰지 않고 SyncConflictError를 던진다(마지막 push가 무조건 이기는
 * 걸 막기 위한 안전장치).
 */
export async function pushToFirestore(force = false): Promise<string> {
  const { idToken, uid } = await getIdTokenForSync()

  if (!force) {
    const remoteLastSyncedAt = await getRemoteLastSyncedAt(idToken, uid)
    const known = readKnownRemoteSyncedAt()
    if (remoteLastSyncedAt !== null && remoteLastSyncedAt !== known) {
      throw new SyncConflictError(remoteLastSyncedAt)
    }
  }

  const accounts = listAccounts(true)
  const holdings = accounts.flatMap((a) => listHoldingsForAccount(a.id, true))
  const transactions = listTransactions({})

  if (!force) {
    const localAccountIds = new Set(accounts.map((a) => a.id))
    const remoteAccounts = await firestoreListCollection(idToken, `users/${uid}/accounts`)
    const deletedAccountNames = remoteAccounts
      .filter((d) => !localAccountIds.has(Number(d.id)))
      .map((d) => (d.fields as unknown as Account).name)
    if (deletedAccountNames.length > 0) {
      throw new AccountDeletionGuardError(deletedAccountNames)
    }
  }

  const [accountWrites, holdingWrites, transactionWrites] = await Promise.all([
    buildSyncWrites(idToken, uid, 'accounts', accountDocPath, accounts),
    buildSyncWrites(idToken, uid, 'holdings', holdingDocPath, holdings),
    buildSyncWrites(idToken, uid, 'transactions', transactionDocPath, transactions)
  ])

  await firestoreCommit(idToken, [...accountWrites, ...holdingWrites, ...transactionWrites])

  const lastSyncedAt = new Date().toISOString()
  await firestorePatchDocument(idToken, `users/${uid}`, { lastSyncedAt })
  writeKnownRemoteSyncedAt(lastSyncedAt)
  return lastSyncedAt
}

/** Firestore의 데이터로 로컬 accounts/holdings/transactions를 완전히 대체한다. */
export async function pullFromFirestore(): Promise<void> {
  const { idToken, uid } = await getIdTokenForSync()

  const remoteLastSyncedAt = await getRemoteLastSyncedAt(idToken, uid)

  const [accountDocs, holdingDocs, transactionDocs] = await Promise.all([
    firestoreListCollection(idToken, `users/${uid}/accounts`),
    firestoreListCollection(idToken, `users/${uid}/holdings`),
    firestoreListCollection(idToken, `users/${uid}/transactions`)
  ])

  if (accountDocs.length === 0 && holdingDocs.length === 0 && transactionDocs.length === 0) {
    // 원격에 아직 아무 데이터도 없으면(최초 로그인 등) 로컬 데이터를 그대로 둔다.
    writeKnownRemoteSyncedAt(remoteLastSyncedAt)
    return
  }

  const db = getDatabase()
  const replaceAll = db.transaction(() => {
    // holdings를 지웠다가 아래에서 Firestore 문서 id 그대로 재생성하므로(같은 id로 복원),
    // FK 검사를 트랜잭션 커밋 시점까지 미뤄서 그 사이엔 price_snapshots(로컬 전용, Firestore에
    // 동기화되지 않음)를 건드리지 않고 그대로 보존한다. 예전엔 이 시점에 price_snapshots를
    // 통째로 지웠는데, 그러면 로그인/pull 때마다 현재가 기록이 전부 사라져 평가손익이 항상
    // 0으로 나오는 문제가 있었다.
    db.pragma('defer_foreign_keys = ON')
    db.prepare('DELETE FROM transactions').run()
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

    // 다른 기기에서 이미 삭제된 종목의 스냅샷만 정리(남아있는 holdings는 위에서 같은 id로
    // 재생성했으므로 그대로 유효).
    db.prepare('DELETE FROM price_snapshots WHERE holding_id NOT IN (SELECT id FROM holdings)').run()

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
  writeKnownRemoteSyncedAt(remoteLastSyncedAt)
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const { idToken, uid } = await getIdTokenForSync()
  const doc = await firestoreGetDocument(idToken, `users/${uid}`)
  return { lastSyncedAt: (doc?.lastSyncedAt as string | undefined) ?? null }
}
