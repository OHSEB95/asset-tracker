import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { AccountInput } from '@shared/types'
import {
  archiveAccount,
  createAccount,
  listAccounts,
  listAccountTypes,
  updateAccount
} from '../db/queries'

export function registerAccountsIpc(): void {
  ipcMain.handle(IPC.ACCOUNT_TYPES_LIST, () => listAccountTypes())

  ipcMain.handle(IPC.ACCOUNTS_LIST, (_e, includeArchived: boolean = false) =>
    listAccounts(includeArchived)
  )

  ipcMain.handle(IPC.ACCOUNTS_CREATE, (_e, input: AccountInput) => createAccount(input))

  ipcMain.handle(IPC.ACCOUNTS_UPDATE, (_e, id: number, input: AccountInput) =>
    updateAccount(id, input)
  )

  ipcMain.handle(IPC.ACCOUNTS_ARCHIVE, (_e, id: number, archived: boolean) =>
    archiveAccount(id, archived)
  )
}
