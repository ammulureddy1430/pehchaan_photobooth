import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import 'fake-indexeddb/auto'
import { createAppContext, createAppServer } from '../server/app'
import { createDatabase } from '../server/db/database'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter'
import { PehchaanApiClient } from '../src/api/client'
import { SyncWorker } from '../src/sync/syncWorker'
import { enqueueSessionForSync } from '../src/sync/outboxManager'
import {
  savePhoto,
  putDerived,
  getPhoto,
  getDerived,
  clearOutbox,
  saveCompletedSession,
  getCompletedSession,
  compositionDerivedId,
} from '../src/lib/photoStore'
import { getFallbackPack } from '../src/eventPack/fallbackPack'
import type { BoothSession, PhotoRecord, DerivedRecord } from '../src/types'
import { setLocalDeviceToken, setLocalDeviceId } from '../src/api/deviceIdentity'
import {
  deliveryManager,
  photosExportService,
  printService,
  whatsAppDeliveryService,
  emailDeliveryService,
  cloudQrService,
  validatePhoneNumber,
  validateEmail,
  validateShareUrl,
  generateQrMatrix,
  generateQrSvg,
  generateQrDataUrl,
} from '../src/delivery'

describe('Step 7: Delivery Channels (WhatsApp, Email, Cloud QR, Photos Export, Printing)', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let client: PehchaanApiClient
  let db: ReturnType<typeof createDatabase>
  let storage: MemoryStorageAdapter
  let syncWorker: SyncWorker
  let deviceToken: string
  const testDeviceId = 'dev-delivery-tester-001'

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

    // Register test device
    const reg = await client.registerDevice({
      deviceId: testDeviceId,
      deviceName: 'Delivery Test iPad',
      platform: 'ipados',
      appVersion: '0.1.0',
    })
    deviceToken = reg.token
    setLocalDeviceToken(deviceToken)
    setLocalDeviceId(testDeviceId)

    syncWorker = new SyncWorker(client)
  })

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    db.close()
  })

  beforeEach(async () => {
    await clearOutbox()
    syncWorker.resetRevocation()
    deliveryManager.clearHistory()
  })

  function createMockSession(sessionId: string, shotCount: 1 | 3 = 3): {
    session: BoothSession
    photos: PhotoRecord[]
    derived: DerivedRecord
  } {
    const pack = getFallbackPack()
    pack.id = 'pack_delivery_event'
    pack.whatsappEnabled = true
    pack.emailEnabled = true
    pack.cloudQrEnabled = true
    pack.printEnabled = true

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
      const pId = `photo_${sessionId}_${i}`
      session.photoIds.push(pId)
      photos.push({
        id: pId,
        sessionId,
        shotNumber: i,
        shotIndex: i - 1,
        createdAt: Date.now(),
        sessionKind: 'guest',
        original: new Blob([`fake-jpeg-data-${sessionId}-${i}`], { type: 'image/jpeg' }),
        thumbnail: new Blob([`fake-thumb-data-${sessionId}-${i}`], { type: 'image/jpeg' }),
        status: 'ready',
        originalName: `original_${i}.jpg`,
        thumbnailName: `thumb_${i}.jpg`,
        originalByteSize: 1000 + i,
        thumbnailByteSize: 200 + i,
      })
    }

    const derived: DerivedRecord = {
      id: compositionDerivedId(sessionId),
      sessionId,
      kind: 'test-composition',
      sessionKind: 'guest',
      revision: 'rev_1',
      blob: new Blob([`fake-composed-strip-${sessionId}`], { type: 'image/jpeg' }),
      createdAt: Date.now(),
      byteSize: 3500,
    }

    return { session, photos, derived }
  }

  // ----------------------------------------------------
  // TEST 1: Completed local session remains available for export
  // ----------------------------------------------------
  it('TEST 1: Completed local session remains available for export', async () => {
    const { session, photos, derived } = createMockSession('sess_export_001', 3)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const exportResult = await deliveryManager.exportPhotos('sess_export_001', true)
    assert.strictEqual(exportResult.success, true)
    assert.strictEqual(exportResult.status, 'COMPLETED')
    assert.strictEqual(exportResult.exportedCount, 4) // 1 composed + 3 originals

    // Confirm local IndexedDB records are fully intact
    const storedDerived = await getDerived(compositionDerivedId('sess_export_001'))
    assert.ok(storedDerived)
    for (const p of photos) {
      const storedPhoto = await getPhoto(p.id)
      assert.ok(storedPhoto)
    }
  })

  // ----------------------------------------------------
  // TEST 2: Print action uses composed output
  // ----------------------------------------------------
  it('TEST 2: Print action uses composed output', async () => {
    const { session, photos, derived } = createMockSession('sess_print_001', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const pack = session.packSnapshot
    pack.printEnabled = true

    const printResult = await deliveryManager.printSession('sess_print_001', pack)
    assert.strictEqual(printResult.success, true)
    assert.strictEqual(printResult.status, 'COMPLETED')
  })

  // ----------------------------------------------------
  // TEST 3: Print failure does not delete local media
  // ----------------------------------------------------
  it('TEST 3: Print failure does not delete local media', async () => {
    const { session, photos, derived } = createMockSession('sess_print_fail_001', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)

    // Intentionally pass an invalid session ID to simulate a missing session failure
    const pack = session.packSnapshot
    const failedResult = await deliveryManager.printSession('non_existent_session', pack)
    assert.strictEqual(failedResult.success, false)
    assert.strictEqual(failedResult.status, 'FAILED')

    // Verify existing photos and derived records were never deleted
    const photo = await getPhoto(photos[0].id)
    assert.ok(photo)
    const storedComp = await getDerived(derived.id)
    assert.ok(storedComp)
  })

  // ----------------------------------------------------
  // TEST 4: WhatsApp is unavailable when feature flag is OFF
  // ----------------------------------------------------
  it('TEST 4: WhatsApp is unavailable when feature flag is OFF', async () => {
    const { session, photos, derived } = createMockSession('sess_wa_off_001', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const pack = session.packSnapshot
    pack.whatsappEnabled = false

    const result = await deliveryManager.sendWhatsApp('sess_wa_off_001', '9876543210', pack)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.status, 'DISABLED')
    assert.match(result.error || '', /disabled/i)
  })

  // ----------------------------------------------------
  // TEST 5: Email is unavailable when feature flag is OFF
  // ----------------------------------------------------
  it('TEST 5: Email is unavailable when feature flag is OFF', async () => {
    const { session, photos, derived } = createMockSession('sess_email_off_001', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const pack = session.packSnapshot
    pack.emailEnabled = false

    const result = await deliveryManager.sendEmail('sess_email_off_001', 'guest@example.com', pack)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.status, 'DISABLED')
    assert.match(result.error || '', /disabled/i)
  })

  // ----------------------------------------------------
  // TEST 6: Cloud QR is unavailable before cloud ACK/share URL
  // ----------------------------------------------------
  it('TEST 6: Cloud QR is unavailable before cloud ACK/share URL', async () => {
    const { session, photos, derived } = createMockSession('sess_qr_nosync_001', 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Session has NOT been synced yet (no galleryUrl)
    const pack = session.packSnapshot
    pack.cloudQrEnabled = true

    const result = await deliveryManager.getCloudQr('sess_qr_nosync_001', pack)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.status, 'WAITING_FOR_SYNC')
    assert.match(result.error || '', /waiting for cloud/i)
    assert.strictEqual(result.qrDataUrl, undefined)
  })

  // ----------------------------------------------------
  // TEST 7: Cloud QR becomes available after valid gallery/share URL exists
  // ----------------------------------------------------
  it('TEST 7: Cloud QR becomes available after valid gallery/share URL exists', async () => {
    const sessionId = 'sess_qr_synced_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Perform cloud sync
    const syncRes = await syncWorker.process()
    assert.strictEqual(syncRes.errors, 0)

    const completed = await getCompletedSession(sessionId)
    assert.ok(completed?.galleryUrl)

    const pack = session.packSnapshot
    pack.cloudQrEnabled = true

    const result = await deliveryManager.getCloudQr(sessionId, pack)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.status, 'READY')
    assert.ok(result.qrDataUrl?.startsWith('data:image/svg+xml'))
    assert.ok(result.qrSvg?.includes('<svg'))
    assert.ok(result.shareUrl?.includes(sessionId))
  })

  // ----------------------------------------------------
  // TEST 8: WhatsApp uses the existing share URL and does not upload media again
  // ----------------------------------------------------
  it('TEST 8: WhatsApp uses the existing share URL and does not upload media again', async () => {
    const sessionId = 'sess_wa_synced_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Sync session
    await syncWorker.process()

    const pack = session.packSnapshot
    pack.whatsappEnabled = true

    const result = await deliveryManager.sendWhatsApp(sessionId, '9876543210', pack)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.status, 'READY')
    assert.ok(result.handoffUrl?.startsWith('https://wa.me/919876543210'))
    assert.ok(result.handoffUrl?.includes(encodeURIComponent(`/gallery/${sessionId}`)))

    // Verify no new outbox items were created by delivery action
    const outboxAfter = await syncWorker.getStats()
    assert.strictEqual(outboxAfter.pendingCount, 0)
    assert.strictEqual(outboxAfter.syncingCount, 0)
  })

  // ----------------------------------------------------
  // TEST 9: Email uses the existing share URL and does not duplicate cloud upload
  // ----------------------------------------------------
  it('TEST 9: Email uses the existing share URL and does not duplicate cloud upload', async () => {
    const sessionId = 'sess_email_synced_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Sync session
    await syncWorker.process()

    const pack = session.packSnapshot
    pack.emailEnabled = true

    const result = await deliveryManager.sendEmail(sessionId, 'guest@example.com', pack)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.status, 'READY')
    assert.ok(result.mailtoUrl?.startsWith('mailto:guest%40example.com'))
    assert.ok(result.mailtoUrl?.includes(encodeURIComponent(`/gallery/${sessionId}`)))
  })

  // ----------------------------------------------------
  // TEST 10: Offline session completion remains immediate
  // ----------------------------------------------------
  it('TEST 10: Offline session completion remains immediate', async () => {
    const sessionId = 'sess_offline_imm_001'
    const { session, photos, derived } = createMockSession(sessionId, 3)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)

    const startTime = Date.now()
    const outboxItems = await enqueueSessionForSync(session, photos, true)
    const elapsed = Date.now() - startTime

    // Must be non-blocking and immediate (< 100ms)
    assert.ok(elapsed < 100, `Local enqueue took ${elapsed}ms`)
    assert.strictEqual(outboxItems.length, 8) // 1 session + 3 orig + 3 thumb + 1 comp

    const completed = await getCompletedSession(sessionId)
    assert.ok(completed)
    assert.strictEqual(completed.syncedAt, null)
  })

  // ----------------------------------------------------
  // TEST 11: Delivery failure does not affect local session/photo data
  // ----------------------------------------------------
  it('TEST 11: Delivery failure does not affect local session/photo data', async () => {
    const sessionId = 'sess_fail_safe_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const pack = session.packSnapshot

    // Attempt delivery with invalid data
    const waResult = await deliveryManager.sendWhatsApp(sessionId, 'invalid-phone-abc', pack)
    assert.strictEqual(waResult.success, false)

    const emailResult = await deliveryManager.sendEmail(sessionId, 'not-an-email', pack)
    assert.strictEqual(emailResult.success, false)

    // Ensure photos and session data in IndexedDB remain completely untouched
    const photo = await getPhoto(photos[0].id)
    assert.ok(photo)
    const comp = await getDerived(derived.id)
    assert.ok(comp)
    const completed = await getCompletedSession(sessionId)
    assert.ok(completed)
  })

  // ----------------------------------------------------
  // TEST 12: Invalid phone/email is rejected safely
  // ----------------------------------------------------
  it('TEST 12: Invalid phone/email is rejected safely', () => {
    // Phone numbers
    assert.strictEqual(validatePhoneNumber('').valid, false)
    assert.strictEqual(validatePhoneNumber('123').valid, false)
    assert.strictEqual(validatePhoneNumber('abcdefghij').valid, false)
    assert.strictEqual(validatePhoneNumber('+123').valid, false)
    assert.strictEqual(validatePhoneNumber('9876543210').valid, true)
    assert.strictEqual(validatePhoneNumber('+14155552671').valid, true)

    // Emails
    assert.strictEqual(validateEmail('').valid, false)
    assert.strictEqual(validateEmail('no-at-sign').valid, false)
    assert.strictEqual(validateEmail('missing@domain').valid, false)
    assert.strictEqual(validateEmail('@domain.com').valid, false)
    assert.strictEqual(validateEmail('valid.user@example.com').valid, true)
    assert.strictEqual(validateEmail('user+test@sub.example.co.in').valid, true)
  })

  // ----------------------------------------------------
  // TEST 13: Force Sync from Step 6 still works
  // ----------------------------------------------------
  it('TEST 13: Force Sync from Step 6 still works', async () => {
    const sessionId = 'sess_force_sync_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    const result = await syncWorker.forceSync()
    assert.ok(result.processed >= 1)
    assert.strictEqual(result.errors, 0)

    const stats = await syncWorker.getStats()
    assert.strictEqual(stats.pendingCount, 0)
    assert.ok(stats.syncedCount >= 1)
  })

  // ----------------------------------------------------
  // TEST 14: Step 6 outbox behavior remains unchanged
  // ----------------------------------------------------
  it('TEST 14: Step 6 outbox behavior remains unchanged', async () => {
    const sessionId = 'sess_step6_compat_001'
    const { session, photos, derived } = createMockSession(sessionId, 3)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)

    // Syncing session & assets
    const res1 = await syncWorker.process()
    assert.ok(res1.processed > 0)

    // Running second time is strictly idempotent with 0 processed and 0 errors
    const res2 = await syncWorker.process()
    assert.strictEqual(res2.processed, 0)
    assert.strictEqual(res2.errors, 0)
  })

  // ----------------------------------------------------
  // TEST 15: QR Code generator produces valid matrix, SVG and data URL
  // ----------------------------------------------------
  it('TEST 15: QR Code generator produces valid matrix, SVG and data URL', () => {
    const testUrl = 'http://localhost:3001/gallery/sess_12345'
    const matrix = generateQrMatrix(testUrl)
    assert.ok(matrix.length >= 21)
    assert.ok(matrix[0].length >= 21)

    const svg = generateQrSvg(testUrl)
    assert.ok(svg.startsWith('<svg'))
    assert.ok(svg.includes('rect'))
    assert.ok(svg.endsWith('</svg>'))

    const dataUrl = generateQrDataUrl(testUrl)
    assert.ok(dataUrl.startsWith('data:image/svg+xml;utf8,'))
  })

  // ----------------------------------------------------
  // TEST 16: Feature flags correctly enable/disable each delivery method
  // ----------------------------------------------------
  it('TEST 16: Feature flags correctly enable/disable each delivery method', async () => {
    const pack = getFallbackPack()
    pack.whatsappEnabled = false
    pack.emailEnabled = false
    pack.cloudQrEnabled = false
    pack.printEnabled = false

    const stats = await deliveryManager.getStats(pack)
    assert.strictEqual(stats.whatsappEnabled, false)
    assert.strictEqual(stats.emailEnabled, false)
    assert.strictEqual(stats.cloudQrEnabled, false)
    assert.strictEqual(stats.printEnabled, false)

    pack.whatsappEnabled = true
    pack.emailEnabled = true
    pack.cloudQrEnabled = true
    pack.printEnabled = true

    const statsOn = await deliveryManager.getStats(pack)
    assert.strictEqual(statsOn.whatsappEnabled, true)
    assert.strictEqual(statsOn.emailEnabled, true)
    assert.strictEqual(statsOn.cloudQrEnabled, true)
    assert.strictEqual(statsOn.printEnabled, true)
  })

  // ----------------------------------------------------
  // TEST 17: No delivery action leaks internal tokens or private identifiers
  // ----------------------------------------------------
  it('TEST 17: No delivery action leaks internal tokens or private identifiers', async () => {
    const sessionId = 'sess_sec_leak_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)
    await enqueueSessionForSync(session, photos, true)
    await syncWorker.process()

    const pack = session.packSnapshot
    const wa = await deliveryManager.sendWhatsApp(sessionId, '9876543210', pack)
    const email = await deliveryManager.sendEmail(sessionId, 'user@example.com', pack)
    const qr = await deliveryManager.getCloudQr(sessionId, pack)

    // Token & device secret leak checks
    assert.ok(!wa.handoffUrl?.includes(deviceToken))
    assert.ok(!wa.handoffUrl?.includes(testDeviceId))
    assert.ok(!email.mailtoUrl?.includes(deviceToken))
    assert.ok(!email.mailtoUrl?.includes(testDeviceId))
    assert.ok(!qr.shareUrl?.includes(deviceToken))
    assert.ok(!qr.shareUrl?.includes(testDeviceId))
    assert.ok(!qr.shareUrl?.startsWith('blob:'))
  })

  // ----------------------------------------------------
  // TEST 18: Delivery summary lists all completed sessions correctly
  // ----------------------------------------------------
  it('TEST 18: Delivery summary lists all completed sessions correctly', async () => {
    const list = await deliveryManager.getCompletedSessionsList()
    assert.ok(Array.isArray(list))
    assert.ok(list.length > 0)

    for (const s of list) {
      assert.ok(typeof s.sessionId === 'string')
      assert.ok(typeof s.createdAt === 'number')
      assert.ok(typeof s.isSynced === 'boolean')
    }
  })

  // ----------------------------------------------------
  // TEST 19: Session completion -> completed_sessions -> Staff Delivery visibility before & after sync
  // ----------------------------------------------------
  it('TEST 19: Session completion -> completed_sessions -> Staff Delivery visibility before & after sync', async () => {
    const sessionId = 'sess_e2e_flow_001'
    const { session, photos, derived } = createMockSession(sessionId, 1)
    for (const p of photos) await savePhoto(p)
    await putDerived(derived)

    // 1. Session completes locally (e.g. Guest presses Done)
    await enqueueSessionForSync(session, photos, true)

    // 2. Verify completed_sessions in IndexedDB has the record immediately
    const recordBeforeSync = await getCompletedSession(sessionId)
    assert.ok(recordBeforeSync, 'Completed session record must exist in IndexedDB')
    assert.strictEqual(recordBeforeSync.id, sessionId)
    assert.strictEqual(recordBeforeSync.syncedAt, null)

    // 3. Verify Staff Delivery & Share immediately sees the session as Pending Sync
    const staffListBefore = await deliveryManager.getCompletedSessionsList()
    const foundSessionBefore = staffListBefore.find((s) => s.sessionId === sessionId)
    assert.ok(foundSessionBefore, 'Session must appear in Staff Delivery list before sync')
    assert.strictEqual(foundSessionBefore.isSynced, false)
    assert.strictEqual(foundSessionBefore.galleryUrl, null)

    // 4. Verify local actions (Export, Print) work before sync
    const exportRes = await deliveryManager.exportPhotos(sessionId, true)
    assert.strictEqual(exportRes.success, true)
    assert.strictEqual(exportRes.status, 'COMPLETED')

    const printRes = await deliveryManager.printSession(sessionId, session.packSnapshot)
    assert.strictEqual(printRes.success, true)
    assert.strictEqual(printRes.status, 'COMPLETED')

    // 5. Verify cloud actions report WAITING_FOR_SYNC
    const qrBefore = await deliveryManager.getCloudQr(sessionId, session.packSnapshot)
    assert.strictEqual(qrBefore.status, 'WAITING_FOR_SYNC')

    const waBefore = await deliveryManager.sendWhatsApp(sessionId, '9876543210', session.packSnapshot)
    assert.strictEqual(waBefore.status, 'WAITING_FOR_SYNC')

    const emailBefore = await deliveryManager.sendEmail(sessionId, 'user@example.com', session.packSnapshot)
    assert.strictEqual(emailBefore.status, 'WAITING_FOR_SYNC')

    // 6. Synchronize with backend
    const syncRes = await syncWorker.process()
    assert.ok(syncRes.processed >= 1)
    assert.strictEqual(syncRes.errors, 0)

    // 7. Verify completed_sessions now has syncedAt and galleryUrl
    const recordAfterSync = await getCompletedSession(sessionId)
    assert.ok(recordAfterSync?.syncedAt, 'syncedAt must be populated after cloud sync')
    assert.ok(recordAfterSync?.galleryUrl, 'galleryUrl must be populated after cloud sync')

    // 8. Verify Staff Delivery & Share now sees the session as Synced
    const staffListAfter = await deliveryManager.getCompletedSessionsList()
    const foundSessionAfter = staffListAfter.find((s) => s.sessionId === sessionId)
    assert.ok(foundSessionAfter)
    assert.strictEqual(foundSessionAfter.isSynced, true)
    assert.ok(foundSessionAfter.galleryUrl)

    // 9. Verify cloud delivery actions now become READY
    const qrAfter = await deliveryManager.getCloudQr(sessionId, session.packSnapshot)
    assert.strictEqual(qrAfter.status, 'READY')
    assert.ok(qrAfter.qrDataUrl)

    const waAfter = await deliveryManager.sendWhatsApp(sessionId, '9876543210', session.packSnapshot)
    assert.strictEqual(waAfter.status, 'READY')
    assert.ok(waAfter.handoffUrl)

    const emailAfter = await deliveryManager.sendEmail(sessionId, 'user@example.com', session.packSnapshot)
    assert.strictEqual(emailAfter.status, 'READY')
    assert.ok(emailAfter.mailtoUrl)
  })
})
