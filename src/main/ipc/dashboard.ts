import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { DashboardFilter } from '@shared/types'
import { getMonthlySummary, getPortfolioSnapshot } from '../db/queries'

export function registerDashboardIpc(): void {
  ipcMain.handle(IPC.DASHBOARD_GET_MONTHLY_SUMMARY, (_e, filter: DashboardFilter) =>
    getMonthlySummary(filter ?? {})
  )

  ipcMain.handle(IPC.DASHBOARD_GET_PORTFOLIO_SNAPSHOT, (_e, accountTypeCode?: string | null) =>
    getPortfolioSnapshot(accountTypeCode)
  )
}
