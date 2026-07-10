import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { getDividendOverview, getPayoutsForMonth } from '../db/queries'

export function registerDividendsIpc(): void {
  ipcMain.handle(IPC.DIVIDENDS_GET_OVERVIEW, (_e, year: number, accountTypeCode?: string | null) =>
    getDividendOverview(year, accountTypeCode)
  )

  ipcMain.handle(
    IPC.DIVIDENDS_GET_PAYOUTS_FOR_MONTH,
    (_e, month: string, accountTypeCode?: string | null) => getPayoutsForMonth(month, accountTypeCode)
  )
}
