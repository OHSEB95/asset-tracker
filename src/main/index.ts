import { app, dialog, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipcChannels'
import { openDatabase, closeDatabase } from './db'
import { readSettings } from './services/settingsStore'
import { restoreSession, getCurrentUser, checkSessionStillActive } from './services/authSession'
import { pushToFirestore, SyncConflictError } from './services/syncService'
import { registerAccountsIpc } from './ipc/accounts'
import { registerHoldingsIpc } from './ipc/holdings'
import { registerTransactionsIpc } from './ipc/transactions'
import { registerPricesIpc } from './ipc/prices'
import { registerRatesIpc } from './ipc/rates'
import { registerSettingsIpc } from './ipc/settings'
import { registerDashboardIpc } from './ipc/dashboard'
import { registerDividendsIpc } from './ipc/dividends'
import { registerAuthIpc } from './ipc/auth'
import { registerSyncIpc } from './ipc/sync'
import { initAutoUpdater } from './services/updater'

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
  registerDividendsIpc()
  registerAuthIpc()
  registerSyncIpc()

  await restoreSession().catch((err) => {
    console.error('[auth] 자동 로그인 복원 실패:', err)
  })
  startSessionCheckTimer()

  createWindow()
  initAutoUpdater()

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
  ;(async () => {
    try {
      await pushToFirestore()
    } catch (err) {
      if (err instanceof SyncConflictError) {
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          title: '동기화 충돌',
          message: '클라우드에 이 기기가 모르는 최신 데이터가 있습니다.',
          detail:
            '지금 이 기기의 데이터로 덮어쓰면 클라우드의 최신 변경사항을 잃게 됩니다. ' +
            '어떻게 할까요?',
          buttons: ['그래도 덮어쓰고 종료', '백업하지 않고 종료'],
          defaultId: 1,
          cancelId: 1
        })
        if (response === 0) {
          await pushToFirestore(true).catch((e) => console.error('[sync] 강제 백업 실패:', e))
        }
      } else {
        console.error('[sync] 종료 시 동기화 실패:', err)
      }
    } finally {
      closeDatabase()
      app.exit()
    }
  })()
})
