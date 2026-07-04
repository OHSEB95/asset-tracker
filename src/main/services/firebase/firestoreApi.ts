import { getFirebaseConfig } from './config'

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }

function encodeValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  throw new Error(`Firestore로 인코딩할 수 없는 값입니다: ${typeof v}`)
}

function decodeValue(v: Record<string, unknown>): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('doubleValue' in v) return v.doubleValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('stringValue' in v) return v.stringValue
  if ('arrayValue' in v) {
    const values = ((v.arrayValue as { values?: Record<string, unknown>[] }).values ?? []) as Record<
      string,
      unknown
    >[]
    return values.map(decodeValue)
  }
  return null
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(obj)) fields[k] = encodeValue(v)
  return fields
}

export function fromFirestoreFields(
  fields: Record<string, Record<string, unknown>> | undefined
): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields ?? {})) obj[k] = decodeValue(v)
  return obj
}

function docsBaseUrl(): string {
  const { projectId } = getFirebaseConfig()
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

function authHeaders(idToken: string): Record<string, string> {
  return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }
}

async function throwOnError(res: Response): Promise<never> {
  let message = res.statusText
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    message = body.error?.message ?? message
  } catch {
    // ignore
  }
  throw new Error(`Firestore 요청 실패: ${message}`)
}

export interface FirestoreDoc {
  id: string
  fields: Record<string, unknown>
}

/** collectionPath 하위의 모든 문서를 페이지네이션하며 전부 읽어온다. */
export async function firestoreListCollection(
  idToken: string,
  collectionPath: string
): Promise<FirestoreDoc[]> {
  const docs: FirestoreDoc[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${docsBaseUrl()}/${collectionPath}`)
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, { headers: authHeaders(idToken) })
    if (res.status === 404) return docs
    if (!res.ok) return throwOnError(res)
    const data = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>> }>
      nextPageToken?: string
    }
    for (const d of data.documents ?? []) {
      const id = d.name.split('/').pop()!
      docs.push({ id, fields: fromFirestoreFields(d.fields) })
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return docs
}

export async function firestoreGetDocument(
  idToken: string,
  docPath: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${docsBaseUrl()}/${docPath}`, { headers: authHeaders(idToken) })
  if (res.status === 404) return null
  if (!res.ok) return throwOnError(res)
  const data = (await res.json()) as { fields?: Record<string, Record<string, unknown>> }
  return fromFirestoreFields(data.fields)
}

/** 문서 전체를 지정된 필드로 덮어쓴다 (없으면 생성). */
export async function firestoreSetDocument(
  idToken: string,
  docPath: string,
  fields: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${docsBaseUrl()}/${docPath}`, {
    method: 'PATCH',
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(fields) })
  })
  if (!res.ok) return throwOnError(res)
}

/** 문서의 일부 필드만 병합 업데이트한다. */
export async function firestorePatchDocument(
  idToken: string,
  docPath: string,
  fields: Record<string, unknown>
): Promise<void> {
  const url = new URL(`${docsBaseUrl()}/${docPath}`)
  for (const key of Object.keys(fields)) url.searchParams.append('updateMask.fieldPaths', key)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(fields) })
  })
  if (!res.ok) return throwOnError(res)
}

export type FirestoreWrite =
  | { kind: 'set'; docPath: string; fields: Record<string, unknown> }
  | { kind: 'delete'; docPath: string }

/** 여러 문서 쓰기/삭제를 한 번에 원자적으로 반영한다 (최대 400개씩 분할). */
export async function firestoreCommit(idToken: string, writes: FirestoreWrite[]): Promise<void> {
  const { projectId } = getFirebaseConfig()
  const docName = (docPath: string): string =>
    `projects/${projectId}/databases/(default)/documents/${docPath}`

  const chunkSize = 400
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize)
    const body = {
      writes: chunk.map((w) =>
        w.kind === 'delete'
          ? { delete: docName(w.docPath) }
          : { update: { name: docName(w.docPath), fields: toFirestoreFields(w.fields) } }
      )
    }
    const res = await fetch(`${docsBaseUrl()}:commit`, {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify(body)
    })
    if (!res.ok) return throwOnError(res)
  }
}
