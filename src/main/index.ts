import { app, dialog, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipcChannels'
import { openDatabase, closeDatabase } from './db'
import { readSettings } from './services/settingsStore'
import { restoreSession, getCurrentUser, checkSessionStillActive } from './services/authSession'
import { pushToFirestore } from './services/syncService'
import { registerAccountsIpc } from './ipc/accounts'
import { registerHoldingsIpc } from './ipc/holdings'
import { registerTransactionsIpc } from './ipc/transactions'
import { registerPricesIpc } from './ipc/prices'
import { registerRatesIpc } from './ipc/rates'
import { registerSettingsIpc } from './ipc/settings'
import { registerDashboardIpc } from './ipc/dashboard'
import { registerAuthIpc } from './ipc/auth'
import { registerSyncIpc } from './ipc/sync'

const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000

let mainWindow: BrowserWindow | null = null

function startSessionCheckTimer(): void {
  setInterval(async () => {
    if (!getCurrentUser()) return
    const stillActive = await checkSessionStillActive().catch(() => true)
    if (!stillActive) {
      mainWindow?.webContents.send(IPC.AUTH_FORCE_LOGOUT)
    }
  }, SESSION_CHECK_INTERVAL_MS)
}

function createWindow(): void {
  const win = new BrowserWindow({
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
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  if (is.dev) {
    win.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
    })
    win.webContents.on('did-fail-load', (_e, code, description) => {
      console.log(`[renderer:did-fail-load] ${code} ${description}`)
    })
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
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
  registerRatesIpc()
  registerSettingsIpc()
  registerDashboardIpc()
  registerAuthIpc()
  registerSyncIpc()

  await restoreSession().catch((err) => {
    console.error('[auth] 자동 로그인 복원 실패:', err)
  })
  startSessionCheckTimer()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true

  if (!getCurrentUser()) {
    closeDatabase()
    return
  }

  event.preventDefault()
  pushToFirestore()
    .catch((err) => console.error('[sync] 종료 시 동기화 실패:', err))
    .finally(() => {
      closeDatabase()
      app.exit()
    })
})
