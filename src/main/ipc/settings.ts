import { dialog, ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { readSettings, writeSettings } from '../services/settingsStore'
import { moveDatabaseFile, openDatabase } from '../db'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => readSettings())

  ipcMain.handle(IPC.SETTINGS_SET_DATA_DIR, (_e, newDir: string) => {
    const current = readSettings()
    if (current.dataDirPath && current.dataDirPath !== newDir) {
      moveDatabaseFile(current.dataDirPath, newDir)
    }
    openDatabase(newDir)
    const updated = { dataDirPath: newDir }
    writeSettings(updated)
    return updated
  })

  ipcMain.handle(IPC.SETTINGS_CHOOSE_DATA_DIR, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      title: '데이터 저장 폴더 선택 (예: iCloud Drive / OneDrive 내 폴더)'
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
