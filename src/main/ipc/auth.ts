import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { AuthResult, ChangePasswordResult } from '@shared/types'
import { login, register, logout, getCurrentUser, changePassword } from '../services/authSession'
import { pullFromFirestore } from '../services/syncService'
import { readRememberedEmail, writeRememberedEmail } from '../services/authStore'

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
