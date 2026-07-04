import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_FILE = 'auth-session.enc'
const REMEMBERED_EMAIL_FILE = 'remembered-email.json'

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
