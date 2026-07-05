import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_DELAY_MS = 5000

/** GitHub Releases(Public repo)를 통한 자동 업데이트. 개발 모드에서는 동작하지 않는다. */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: '업데이트 준비 완료',
        message: '새 버전이 있습니다. 지금 재시작해서 설치할까요?',
        buttons: ['재시작 후 설치', '나중에'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] 자동 업데이트 확인 실패:', err)
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] 자동 업데이트 확인 실패:', err)
    })
  }, CHECK_DELAY_MS)
}
