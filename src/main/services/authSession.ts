import { randomUUID } from 'node:crypto'
import type { AuthUser } from '@shared/types'
import {
  firebaseSignIn,
  firebaseSignUp,
  firebaseRefreshIdToken,
  firebaseUpdatePassword
} from './firebase/authApi'
import { firestorePatchDocument, firestoreGetDocument } from './firebase/firestoreApi'
import { clearStoredSession, readStoredSession, writeStoredSession } from './authStore'
import type { StoredSession } from './authStore'

interface ActiveSession {
  uid: string
  email: string | null
  name: string | null
  idToken: string
  idTokenExpiresAt: number
  refreshToken: string
  sessionId: string
}

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

let active: ActiveSession | null = null

function toAuthUser(s: ActiveSession): AuthUser {
  return { uid: s.uid, email: s.email, name: s.name }
}

export async function login(email: string, password: string, autoLogin: boolean): Promise<AuthUser> {
  const result = await firebaseSignIn(email, password)
  return establishSession(result.uid, result.email, result.idToken, result.refreshToken, 3600, autoLogin)
}

export async function register(
  email: string,
  password: string,
  name: string,
  phoneNumber: string,
  autoLogin: boolean
): Promise<AuthUser> {
  const result = await firebaseSignUp(email, password)
  return establishSession(result.uid, result.email, result.idToken, result.refreshToken, 3600, autoLogin, {
    name,
    phoneNumber
  })
}

async function establishSession(
  uid: string,
  email: string | null,
  idToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  autoLogin: boolean,
  extraProfileFields: Record<string, unknown> = {}
): Promise<AuthUser> {
  const sessionId = randomUUID()
  await firestorePatchDocument(idToken, `users/${uid}`, {
    email,
    activeSessionId: sessionId,
    ...extraProfileFields
  })
  const doc = await firestoreGetDocument(idToken, `users/${uid}`)
  const name = (doc?.name as string | undefined) ?? null

  active = {
    uid,
    email,
    name,
    idToken,
    idTokenExpiresAt: Date.now() + expiresInSeconds * 1000,
    refreshToken,
    sessionId
  }

  if (autoLogin) {
    writeStoredSession({ uid, email, refreshToken, sessionId })
  } else {
    clearStoredSession()
  }
  return toAuthUser(active)
}

/** 앱 시작 시 저장된 세션으로 자동 로그인을 시도한다. 실패하거나 다른 기기에서 이미 로그인된 상태면 null. */
export async function restoreSession(): Promise<AuthUser | null> {
  const stored = readStoredSession()
  if (!stored) return null

  let refreshed
  try {
    refreshed = await firebaseRefreshIdToken(stored.refreshToken)
  } catch {
    clearStoredSession()
    return null
  }

  active = {
    uid: refreshed.uid,
    email: stored.email,
    name: null,
    idToken: refreshed.idToken,
    idTokenExpiresAt: Date.now() + refreshed.expiresInSeconds * 1000,
    refreshToken: refreshed.refreshToken,
    sessionId: stored.sessionId
  }
  writeStoredSession({ ...stored, refreshToken: refreshed.refreshToken })

  const stillActive = await checkSessionStillActive()
  if (!stillActive) return null

  return toAuthUser(active)
}

export function logout(): void {
  clearStoredSession()
  active = null
}

export function getCurrentUser(): AuthUser | null {
  return active ? toAuthUser(active) : null
}

async function getValidIdToken(): Promise<string> {
  if (!active) throw new Error('로그인 상태가 아닙니다.')
  if (Date.now() < active.idTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) return active.idToken

  const refreshed = await firebaseRefreshIdToken(active.refreshToken)
  active = {
    ...active,
    idToken: refreshed.idToken,
    idTokenExpiresAt: Date.now() + refreshed.expiresInSeconds * 1000,
    refreshToken: refreshed.refreshToken
  }
  const stored = readStoredSession()
  if (stored) writeStoredSession({ ...stored, refreshToken: refreshed.refreshToken } as StoredSession)
  return active.idToken
}

/**
 * 이 기기의 sessionId가 여전히 Firestore상 "활성 세션"인지 확인한다.
 * 다른 기기에서 로그인해 activeSessionId가 바뀌었으면 로컬 세션을 정리하고 false를 반환한다.
 */
export async function checkSessionStillActive(): Promise<boolean> {
  if (!active) return false
  const idToken = await getValidIdToken()
  const doc = await firestoreGetDocument(idToken, `users/${active.uid}`)
  const remoteSessionId = doc?.activeSessionId as string | undefined
  if (remoteSessionId && remoteSessionId !== active.sessionId) {
    logout()
    return false
  }
  active = { ...active, name: (doc?.name as string | undefined) ?? active.name }
  return true
}

/** 현재 비밀번호로 본인 확인 후 새 비밀번호로 변경한다. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!active) throw new Error('로그인 상태가 아닙니다.')
  if (!active.email) throw new Error('이메일 계정만 비밀번호를 변경할 수 있습니다.')

  await firebaseSignIn(active.email, currentPassword)

  const idToken = await getValidIdToken()
  const updated = await firebaseUpdatePassword(idToken, newPassword)

  active = {
    ...active,
    idToken: updated.idToken,
    idTokenExpiresAt: Date.now() + updated.expiresInSeconds * 1000,
    refreshToken: updated.refreshToken
  }

  const stored = readStoredSession()
  if (stored) writeStoredSession({ ...stored, refreshToken: updated.refreshToken })
}

export async function getIdTokenForSync(): Promise<{ idToken: string; uid: string }> {
  if (!active) throw new Error('로그인 상태가 아닙니다.')
  const idToken = await getValidIdToken()
  return { idToken, uid: active.uid }
}
