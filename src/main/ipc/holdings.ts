import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { HoldingInput, PriceSnapshotInput } from '@shared/types'
import {
  archiveHolding,
  createHolding,
  getHoldingSnapshot,
  listHoldingsForAccount,
  setHoldingAvgCost,
  updateHolding,
  upsertPriceSnapshot
} from '../db/queries'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerHoldingsIpc(): void {
  ipcMain.handle(IPC.HOLDINGS_LIST_FOR_ACCOUNT, (_e, accountId: number, includeArchived = false) =>
    listHoldingsForAccount(accountId, includeArchived)
  )

  ipcMain.handle(IPC.HOLDINGS_CREATE, (_e, input: HoldingInput) => createHolding(input))

  ipcMain.handle(IPC.HOLDINGS_UPDATE, (_e, id: number, input: HoldingInput) =>
    updateHolding(id, input)
  )

  ipcMain.handle(IPC.HOLDINGS_ARCHIVE, (_e, id: number, archived: boolean) =>
    archiveHolding(id, archived)
  )

  ipcMain.handle(IPC.HOLDINGS_SNAPSHOT, (_e, holdingId: number) => getHoldingSnapshot(holdingId))

  ipcMain.handle(IPC.HOLDINGS_SET_AVG_COST, (_e, holdingId: number, targetAvgCost: number) => {
    try {
      setHoldingAvgCost(holdingId, targetAvgCost)
      return { ok: true }
    } catch (err) {
      return { error: toErrorMessage(err) }
    }
  })

  ipcMain.handle(IPC.PRICE_SNAPSHOTS_UPSERT, (_e, input: PriceSnapshotInput) =>
    upsertPriceSnapshot(input)
  )
}
