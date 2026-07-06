import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { getDividendOverview } from '../db/queries'

export function registerDividendsIpc(): void {
  ipcMain.handle(IPC.DIVIDENDS_GET_OVERVIEW, (_e, year: number, accountTypeCode?: string | null) =>
    getDividendOverview(year, accountTypeCode)
  )
}
