import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { AuthResult, ChangePasswordResult } from '@shared/types'
import { login, register, logout, getCurrentUser, changePassword } from '../services/authSession'
import { pullFromFirestore, clearAllLocalData } from '../services/syncService'
import { readRememberedEmail, writeRememberedEmail, writeLocalDataUid } from '../services/authStore'

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerAuthIpc(): void {
  ipcMain.handle(
    IPC.AUTH_LOGIN,
    async (
      _e,
      email: string,
      password: string,
      rememberEmail: boolean,
      autoLogin: boolean
    ): Promise<AuthResult> => {
      try {
        const user = await login(email, password, autoLogin)
        writeRememberedEmail(rememberEmail ? email : null)
        await pullFromFirestore()
        return { user }
      } catch (err) {
        // login()은 성공했는데 pullFromFirestore()가 실패한 경우(예: FOREIGN KEY 오류)에도
        // 세션을 정리해야 한다. 안 그러면 화면엔 로그인 실패로 보이는데 백엔드는 로그인된
        // 상태로 남아서, 이후 앱을 종료할 때 자동 push가 실행돼 로컬의 불완전한 데이터로
        // 클라우드를 덮어써버리는 사고로 이어진다.
        logout()
        return { error: toErrorMessage(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.AUTH_REGISTER,
    async (
      _e,
      email: string,
      password: string,
      name: string,
      phoneNumber: string,
      rememberEmail: boolean,
      autoLogin: boolean
    ): Promise<AuthResult> => {
      try {
        const user = await register(email, password, name, phoneNumber, autoLogin)
        writeRememberedEmail(rememberEmail ? email : null)
        // 새로 만든 계정은 이 기기에 남아있을 수 있는(예: 다른 계정으로 쓰다 로그아웃한) 로컬
        // 데이터와 무관하므로, 항상 로컬을 비우고 새 계정 소유로 표시한다.
        clearAllLocalData()
        writeLocalDataUid(user.uid)
        return { user }
      } catch (err) {
        return { error: toErrorMessage(err) }
      }
    }
  )

  ipcMain.handle(IPC.AUTH_LOGOUT, () => {
    logout()
    return { ok: true }
  })

  ipcMain.handle(IPC.AUTH_GET_CURRENT_USER, () => getCurrentUser())
  ipcMain.handle(IPC.AUTH_GET_REMEMBERED_EMAIL, () => readRememberedEmail())

  ipcMain.handle(
    IPC.AUTH_CHANGE_PASSWORD,
    async (_e, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> => {
      try {
        await changePassword(currentPassword, newPassword)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: toErrorMessage(err) }
      }
    }
  )
}
