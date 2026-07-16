import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { TransactionInput, TransactionListFilter } from '@shared/types'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  moveTransactionOrder,
  updateTransaction
} from '../db/queries'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerTransactionsIpc(): void {
  ipcMain.handle(IPC.TRANSACTIONS_LIST, (_e, filter: TransactionListFilter) =>
    listTransactions(filter)
  )

  ipcMain.handle(IPC.TRANSACTIONS_CREATE, async (_e, input: TransactionInput) => {
    try {
      return { data: await createTransaction(input) }
    } catch (err) {
      return { error: toErrorMessage(err) }
    }
  })

  ipcMain.handle(IPC.TRANSACTIONS_UPDATE, async (_e, id: number, input: TransactionInput) => {
    try {
      return { data: await updateTransaction(id, input) }
    } catch (err) {
      return { error: toErrorMessage(err) }
    }
  })

  ipcMain.handle(IPC.TRANSACTIONS_DELETE, (_e, id: number) => {
    try {
      deleteTransaction(id)
      return { ok: true }
    } catch (err) {
      return { error: toErrorMessage(err) }
    }
  })

  ipcMain.handle(IPC.TRANSACTIONS_MOVE_ORDER, (_e, id: number, direction: 'up' | 'down') => {
    try {
      moveTransactionOrder(id, direction)
      return { ok: true }
    } catch (err) {
      return { error: toErrorMessage(err) }
    }
  })
}
