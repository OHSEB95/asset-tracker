import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_FILE = 'auth-session.enc'
const REMEMBERED_EMAIL_FILE = 'remembered-email.json'
const SYNC_STATE_FILE = 'sync-state.json'

export interface StoredSession {
  uid: string
  email: string | null
  refreshToken: string
  sessionId: string
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), SESSION_FILE)
}

export function readStoredSession(): StoredSession | null {
  const filePath = sessionFilePath()
  if (!existsSync(filePath)) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const encrypted = readFileSync(filePath)
    const decrypted = safeStorage.decryptString(encrypted)
    return JSON.parse(decrypted) as StoredSession
  } catch {
    return null
  }
}

export function writeStoredSession(session: StoredSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 기기에서는 자동 로그인 정보를 안전하게 저장할 수 없습니다.')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(session))
  writeFileSync(sessionFilePath(), encrypted)
}

export function clearStoredSession(): void {
  const filePath = sessionFilePath()
  if (existsSync(filePath)) unlinkSync(filePath)
}

function rememberedEmailFilePath(): string {
  return join(app.getPath('userData'), REMEMBERED_EMAIL_FILE)
}

/** 로그인 화면에 프리필할 이메일. 계정 비밀번호와 무관한 단순 편의 정보라 암호화하지 않는다. */
export function readRememberedEmail(): string | null {
  const filePath = rememberedEmailFilePath()
  if (!existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { email?: string }
    return parsed.email ?? null
  } catch {
    return null
  }
}

export function writeRememberedEmail(email: string | null): void {
  const filePath = rememberedEmailFilePath()
  if (!email) {
    if (existsSync(filePath)) unlinkSync(filePath)
    return
  }
  writeFileSync(filePath, JSON.stringify({ email }), 'utf-8')
}

function syncStateFilePath(): string {
  return join(app.getPath('userData'), SYNC_STATE_FILE)
}

/**
 * 이 기기가 마지막으로 실제로 반영한(pull로 받아왔거나 push로 직접 써넣은) 클라우드의
 * lastSyncedAt 값. push 직전에 클라우드의 실제 lastSyncedAt과 비교해 이 기기가 모르는 사이
 * 다른 기기가 더 최신으로 동기화했는지 감지하는 데 쓴다.
 */
export function readKnownRemoteSyncedAt(): string | null {
  const filePath = syncStateFilePath()
  if (!existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { knownRemoteSyncedAt?: string }
    return parsed.knownRemoteSyncedAt ?? null
  } catch {
    return null
  }
}

export function writeKnownRemoteSyncedAt(value: string | null): void {
  const filePath = syncStateFilePath()
  if (!value) {
    if (existsSync(filePath)) unlinkSync(filePath)
    return
  }
  writeFileSync(filePath, JSON.stringify({ knownRemoteSyncedAt: value }), 'utf-8')
}
