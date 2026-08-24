import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { DashboardFilter } from '@shared/types'
import { getMonthlySummary, getPortfolioSnapshot, setMonthlyRealizedPnlOverride } from '../db/queries'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerDashboardIpc(): void {
  ipcMain.handle(IPC.DASHBOARD_GET_MONTHLY_SUMMARY, (_e, filter: DashboardFilter) =>
    getMonthlySummary(filter ?? {})
  )

  ipcMain.handle(IPC.DASHBOARD_GET_PORTFOLIO_SNAPSHOT, (_e, accountTypeCode?: string | string[] | null) =>
    getPortfolioSnapshot(accountTypeCode)
  )

  ipcMain.handle(
    IPC.DASHBOARD_SET_REALIZED_PNL_OVERRIDE,
    (_e, yearMonth: string, amount: number | null) => {
      try {
        setMonthlyRealizedPnlOverride(yearMonth, amount)
        return { ok: true }
      } catch (err) {
        return { error: toErrorMessage(err) }
      }
    }
  )
}
