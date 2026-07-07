import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { SyncResult, SyncStatus } from '@shared/types'
import {
  pushToFirestore,
  getSyncStatus,
  SyncConflictError,
  AccountDeletionGuardError
} from '../services/syncService'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerSyncIpc(): void {
  ipcMain.handle(IPC.SYNC_PUSH, async (_e, force?: boolean): Promise<SyncResult> => {
    try {
      const lastSyncedAt = await pushToFirestore(force)
      return { ok: true, lastSyncedAt }
    } catch (err) {
      if (err instanceof SyncConflictError) {
        return { ok: false, conflict: true, remoteLastSyncedAt: err.remoteLastSyncedAt, error: err.message }
      }
      if (err instanceof AccountDeletionGuardError) {
        return { ok: false, accountDeletion: true, deletedAccountNames: err.deletedAccountNames, error: err.message }
      }
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
