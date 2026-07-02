import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { MonthlyEntryInput } from '@shared/types'
import { listEntriesByMonth, upsertEntry } from '../db/queries'

export function registerEntriesIpc(): void {
  ipcMain.handle(IPC.ENTRIES_LIST_BY_MONTH, (_e, yearMonth: string) =>
    listEntriesByMonth(yearMonth)
  )

  ipcMain.handle(IPC.ENTRIES_UPSERT, (_e, input: MonthlyEntryInput) => upsertEntry(input))
}
