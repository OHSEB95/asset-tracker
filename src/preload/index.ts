import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { AccountInput, DashboardFilter, MonthlyEntryInput } from '@shared/types'

const api = {
  accountTypes: {
    list: () => ipcRenderer.invoke(IPC.ACCOUNT_TYPES_LIST)
  },
  accounts: {
    list: (includeArchived = false) => ipcRenderer.invoke(IPC.ACCOUNTS_LIST, includeArchived),
    create: (input: AccountInput) => ipcRenderer.invoke(IPC.ACCOUNTS_CREATE, input),
    update: (id: number, input: AccountInput) =>
      ipcRenderer.invoke(IPC.ACCOUNTS_UPDATE, id, input),
    archive: (id: number, archived: boolean) =>
      ipcRenderer.invoke(IPC.ACCOUNTS_ARCHIVE, id, archived)
  },
  entries: {
    listByMonth: (yearMonth: string) => ipcRenderer.invoke(IPC.ENTRIES_LIST_BY_MONTH, yearMonth),
    upsert: (input: MonthlyEntryInput) => ipcRenderer.invoke(IPC.ENTRIES_UPSERT, input)
  },
  prices: {
    fetch: (accountId: number) => ipcRenderer.invoke(IPC.PRICES_FETCH, accountId)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    setDataDir: (dir: string) => ipcRenderer.invoke(IPC.SETTINGS_SET_DATA_DIR, dir),
    chooseDataDir: () => ipcRenderer.invoke(IPC.SETTINGS_CHOOSE_DATA_DIR)
  },
  dashboard: {
    getMonthlySummary: (filter: DashboardFilter) =>
      ipcRenderer.invoke(IPC.DASHBOARD_GET_MONTHLY_SUMMARY, filter)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-expect-error fallback for contextIsolation disabled (not used in this app)
  window.api = api
}
