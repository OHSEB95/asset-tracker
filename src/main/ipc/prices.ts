import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { fetchPriceForAccount } from '../services/priceService'
import { listAccounts } from '../db/queries'

export function registerPricesIpc(): void {
  ipcMain.handle(IPC.PRICES_FETCH, async (_e, accountId: number) => {
    const account = listAccounts(true).find((a) => a.id === accountId)
    if (!account) return { error: '계좌를 찾을 수 없습니다.' }
    return fetchPriceForAccount(account)
  })
}
