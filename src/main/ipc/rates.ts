import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { getUsdKrwRate } from '../services/priceService'

export function registerRatesIpc(): void {
  ipcMain.handle(IPC.RATES_GET_USD_KRW, () => getUsdKrwRate())
}
