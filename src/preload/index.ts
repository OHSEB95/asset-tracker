import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  AccountInput,
  DashboardFilter,
  HoldingInput,
  PriceSnapshotInput,
  TransactionInput,
  TransactionListFilter
} from '@shared/types'

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
  holdings: {
    listForAccount: (accountId: number, includeArchived = false) =>
      ipcRenderer.invoke(IPC.HOLDINGS_LIST_FOR_ACCOUNT, accountId, includeArchived),
    create: (input: HoldingInput) => ipcRenderer.invoke(IPC.HOLDINGS_CREATE, input),
    update: (id: number, input: HoldingInput) =>
      ipcRenderer.invoke(IPC.HOLDINGS_UPDATE, id, input),
    archive: (id: number, archived: boolean) =>
      ipcRenderer.invoke(IPC.HOLDINGS_ARCHIVE, id, archived),
    snapshot: (holdingId: number) => ipcRenderer.invoke(IPC.HOLDINGS_SNAPSHOT, holdingId)
  },
  transactions: {
    listForAccount: (filter: TransactionListFilter) =>
      ipcRenderer.invoke(IPC.TRANSACTIONS_LIST_FOR_ACCOUNT, filter),
    create: (input: TransactionInput) => ipcRenderer.invoke(IPC.TRANSACTIONS_CREATE, input),
    delete: (id: number) => ipcRenderer.invoke(IPC.TRANSACTIONS_DELETE, id)
  },
  prices: {
    fetch: (holdingId: number) => ipcRenderer.invoke(IPC.PRICES_FETCH, holdingId)
  },
  priceSnapshots: {
    upsert: (input: PriceSnapshotInput) => ipcRenderer.invoke(IPC.PRICE_SNAPSHOTS_UPSERT, input)
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
