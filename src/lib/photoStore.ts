import type { EventPack } from '../eventPack/types'
import { validateSession } from './validateSession'
import { photoByteSize } from '../media/buildPhotoRecord'
import type { BoothSession, DerivedRecord, PhotoRecord, PhotoStatus, StorageStats } from '../types'
import { originalFileName, thumbnailFileName } from '../types'
import { StorageError, toStorageError } from './storageError'
import type { OutboxItem, CompletedSessionRecord } from '../sync/types'

const DB_NAME = 'pehchaan-photobooth'
const DB_VERSION = 4
const PHOTO_STORE = 'photos'
const META_STORE = 'meta'
const DERIVED_STORE = 'derived'
export const OUTBOX_STORE = 'outbox'
export const COMPLETED_SESSIONS_STORE = 'completed_sessions'
const ACTIVE_SESSION_KEY = 'activeSession'
export const EVENT_PACK_KEY = 'eventPack'
export const EVENT_STATUS_KEY = 'eventStatus'
export const STAFF_AUTH_KEY = 'staffAuth'
export const ACTIVE_EVENT_DETAILS_KEY = 'activeEventDetails'

type MetaRecord = {
  key: string
  session?: BoothSession | null
  value?: unknown
}

let dbPromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(toStorageError(request.error))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(toStorageError(transaction.error))
    transaction.onerror = () => reject(toStorageError(transaction.error))
  })
}

function isPhotoStatus(value: unknown): value is PhotoStatus {
  return value === 'captured' || value === 'ready' || value === 'processing_failed'
}

export function normalizePhoto(raw: unknown): PhotoRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as Record<string, unknown>
  const original =
    record.original instanceof Blob
      ? record.original
      : record.blob instanceof Blob
        ? record.blob
        : null

  if (!original) {
    return null
  }

  const id = typeof record.id === 'string' ? record.id : null
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : null
  if (!id || !sessionId) {
    return null
  }

  const shotIndex = typeof record.shotIndex === 'number' ? record.shotIndex : 0
  const shotNumber =
    typeof record.shotNumber === 'number' ? record.shotNumber : shotIndex + 1
  const thumbnail = record.thumbnail instanceof Blob ? record.thumbnail : null

  return {
    id,
    sessionId,
    shotNumber,
    shotIndex,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
    sessionKind: record.sessionKind === 'test' ? 'test' : 'guest',
    original,
    thumbnail,
    status: isPhotoStatus(record.status) ? record.status : thumbnail ? 'ready' : 'captured',
    originalName:
      typeof record.originalName === 'string'
        ? record.originalName
        : originalFileName(shotNumber),
    thumbnailName:
      typeof record.thumbnailName === 'string'
        ? record.thumbnailName
        : thumbnailFileName(shotNumber),
    originalByteSize:
      typeof record.originalByteSize === 'number' ? record.originalByteSize : original.size,
    thumbnailByteSize:
      typeof record.thumbnailByteSize === 'number'
        ? record.thumbnailByteSize
        : thumbnail?.size ?? 0,
  }
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new StorageError('unavailable', 'Photo storage is not available in this browser.'),
    )
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(toStorageError(error))
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const photos = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
        photos.createIndex('sessionId', 'sessionId', { unique: false })
        photos.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(DERIVED_STORE)) {
        const derived = db.createObjectStore(DERIVED_STORE, { keyPath: 'id' })
        derived.createIndex('sessionId', 'sessionId', { unique: false })
      }

      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
        outbox.createIndex('status', 'status', { unique: false })
        outbox.createIndex('sessionId', 'sessionId', { unique: false })
        outbox.createIndex('op', 'op', { unique: false })
        outbox.createIndex('createdAt', 'createdAt', { unique: false })
        outbox.createIndex('nextRetryAt', 'nextRetryAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) {
        const sessions = db.createObjectStore(COMPLETED_SESSIONS_STORE, { keyPath: 'id' })
        sessions.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onclose = () => {
        dbPromise = null
      }
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }

    request.onerror = () => reject(toStorageError(request.error))
    request.onblocked = () =>
      reject(
        new StorageError(
          'failed',
          'Photo storage is blocked by another tab. Close other Pehchaan windows and try again.',
        ),
      )
  })
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((error) => {
      dbPromise = null
      throw toStorageError(error)
    })
  }

  return dbPromise
}

export async function assertStoreAvailable(): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(META_STORE, 'readonly')
  transaction.objectStore(META_STORE)
  await transactionDone(transaction)
}

export async function savePhoto(photo: PhotoRecord): Promise<PhotoRecord> {
  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readwrite')
  transaction.objectStore(PHOTO_STORE).put(photo)
  await transactionDone(transaction)
  return photo
}

export async function commitCapture(options: {
  photo: PhotoRecord
  session: BoothSession
  replacePhotoId?: string | null
}): Promise<PhotoRecord> {
  const db = await getDb()
  const transaction = db.transaction([PHOTO_STORE, META_STORE, DERIVED_STORE], 'readwrite')
  const photos = transaction.objectStore(PHOTO_STORE)
  const meta = transaction.objectStore(META_STORE)

  transaction.objectStore(DERIVED_STORE).delete(compositionDerivedId(options.session.id))
  photos.put(options.photo)
  meta.put({
    key: ACTIVE_SESSION_KEY,
    session: options.session,
    value: options.session,
  } satisfies MetaRecord)

  if (options.replacePhotoId && options.replacePhotoId !== options.photo.id) {
    photos.delete(options.replacePhotoId)
  }

  await transactionDone(transaction)
  return options.photo
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readonly')
  const result = await requestToPromise(transaction.objectStore(PHOTO_STORE).get(id))
  await transactionDone(transaction)
  return normalizePhoto(result) ?? undefined
}

export async function getPhotosByIds(ids: string[]): Promise<PhotoRecord[]> {
  if (ids.length === 0) {
    return []
  }

  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readonly')
  const store = transaction.objectStore(PHOTO_STORE)
  const records = await Promise.all(ids.map((id) => requestToPromise(store.get(id))))
  await transactionDone(transaction)

  return records
    .map((record) => normalizePhoto(record))
    .filter((record): record is PhotoRecord => Boolean(record))
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readwrite')
  transaction.objectStore(PHOTO_STORE).delete(id)
  await transactionDone(transaction)
}

export async function putDerived(record: DerivedRecord): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(DERIVED_STORE, 'readwrite')
  transaction.objectStore(DERIVED_STORE).put(record)
  await transactionDone(transaction)
}

export async function getDerived(id: string): Promise<DerivedRecord | undefined> {
  const db = await getDb()
  const transaction = db.transaction(DERIVED_STORE, 'readonly')
  const result = (await requestToPromise(
    transaction.objectStore(DERIVED_STORE).get(id),
  )) as DerivedRecord | undefined
  await transactionDone(transaction)
  return result
}

export async function deleteDerived(id: string): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(DERIVED_STORE, 'readwrite')
  transaction.objectStore(DERIVED_STORE).delete(id)
  await transactionDone(transaction)
}

export function compositionDerivedId(sessionId: string): string {
  return `composition:${sessionId}`
}

export async function getStorageStats(): Promise<StorageStats> {
  const db = await getDb()
  const stores = [PHOTO_STORE]
  if (db.objectStoreNames.contains(DERIVED_STORE)) {
    stores.push(DERIVED_STORE)
  }

  const transaction = db.transaction(stores, 'readonly')
  const photos = ((await requestToPromise(
    transaction.objectStore(PHOTO_STORE).getAll(),
  )) as unknown[]).map((record) => normalizePhoto(record))

  let derivedBytes = 0
  if (db.objectStoreNames.contains(DERIVED_STORE)) {
    const derived = (await requestToPromise(
      transaction.objectStore(DERIVED_STORE).getAll(),
    )) as DerivedRecord[]
    derivedBytes = derived.reduce((total, record) => {
      return total + (record.byteSize || record.blob.size || 0)
    }, 0)
  }

  await transactionDone(transaction)

  const photoRecords = photos.filter((record): record is PhotoRecord => Boolean(record))

  return {
    count: photoRecords.length,
    bytes:
      photoRecords.reduce((total, record) => total + photoByteSize(record), 0) + derivedBytes,
  }
}

export async function getMetaValue<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  const transaction = db.transaction(META_STORE, 'readonly')
  const record = (await requestToPromise(
    transaction.objectStore(META_STORE).get(key),
  )) as MetaRecord | undefined
  await transactionDone(transaction)
  if (!record) {
    return undefined
  }
  if (record.value !== undefined) {
    return record.value as T
  }
  if (key === ACTIVE_SESSION_KEY) {
    return (record.session ?? null) as T
  }
  return undefined
}

export async function putMetaValue(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(META_STORE, 'readwrite')
  const record: MetaRecord = { key, value }
  transaction.objectStore(META_STORE).put(record)
  await transactionDone(transaction)
}

export async function getActiveSession(legacyPack?: EventPack): Promise<BoothSession | null> {
  const raw = await getMetaValue<unknown>(ACTIVE_SESSION_KEY)
  if (raw == null) return null
  const session = validateSession(raw, legacyPack)
  if (!session) throw new StorageError('failed', 'The saved session is invalid. Return to start; stored photos will be kept.')
  return session
}

export async function putActiveSession(session: BoothSession, invalidateComposition = false): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction([META_STORE, DERIVED_STORE], 'readwrite')
  if (invalidateComposition) transaction.objectStore(DERIVED_STORE).delete(compositionDerivedId(session.id))
  const record: MetaRecord = { key: ACTIVE_SESSION_KEY, session, value: session }
  transaction.objectStore(META_STORE).put(record)
  await transactionDone(transaction)
}

export async function clearActiveSession(): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).delete(ACTIVE_SESSION_KEY)
  await transactionDone(transaction)
}

export async function listPhotoSummaries(): Promise<
  Array<{ id: string; originalName: string; status: PhotoStatus; bytes: number }>
> {
  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readonly')
  const records = (await requestToPromise(transaction.objectStore(PHOTO_STORE).getAll())) as unknown[]
  await transactionDone(transaction)

  return records
    .map((record) => normalizePhoto(record))
    .filter((record): record is PhotoRecord => Boolean(record))
    .map((photo) => ({
      id: photo.id,
      originalName: photo.originalName,
      status: photo.status,
      bytes: photoByteSize(photo),
    }))
}

export async function clearTestMedia(): Promise<void> {
  const db = await getDb()
  const transaction = db.transaction([PHOTO_STORE, META_STORE, DERIVED_STORE], 'readwrite')
  const done = transactionDone(transaction)
  // Never infer test ownership from the legacy derived kind or missing classification.
  for (const name of [PHOTO_STORE, DERIVED_STORE]) {
    const request = transaction.objectStore(name).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (cursor.value.sessionKind === 'test') cursor.delete()
      cursor.continue()
    }
  }
  const meta = transaction.objectStore(META_STORE)
  const request = meta.get(ACTIVE_SESSION_KEY)
  request.onsuccess = () => {
    const active = validateSession(request.result?.value ?? request.result?.session)
    if (active?.kind === 'test') meta.delete(ACTIVE_SESSION_KEY)
  }
  await done
}

export interface SafeCleanupReport {
  testPhotosDeleted: number
  testDerivedDeleted: number
  uploadedPhotosDeleted: number
  deletedMediaDeleted: number
  guestPhotosPreserved: number
  outboxItemsPreserved: number
  completedSessionsPreserved: number
}

export async function performSafeOperationalCleanup(): Promise<SafeCleanupReport> {
  const db = await getDb()
  let testPhotosDeleted = 0
  let testDerivedDeleted = 0
  let uploadedPhotosDeleted = 0
  let deletedMediaDeleted = 0
  let guestPhotosPreserved = 0

  const stores = [PHOTO_STORE, DERIVED_STORE, META_STORE]
  if (db.objectStoreNames.contains(OUTBOX_STORE)) stores.push(OUTBOX_STORE)
  if (db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) stores.push(COMPLETED_SESSIONS_STORE)

  const transaction = db.transaction(stores, 'readwrite')
  const done = transactionDone(transaction)

  // 1. Photo cleanup: remove uploaded, test, or deletedAt; preserve local_only, queued, failed_retryable
  const photoStore = transaction.objectStore(PHOTO_STORE)
  const photoReq = photoStore.openCursor()
  photoReq.onsuccess = () => {
    const cursor = photoReq.result
    if (!cursor) return
    const photo = cursor.value as PhotoRecord
    const isTest = photo.sessionKind === 'test'
    const isDeleted = Boolean(photo.deletedAt)
    const isUploaded = photo.uploadState === 'uploaded'
    const isProtected = photo.uploadState === 'local_only' ||
                        photo.uploadState === 'queued' ||
                        photo.uploadState === 'failed_retryable'

    if (isTest) {
      testPhotosDeleted++
      cursor.delete()
    } else if (isDeleted) {
      deletedMediaDeleted++
      cursor.delete()
    } else if (isUploaded && !isProtected) {
      uploadedPhotosDeleted++
      cursor.delete()
    } else {
      guestPhotosPreserved++
    }
    cursor.continue()
  }

  // 2. Derived cleanup: remove uploaded, test, or deletedAt
  const derivedStore = transaction.objectStore(DERIVED_STORE)
  const derivedReq = derivedStore.openCursor()
  derivedReq.onsuccess = () => {
    const cursor = derivedReq.result
    if (!cursor) return
    const derived = cursor.value as DerivedRecord
    const isTest = derived.sessionKind === 'test'
    const isDeleted = Boolean(derived.deletedAt)
    const isUploaded = derived.uploadState === 'uploaded'
    const isProtected = derived.uploadState === 'local_only' ||
                        derived.uploadState === 'queued' ||
                        derived.uploadState === 'failed_retryable'

    if (isTest) {
      testDerivedDeleted++
      cursor.delete()
    } else if (isDeleted || (isUploaded && !isProtected)) {
      cursor.delete()
    }
    cursor.continue()
  }

  // 3. Clear active session ONLY if it was a test session
  const metaStore = transaction.objectStore(META_STORE)
  const metaReq = metaStore.get(ACTIVE_SESSION_KEY)
  metaReq.onsuccess = () => {
    const active = validateSession(metaReq.result?.value ?? metaReq.result?.session)
    if (active?.kind === 'test') {
      metaStore.delete(ACTIVE_SESSION_KEY)
    }
  }

  await done

  // 4. Count preserved outbox and completed sessions
  const outboxItems = await listOutboxItems()
  const completedSessions = await listCompletedSessions()

  return {
    testPhotosDeleted,
    testDerivedDeleted,
    uploadedPhotosDeleted,
    deletedMediaDeleted,
    guestPhotosPreserved,
    outboxItemsPreserved: outboxItems.length,
    completedSessionsPreserved: completedSessions.length,
  }
}

export interface EventWipeReport {
  success: boolean
  photosDeleted: number
  derivedDeleted: number
  sessionsDeleted: number
  blockedByUnsynced: boolean
  unsyncedCount: number
  message: string
}

export async function listAllPhotos(): Promise<PhotoRecord[]> {
  const db = await getDb()
  const transaction = db.transaction(PHOTO_STORE, 'readonly')
  const records = (await requestToPromise(transaction.objectStore(PHOTO_STORE).getAll())) as unknown[]
  await transactionDone(transaction)
  return records
    .map((record) => normalizePhoto(record))
    .filter((record): record is PhotoRecord => Boolean(record))
}

export async function performSafeEventWipe(options: { force?: boolean } = {}): Promise<EventWipeReport> {
  const outboxItems = await listPendingOutboxItems()
  if (!options.force && outboxItems.length > 0) {
    return {
      success: false,
      photosDeleted: 0,
      derivedDeleted: 0,
      sessionsDeleted: 0,
      blockedByUnsynced: true,
      unsyncedCount: outboxItems.length,
      message: `Wipe blocked: ${outboxItems.length} unsynced item(s) in outbox. Sync or export before wiping.`,
    }
  }

  const db = await getDb()
  const photosCount = (await requestToPromise(db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).count())) || 0
  const derivedCount = (await requestToPromise(db.transaction(DERIVED_STORE, 'readonly').objectStore(DERIVED_STORE).count())) || 0
  let sessionsCount = 0
  if (db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) {
    sessionsCount = (await requestToPromise(db.transaction(COMPLETED_SESSIONS_STORE, 'readonly').objectStore(COMPLETED_SESSIONS_STORE).count())) || 0
  }

  const stores = [PHOTO_STORE, DERIVED_STORE, META_STORE]
  if (db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) stores.push(COMPLETED_SESSIONS_STORE)

  const transaction = db.transaction(stores, 'readwrite')
  const done = transactionDone(transaction)

  transaction.objectStore(PHOTO_STORE).clear()
  transaction.objectStore(DERIVED_STORE).clear()
  if (db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) {
    transaction.objectStore(COMPLETED_SESSIONS_STORE).clear()
  }

  const metaStore = transaction.objectStore(META_STORE)
  metaStore.delete(ACTIVE_SESSION_KEY)

  await done

  return {
    success: true,
    photosDeleted: photosCount,
    derivedDeleted: derivedCount,
    sessionsDeleted: sessionsCount,
    blockedByUnsynced: false,
    unsyncedCount: 0,
    message: `Event data wiped cleanly: ${photosCount} photo(s), ${derivedCount} derived composite(s), and ${sessionsCount} session(s) deleted. Device identity and configuration preserved.`,
  }
}


export async function putSessionComposition(record: DerivedRecord, isCurrent: () => boolean): Promise<boolean> {
  const db = await getDb()
  const transaction = db.transaction([META_STORE, DERIVED_STORE], 'readwrite')
  const done = transactionDone(transaction)
  let saved = false
  const request = transaction.objectStore(META_STORE).get(ACTIVE_SESSION_KEY)
  request.onsuccess = () => {
    const active = validateSession(request.result?.value ?? request.result?.session)
    if (isCurrent() && active?.id === record.sessionId && active.revision === record.revision && active.step === 'final-review') {
      transaction.objectStore(DERIVED_STORE).put(record)
      saved = true
    }
  }
  await done
  return saved
}

// ----------------------------------------------------
// OUTBOX & COMPLETED SESSIONS OPERATIONS
// ----------------------------------------------------

export async function putOutboxItem(item: OutboxItem): Promise<void> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return
  const transaction = db.transaction(OUTBOX_STORE, 'readwrite')
  transaction.objectStore(OUTBOX_STORE).put(item)
  await transactionDone(transaction)
}

export async function putOutboxItems(items: OutboxItem[]): Promise<void> {
  if (items.length === 0) return
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return
  const transaction = db.transaction(OUTBOX_STORE, 'readwrite')
  const store = transaction.objectStore(OUTBOX_STORE)
  for (const item of items) {
    store.put(item)
  }
  await transactionDone(transaction)
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return undefined
  const transaction = db.transaction(OUTBOX_STORE, 'readonly')
  const result = (await requestToPromise(
    transaction.objectStore(OUTBOX_STORE).get(id)
  )) as OutboxItem | undefined
  await transactionDone(transaction)
  return result
}

export async function listOutboxItems(): Promise<OutboxItem[]> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return []
  const transaction = db.transaction(OUTBOX_STORE, 'readonly')
  const result = (await requestToPromise(
    transaction.objectStore(OUTBOX_STORE).getAll()
  )) as OutboxItem[]
  await transactionDone(transaction)
  return result || []
}

export async function listPendingOutboxItems(): Promise<OutboxItem[]> {
  const all = await listOutboxItems()
  const now = Date.now()
  return all.filter((item) => {
    if (item.permanentFailure) return false
    if (item.status === 'PENDING') return true
    if (item.status === 'RETRY_WAIT' && now >= item.nextRetryAt) return true
    if (item.status === 'SYNCING') return true // For crash recovery
    return false
  })
}

export async function deleteOutboxItem(id: string): Promise<void> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return
  const transaction = db.transaction(OUTBOX_STORE, 'readwrite')
  transaction.objectStore(OUTBOX_STORE).delete(id)
  await transactionDone(transaction)
}

export async function clearOutbox(): Promise<void> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return
  const transaction = db.transaction(OUTBOX_STORE, 'readwrite')
  transaction.objectStore(OUTBOX_STORE).clear()
  await transactionDone(transaction)
}

export async function getOutboxStats(): Promise<{
  pending: number
  syncing: number
  synced: number
  failed: number
  total: number
}> {
  const items = await listOutboxItems()
  let pending = 0
  let syncing = 0
  let synced = 0
  let failed = 0

  for (const item of items) {
    if (item.status === 'SYNCED') {
      synced++
    } else if (item.status === 'FAILED' || item.permanentFailure) {
      failed++
    } else if (item.status === 'SYNCING') {
      syncing++
    } else {
      pending++
    }
  }

  return {
    pending,
    syncing,
    synced,
    failed,
    total: items.length,
  }
}

export async function saveCompletedSession(session: CompletedSessionRecord): Promise<void> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) return
  const transaction = db.transaction(COMPLETED_SESSIONS_STORE, 'readwrite')
  transaction.objectStore(COMPLETED_SESSIONS_STORE).put(session)
  await transactionDone(transaction)
}

export async function getCompletedSession(id: string): Promise<CompletedSessionRecord | undefined> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) return undefined
  const transaction = db.transaction(COMPLETED_SESSIONS_STORE, 'readonly')
  const result = (await requestToPromise(
    transaction.objectStore(COMPLETED_SESSIONS_STORE).get(id)
  )) as CompletedSessionRecord | undefined
  await transactionDone(transaction)
  return result
}

export async function listCompletedSessions(): Promise<CompletedSessionRecord[]> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(COMPLETED_SESSIONS_STORE)) return []
  const transaction = db.transaction(COMPLETED_SESSIONS_STORE, 'readonly')
  const result = (await requestToPromise(
    transaction.objectStore(COMPLETED_SESSIONS_STORE).getAll()
  )) as CompletedSessionRecord[]
  await transactionDone(transaction)
  return result || []
}

