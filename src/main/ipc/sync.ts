import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { SyncResult, SyncStatus } from '@shared/types'
import { pushToFirestore, getSyncStatus } from '../services/syncService'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerSyncIpc(): void {
  ipcMain.handle(IPC.SYNC_PUSH, async (): Promise<SyncResult> => {
    try {
      const lastSyncedAt = await pushToFirestore()
      return { ok: true, lastSyncedAt }
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) }
    }
  })

  ipcMain.handle(IPC.SYNC_GET_STATUS, async (): Promise<SyncStatus> => {
    try {
      return await getSyncStatus()
    } catch {
      return { lastSyncedAt: null }
    }
  })
}
