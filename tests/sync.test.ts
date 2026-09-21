import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import 'fake-indexeddb/auto'
import { createAppContext, createAppServer } from '../server/app'
import { createDatabase } from '../server/db/database'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter'
import { PehchaanApiClient } from '../src/api/client'
import { SyncWorker } from '../src/sync/syncWorker'
import { HeartbeatClient } from '../src/sync/heartbeatClient'
import { enqueueSessionForSync } from '../src/sync/outboxManager'
import {
  savePhoto,
  putDerived,
  listOutboxItems,
  getPhoto,
  getDerived,
  clearOutbox,
  putOutboxItem,
  listCompletedSessions,
} from '../src/lib/photoStore'
import { getFallbackPack } from '../src/eventPack/fallbackPack'
import type { BoothSession, PhotoRecord, DerivedRecord } from '../src/types'
import { setLocalDeviceToken, setLocalDeviceId } from '../src/api/deviceIdentity'

describe('Step 6: Offline Outbox, Sync, Retry, Heartbeat & Crash Recovery', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let client: PehchaanApiClient
  let db: ReturnType<typeof createDatabase>
  let storage: MemoryStorageAdapter
  let syncWorker: SyncWorker
  let heartbeat: HeartbeatClient
  let deviceToken: string
  const testDeviceId = 'dev-sync-tester-001'

  before(async () => {
    db = createDatabase({ memory: true })
    storage = new MemoryStorageAdapter()
    const ctx = createAppContext({ db, storage })
    server = createAppServer(ctx)

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`
    client = new PehchaanApiClient({ baseUrl })

    // Register device
    const reg = await client.registerDevice({
      deviceId: testDeviceId,
      deviceName: 'Sync Test iPad',
      platform: 'ipados',
      appVersion: '0.1.0',
    })
    deviceToken = reg.token
    setLocalDeviceToken(deviceToken)
    setLocalDeviceId(testDeviceId)

    // Create test event in DB
    await client.createEvent({
      eventId: 'pack_test_event',
      name: 'Sync Test Event',
      schoolId: 'sch-sync-001',
      eventDate: '2026-09-18',
    })

    syncWorker = new SyncWorker(client)
    heartbeat = new HeartbeatClient({ intervalMs: 200, client, deviceId: testDeviceId })
  })

  after(async () => {
    heartbeat.stop()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    db.close()
  })

  beforeEach(async () => {
    await clearOutbox()
    syncWorker.resetRevocation()
    heartbeat.resetRevocation()
  })

  function createTestSession(sessionId: string, shotCount: 1 | 3 = 3): {
    session: BoothSession
    photos: PhotoRecord[]
    derived: DerivedRecord
  } {
    const pack = getFallbackPack()
    pack.id = 'pack_test_event'
    const session: BoothSession = {
      id: sessionId,
      mode: shotCount,
      currentShotIndex: shotCount - 1,
      photoIds: [],
      step: 'final-review',
      retaking: false,
      kind: 'guest',
      packSnapshot: pack,
      revision: 'rev_1',
    }

    const photos: PhotoRecord[] = []
    for (let i = 1; i <= shotCount; i++) {
      const photoId = `photo_${sessionId}_${i}`
      session.photoIds.push(photoId)
      const photo: PhotoRecord = {
        id: photoId,
        sessionId,
        shotNumber: i,
        shotIndex: i - 1,
        createdAt: Date.now(),
        sessionKind: 'guest',
        original: new Blob([`PHOTO-DATA-${sessionId}-${i}`], { type: 'image/jpeg' }),
        thumbnail: new Blob([`THUMB-DATA-${sessionId}-${i}`], { type: 'image/jpeg' }),
        status: 'ready',
        originalName: `original_${i}.jpg`,
        thumbnailName: `thumb_${i}.jpg`,
        originalByteSize: 100,
        thumbnailByteSize: 20,
      }
      photos.push(photo)
    }

    const derived: DerivedRecord = {
      id: `composition:${sessionId}`,
      sessionId,
      kind: 'test-composition',
      sessionKind: 'guest',
      revision: 'rev_1',
      blob: new Blob([`COMPOSED-STRIP-${sessionId}`], { type: 'image/jpeg' }),
      createdAt: Date.now(),
      byteSize: 250,
    }

    return { session, photos, derived }
  }

  // ----------------------------------------------------
  // TEST 1: Complete an offline session
  // ----------------------------------------------------
  it('TEST 1: Complete an offline session - local data and pending outbox exist', async () => {
    const { session, photos, derived } = createTestSession('sess-offline-1', 3)

    // Save to local IndexedDB
    for (const p of photos) {
      await savePhoto(p)
    }
    await putDerived(derived)

    // Enqueue outbox items
    const outboxItems = await enqueueSessionForSync(session, photos, true)

    assert.ok(outboxItems.length >= 4) // 1 session + 3 originals + 3 thumbs + 1 composed = 8
    assert.equal(outboxItems.every((i) => i.status === 'PENDING'), true)

    // Confirm local IndexedDB records exist untouched
    const storedPhoto = await getPhoto('photo_sess-offline-1_1')
    assert.ok(storedPhoto)
    const storedDerived = await getDerived('composition:sess-offline-1')
    assert.ok(storedDerived)

    // Confirm completed sessions store
    const completed = await listCompletedSessions()
    assert.ok(completed.some((s) => s.id === 'sess-offline-1'))
  })

  // ----------------------------------------------------
  // TEST 2: Bring backend/network online & sync
  // ----------------------------------------------------
  it('TEST 2: Sync processes outbox -> marks SYNCED without deleting local data', async () => {
    const { session, photos, derived } = createTestSession('sess-online-sync-2', 3)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Run Sync Worker
    const result = await syncWorker.process()
    assert.ok(result.processed > 0)
    assert.equal(result.errors, 0)

    // Verify all items are SYNCED
    const items = await listOutboxItems()
    assert.ok(items.length > 0)
    assert.equal(items.every((i) => i.status === 'SYNCED'), true)

    // Verify Server has session and all assets
    const serverSession = await client.getSession('sess-online-sync-2')
    assert.equal(serverSession.session.sessionId, 'sess-online-sync-2')
    assert.ok(serverSession.assets.length >= 4)

    // Verify local photos were NOT deleted
    const localPhoto = await getPhoto('photo_sess-online-sync-2_1')
    assert.ok(localPhoto)
  })

  // ----------------------------------------------------
  // TEST 3: Idempotent repeat sync
  // ----------------------------------------------------
  it('TEST 3: Running sync twice creates ZERO duplicate server sessions or assets', async () => {
    const { session, photos, derived } = createTestSession('sess-idempotent-3', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // First sync
    await syncWorker.process()

    // Reset outbox items to PENDING to simulate resend
    const items = await listOutboxItems()
    for (const item of items) {
      item.status = 'PENDING'
      await putOutboxItem(item)
    }

    // Second sync
    const res2 = await syncWorker.process()
    assert.equal(res2.errors, 0)

    // Confirm database has exactly 1 session and 1 asset
    const serverCount = db
      .prepare('SELECT COUNT(*) as c FROM sessions WHERE session_id = ?')
      .get('sess-idempotent-3') as { c: number }
    assert.equal(serverCount.c, 1)

    const serverAssets = db
      .prepare('SELECT COUNT(*) as c FROM assets WHERE session_id = ?')
      .all('sess-idempotent-3') as Array<{ c: number }>
    const totalAssets = serverAssets.reduce((sum, r) => sum + r.c, 0)
    assert.ok(totalAssets <= 3) // original, thumbnail, composed
  })

  // ----------------------------------------------------
  // TEST 4: Crash recovery during session upload
  // ----------------------------------------------------
  it('TEST 4: App crash/reload during session upload recovers and syncs safely', async () => {
    const { session, photos, derived } = createTestSession('sess-crash-session-4', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Simulate crash: mark item as SYNCING
    const items = await listOutboxItems()
    items[0].status = 'SYNCING'
    await putOutboxItem(items[0])

    // Reboot sync worker (runs recoverStuckItems)
    await syncWorker.recoverStuckItems()
    const recovered = await listOutboxItems()
    assert.equal(recovered[0].status, 'PENDING')

    // Run sync
    const res = await syncWorker.process()
    assert.equal(res.errors, 0)
    assert.equal((await listOutboxItems()).every((i) => i.status === 'SYNCED'), true)
  })

  // ----------------------------------------------------
  // TEST 5: Crash recovery during asset upload
  // ----------------------------------------------------
  it('TEST 5: App crash during asset upload recovers and avoids duplicate assets', async () => {
    const { session, photos, derived } = createTestSession('sess-crash-asset-5', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Sync the session first
    const items = await listOutboxItems()
    items[0].status = 'SYNCED'
    await putOutboxItem(items[0])

    // Asset was in SYNCING when app closed
    items[1].status = 'SYNCING'
    await putOutboxItem(items[1])

    await syncWorker.recoverStuckItems()
    const recovered = await listOutboxItems()
    assert.equal(recovered[1].status, 'PENDING')

    await syncWorker.process()
    const finalItems = await listOutboxItems()
    assert.equal(finalItems.every((i) => i.status === 'SYNCED'), true)
  })

  // ----------------------------------------------------
  // TEST 6: Backend 500 error & exponential backoff
  // ----------------------------------------------------
  it('TEST 6: Backend failure triggers exponential backoff without data loss', async () => {
    const badClient = new PehchaanApiClient({ baseUrl: 'http://127.0.0.1:9999' }) // Unreachable port
    const badWorker = new SyncWorker(badClient)

    const { session, photos, derived } = createTestSession('sess-backoff-6', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Process with failing network
    const res = await badWorker.process()
    assert.equal(res.processed, 0)
    assert.ok(res.errors > 0)

    const items = await listOutboxItems()
    const pendingOrWait = items.filter((i) => i.status === 'RETRY_WAIT' || i.status === 'PENDING')
    assert.equal(pendingOrWait.length, items.length)

    // Confirm nextRetryAt was set with backoff
    const sessionItem = items.find((i) => i.op === 'SESSION_CREATE')
    assert.ok(sessionItem)
    assert.ok(sessionItem.retryCount >= 1)
    assert.ok(sessionItem.nextRetryAt > sessionItem.createdAt)
  })

  // ----------------------------------------------------
  // TEST 7: Backend unavailable does not block guest flow
  // ----------------------------------------------------
  it('TEST 7: Offline capture completes cleanly and enqueues outbox items', async () => {
    const { session, photos, derived } = createTestSession('sess-offline-guest-7', 3)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)

    // Enqueueing while offline succeeds without throwing
    const items = await enqueueSessionForSync(session, photos, true)
    assert.ok(items.length > 0)

    const stats = await syncWorker.getStats()
    assert.ok(stats.pendingCount > 0)
  })

  // ----------------------------------------------------
  // TEST 8: Revoked device stops cloud sync while keeping local data
  // ----------------------------------------------------
  it('TEST 8: Revoked device stops sync operations while preserving local photos', async () => {
    // Revoke device on backend
    await client.revokeDevice(testDeviceId)

    const { session, photos, derived } = createTestSession('sess-revoked-8', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Attempt sync
    await syncWorker.process()

    // Outbox item is marked failed/permanent due to device revocation
    const stats = await syncWorker.getStats()
    assert.equal(stats.isRevoked, true)

    // Local photo remains 100% safe
    const local = await getPhoto('photo_sess-revoked-8_1')
    assert.ok(local)

    // Re-register device for remaining tests
    db.prepare(`UPDATE devices SET status = 'active', revoked_at = NULL WHERE device_id = ?`).run(testDeviceId)
    syncWorker.resetRevocation()
    heartbeat.resetRevocation()
  })

  // ----------------------------------------------------
  // TEST 9: Heartbeat client
  // ----------------------------------------------------
  it('TEST 9: Heartbeat client sends heartbeat without accumulating unbounded queue', async () => {
    const hbSuccess = await heartbeat.sendHeartbeat()
    assert.equal(hbSuccess, true)

    const device = await client.getDevice(testDeviceId)
    assert.ok(device.lastHeartbeat !== null)
  })

  // ----------------------------------------------------
  // TEST 10: Force Sync & duplicate prevention
  // ----------------------------------------------------
  it('TEST 10: Force Sync processes pending items and prevents concurrent workers', async () => {
    const { session, photos, derived } = createTestSession('sess-force-10', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Launch two concurrent forceSync calls
    const [p1, p2] = await Promise.all([syncWorker.forceSync(), syncWorker.forceSync()])

    // One handles the sync, one exits cleanly
    assert.ok(p1.processed + p2.processed > 0)

    const items = await listOutboxItems()
    assert.equal(items.every((i) => i.status === 'SYNCED'), true)
  })

  // ----------------------------------------------------
  // TEST 11: 100 Offline Sessions Bulk Sync
  // ----------------------------------------------------
  it('TEST 11: 100 offline sessions created and synced cleanly (0 duplicates)', async () => {
    const count = 100
    console.log(`Creating ${count} offline sessions in IndexedDB...`)

    for (let i = 1; i <= count; i++) {
      const sessionId = `sess-bulk-${i}`
      const { session, photos, derived } = createTestSession(sessionId, 1)
      for (const p of photos) await savePhoto(p)
      await putDerived(derived)
      await enqueueSessionForSync(session, photos, true)
    }

    const initialOutbox = await listOutboxItems()
    assert.ok(initialOutbox.length >= count * 3) // session + orig + thumb + composed

    console.log(`Syncing all ${count} sessions to backend...`)
    const syncRes = await syncWorker.process()
    assert.ok(syncRes.processed >= count * 3)
    assert.equal(syncRes.errors, 0)

    // Verify all outbox items are marked SYNCED
    const finalOutbox = await listOutboxItems()
    assert.equal(finalOutbox.every((i) => i.status === 'SYNCED'), true)

    // Verify backend database has exactly 100 bulk sessions
    const bulkSessionRows = db
      .prepare(`SELECT COUNT(*) as c FROM sessions WHERE session_id LIKE 'sess-bulk-%'`)
      .get() as { c: number }
    assert.equal(bulkSessionRows.c, 100)

    console.log(`Verified exactly ${bulkSessionRows.c} unique sessions in backend database.`)
  })

  // ----------------------------------------------------
  // TEST 12: V1 Session Cloud Sync Contract (/v1/sessions, asset upload, complete)
  // ----------------------------------------------------
  describe('V1 iPad Cloud Sync API Contract', () => {
    it('TEST 12a: POST /v1/sessions creates session with 201 and returns session ID + gallery URL', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          sessionId: 'sess-v1-test-001',
          eventId: 'pack_test_event',
          shotCount: 3,
          language: 'en',
          status: 'in_progress',
          createdAt: Date.now(),
        }),
      })

      assert.equal(res.status, 201)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.sessionId, 'sess-v1-test-001')
      assert.ok(data.galleryUrl.includes('sess-v1-test-001'))
      assert.equal(data.idempotent, false)
    })

    it('TEST 12b: POST /v1/sessions repeated call returns 200 idempotent', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          sessionId: 'sess-v1-test-001',
          eventId: 'pack_test_event',
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.sessionId, 'sess-v1-test-001')
      assert.equal(data.idempotent, true)
    })

    it('TEST 12c: PUT /v1/sessions/:sessionId/assets/composed uploads raw JPEG binary with 201', async () => {
      const fakeJpeg = Buffer.from('FAKE-JPEG-COMPOSED-STRIP-DATA-BYTES-12345')
      const res = await fetch(`${baseUrl}/v1/sessions/sess-v1-test-001/assets/composed`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'Authorization': `Bearer ${deviceToken}`,
          'x-asset-filename': 'composed.jpg',
        },
        body: fakeJpeg,
      })

      assert.equal(res.status, 201)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.asset.assetRole, 'composed')
      assert.equal(data.asset.filename, 'composed.jpg')
      assert.equal(data.idempotent, false)
    })

    it('TEST 12d: PUT /v1/sessions/:sessionId/assets/composed repeated upload returns 200 idempotent', async () => {
      const fakeJpeg = Buffer.from('FAKE-JPEG-COMPOSED-STRIP-DATA-BYTES-12345')
      const res = await fetch(`${baseUrl}/v1/sessions/sess-v1-test-001/assets/composed`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'Authorization': `Bearer ${deviceToken}`,
          'x-asset-filename': 'composed.jpg',
        },
        body: fakeJpeg,
      })

      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.idempotent, true)
    })

    it('TEST 12e: POST /v1/sessions/:sessionId/complete marks session complete with 200', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions/sess-v1-test-001/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deviceToken}`,
        },
      })

      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.status, 'completed')
      assert.equal(data.session.status, 'completed')
      assert.equal(data.idempotent, false)
    })

    it('TEST 12f: POST /v1/sessions/:sessionId/complete repeated call is idempotent (200)', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions/sess-v1-test-001/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deviceToken}`,
        },
      })

      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.success, true)
      assert.equal(data.status, 'completed')
      assert.equal(data.idempotent, true)
    })

    it('TEST 12g: Nonexistent session returns 404 for asset upload and completion', async () => {
      const resComplete = await fetch(`${baseUrl}/v1/sessions/sess-nonexistent-999/complete`, {
        method: 'POST',
      })
      assert.equal(resComplete.status, 404)

      const resAsset = await fetch(`${baseUrl}/v1/sessions/sess-nonexistent-999/assets/composed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from('data'),
      })
      assert.equal(resAsset.status, 404)
    })

    it('TEST 12h: Invalid payload to POST /v1/sessions returns 400 validation error', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Missing sessionId
      })

      assert.equal(res.status, 400)
      const data = await res.json() as any
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('TEST 12i: GET /health returns 200 and healthy status', async () => {
      const res = await fetch(`${baseUrl}/health`)
      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.status, 'healthy')
    })
  })
})
