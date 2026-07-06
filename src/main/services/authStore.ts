import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const SESSION_FILE = 'auth-session.enc'
const REMEMBERED_EMAIL_FILE = 'remembered-email.json'
const SYNC_STATE_FILE = 'sync-state.json'
const LOCAL_KEY_FILE = 'local.key'

export interface StoredSession {
  uid: string
  email: string | null
  refreshToken: string
  sessionId: string
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), SESSION_FILE)
}

/**
 * macOS Keychain(safeStorage)에 맡기면 애드혹 서명(scripts/afterSign.js)이 리빌드마다 서명
 * 아이덴티티를 바꿔서 매번 "Keychain 접근 허용" 암호 입력 창이 뜬다. 자동 로그인의 목적(재로그인
 * 생략)과 정면으로 배치되므로, OS Keychain 대신 앱 전용 로컬 키 파일로 자체 암호화한다.
 */
function localKeyFilePath(): string {
  return join(app.getPath('userData'), LOCAL_KEY_FILE)
}

function getOrCreateLocalKey(): Buffer {
  const filePath = localKeyFilePath()
  if (existsSync(filePath)) return readFileSync(filePath)
  const key = randomBytes(32)
  writeFileSync(filePath, key, { mode: 0o600 })
  return key
}

function encryptLocal(plainText: string): Buffer {
  const key = getOrCreateLocalKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}

function decryptLocal(data: Buffer): string {
  const key = getOrCreateLocalKey()
  const iv = data.subarray(0, 12)
  const authTag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
}

export function readStoredSession(): StoredSession | null {
  const filePath = sessionFilePath()
  if (!existsSync(filePath)) return null
  try {
    const encrypted = readFileSync(filePath)
    const decrypted = decryptLocal(encrypted)
    return JSON.parse(decrypted) as StoredSession
  } catch {
    return null
  }
}

export function writeStoredSession(session: StoredSession): void {
  const encrypted = encryptLocal(JSON.stringify(session))
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
