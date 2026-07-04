import { getFirebaseConfig } from './config'

export interface FirebaseAuthResult {
  idToken: string
  refreshToken: string
  uid: string
  email: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: '이미 가입된 이메일입니다.',
  EMAIL_NOT_FOUND: '가입되지 않은 이메일입니다.',
  INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
  INVALID_LOGIN_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  USER_DISABLED: '비활성화된 계정입니다.',
  WEAK_PASSWORD: '비밀번호가 너무 짧습니다 (최소 8자).',
  INVALID_EMAIL: '이메일 형식이 올바르지 않습니다.',
  TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해주세요.',
  USER_NOT_FOUND: '계정을 찾을 수 없습니다. 다시 로그인해주세요.'
}

function toFriendlyMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? `인증 오류가 발생했습니다 (${code})`
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  let code = res.statusText
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    code = body.error?.message ?? code
  } catch {
    // 응답이 JSON이 아닌 경우 statusText를 그대로 사용
  }
  throw new Error(toFriendlyMessage(code))
}

async function signWithPassword(
  endpoint: 'signUp' | 'signInWithPassword',
  email: string,
  password: string
): Promise<FirebaseAuthResult> {
  const { apiKey } = getFirebaseConfig()
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  )
  if (!res.ok) return parseErrorAndThrow(res)
  const data = (await res.json()) as {
    idToken: string
    refreshToken: string
    localId: string
    email: string
  }
  return { idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId, email: data.email }
}

export function firebaseSignUp(email: string, password: string): Promise<FirebaseAuthResult> {
  return signWithPassword('signUp', email, password)
}

export function firebaseSignIn(email: string, password: string): Promise<FirebaseAuthResult> {
  return signWithPassword('signInWithPassword', email, password)
}

export interface UpdatePasswordResult {
  idToken: string
  refreshToken: string
  expiresInSeconds: number
}

export async function firebaseUpdatePassword(
  idToken: string,
  newPassword: string
): Promise<UpdatePasswordResult> {
  const { apiKey } = getFirebaseConfig()
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true })
  })
  if (!res.ok) return parseErrorAndThrow(res)
  const data = (await res.json()) as { idToken: string; refreshToken: string; expiresIn: string }
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresInSeconds: Number(data.expiresIn)
  }
}

export interface RefreshedToken {
  idToken: string
  refreshToken: string
  uid: string
  expiresInSeconds: number
}

export async function firebaseRefreshIdToken(refreshToken: string): Promise<RefreshedToken> {
  const { apiKey } = getFirebaseConfig()
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  })
  if (!res.ok) return parseErrorAndThrow(res)
  const data = (await res.json()) as {
    id_token: string
    refresh_token: string
    user_id: string
    expires_in: string
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    uid: data.user_id,
    expiresInSeconds: Number(data.expires_in)
  }
}
