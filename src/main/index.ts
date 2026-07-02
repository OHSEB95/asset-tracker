import { app, dialog, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openDatabase, closeDatabase } from './db'
import { readSettings } from './services/settingsStore'
import { registerAccountsIpc } from './ipc/accounts'
import { registerHoldingsIpc } from './ipc/holdings'
import { registerTransactionsIpc } from './ipc/transactions'
import { registerPricesIpc } from './ipc/prices'
import { registerSettingsIpc } from './ipc/settings'
import { registerDashboardIpc } from './ipc/dashboard'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev) {
    mainWindow.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, description) => {
      console.log(`[renderer:did-fail-load] ${code} ${description}`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ohseb.assettracker')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const settings = readSettings()
  try {
    openDatabase(settings.dataDirPath!)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox(
      '데이터베이스를 열 수 없습니다',
      `${settings.dataDirPath}\n\n${message}\n\n` +
        '해당 폴더의 backups 폴더에서 이전 백업 파일로 복원한 뒤 다시 실행해주세요.'
    )
    app.quit()
    return
  }

  registerAccountsIpc()
  registerHoldingsIpc()
  registerTransactionsIpc()
  registerPricesIpc()
  registerSettingsIpc()
  registerDashboardIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
