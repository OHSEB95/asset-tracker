import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { fetchPriceForHolding } from '../services/priceService'
import { getHoldingById } from '../db/queries'

export function registerPricesIpc(): void {
  ipcMain.handle(IPC.PRICES_FETCH, async (_e, holdingId: number) => {
    const holding = getHoldingById(holdingId)
    if (!holding) return { error: '보유종목을 찾을 수 없습니다.' }
    return fetchPriceForHolding(holding)
  })
}
