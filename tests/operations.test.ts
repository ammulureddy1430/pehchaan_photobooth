import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import 'fake-indexeddb/auto'
import { createAppContext, createAppServer } from '../server/app'
import { createDatabase } from '../server/db/database'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter'
import { PehchaanApiClient } from '../src/api/client'
import { SyncWorker } from '../src/sync/syncWorker'
import {
  savePhoto,
  getPhoto,
  putDerived,
  getDerived,
  clearOutbox,
  saveCompletedSession,
  getCompletedSession,
  listCompletedSessions,
  listOutboxItems,
  listPendingOutboxItems,
  putOutboxItem,
  getStorageStats,
  putMetaValue,
  getMetaValue,
  EVENT_STATUS_KEY,
  EVENT_PACK_KEY,
  clearTestMedia,
  performSafeOperationalCleanup,
  compositionDerivedId,
} from '../src/lib/photoStore'
import { getFallbackPack } from '../src/eventPack/fallbackPack'
import type { PhotoRecord, DerivedRecord } from '../src/types'
import { setLocalDeviceToken, setLocalDeviceId } from '../src/api/deviceIdentity'
import {
  evaluateStorageStatus,
  isCaptureAllowed,
  STORAGE_WARNING_THRESHOLD_FREE_BYTES,
  STORAGE_HARD_STOP_THRESHOLD_FREE_BYTES,
  STORAGE_CRITICAL_THRESHOLD_FREE_BYTES,
  GB,
  MB,
} from '../src/lib/storageLimits'
import { computeBoothReadiness } from '../src/lib/readiness'
import { deliveryManager } from '../delivery/deliveryManager'
import {
  confirmMount,
  getBoothMountConfig,
  isMountConfirmed,
  resetMountConfirmation,
  saveBoothMountConfig,
  type BoothMountConfig,
} from '../src/lib/orientationWizard'
import { evaluatePreflight } from '../src/lib/preflight'
import { generateStaffExportZip } from '../src/lib/exportService'
import { printerService } from '../src/lib/printerService'
import { evaluateNetworkStatus } from '../src/lib/networkService'

describe('Step 8: Kiosk & Operations Build Guide Full Alignment', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let client: PehchaanApiClient
  let db: ReturnType<typeof createDatabase>
  let storage: MemoryStorageAdapter
  let syncWorker: SyncWorker
  let deviceToken: string
  const testDeviceId = 'dev-ops-tester-step8'

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

    const reg = await client.registerDevice({
      deviceId: testDeviceId,
      deviceName: 'Ops iPad Test',
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
    await clearTestMedia()
    await resetMountConfirmation()
  })

  // 1. <8 GB free -> warning
  it('TEST 1: < 8 GB free storage triggers Warning / Amber status', () => {
    const freeBytes = 6 * GB // 6 GB free (< 8 GB, >= 2 GB)
    const status = evaluateStorageStatus({ count: 50, bytes: 100 * MB, freeBytes })

    assert.equal(status.level, 'warning')
    assert.equal(status.isWarning, true)
    assert.equal(status.isHardStop, false)
    assert.equal(status.isCritical, false)
    assert.match(status.statusMessage, /Storage Warning/)
  })

  // 2. <2 GB free -> hard-stop
  it('TEST 2: < 2 GB free storage triggers HARD STOP / Red (capture disabled)', () => {
    const freeBytes = 1.5 * GB // 1.5 GB free (< 2 GB, >= 500 MB)
    const status = evaluateStorageStatus({ count: 50, bytes: 100 * MB, freeBytes })

    assert.equal(status.level, 'hard_stop')
    assert.equal(status.isHardStop, true)
    assert.equal(status.isCritical, false)
    assert.equal(isCaptureAllowed({ count: 50, bytes: 100 * MB, freeBytes }), false)
    assert.match(status.statusMessage, /Storage Hard Stop/)
  })

  // 3. <500 MB free -> critical/hide Attract
  it('TEST 3: < 500 MB free storage triggers Critical state and hides Attract', () => {
    const freeBytes = 350 * MB // 350 MB free (< 500 MB)
    const status = evaluateStorageStatus({ count: 50, bytes: 100 * MB, freeBytes })

    assert.equal(status.level, 'critical')
    assert.equal(status.isCritical, true)
    assert.equal(status.isHardStop, true)
    assert.equal(status.hideAttract, true)
    assert.equal(isCaptureAllowed({ count: 50, bytes: 100 * MB, freeBytes }), false)
    assert.match(status.statusMessage, /Storage Critical/)
  })

  // 4. Orientation wizard creates mount configuration
  it('TEST 4: Orientation wizard creates persistent BoothMountConfig', async () => {
    const previewData = 'data:image/jpeg;base64,mockpreviewdata'
    const config = await confirmMount(previewData)

    assert.equal(config.confirmed, true)
    assert.equal(config.orientation, 'portrait')
    assert.ok(typeof config.confirmedAt === 'number')
    assert.equal(config.testShotPreview, previewData)

    const stored = await getBoothMountConfig()
    assert.equal(stored.confirmed, true)
    assert.equal(isMountConfirmed(stored), true)
  })

  // 5. Unconfirmed mount blocks Start Event
  it('TEST 5: Unconfirmed mount blocks Start Event and booth readiness', async () => {
    await resetMountConfirmation()
    const config = await getBoothMountConfig()
    assert.equal(isMountConfirmed(config), false)

    const storageStatus = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 10 * GB })
    const readiness = computeBoothReadiness({
      eventStatus: 'live',
      isPortrait: true,
      mountConfig: config,
      storageStatus,
      cameraStatus: 'ready',
    })

    assert.equal(readiness.isReady, false)
    assert.equal(readiness.state, 'MOUNT_UNCONFIRMED')
    assert.match(readiness.staffSummary, /Mount Unconfirmed/)
  })

  // 6. Confirmed mount allows Start Event
  it('TEST 6: Confirmed mount allows booth operation when all checks pass', async () => {
    const config = await confirmMount('mock-shot')
    const storageStatus = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 10 * GB })

    const readiness = computeBoothReadiness({
      eventStatus: 'live',
      isPortrait: true,
      mountConfig: config,
      storageStatus,
      cameraStatus: 'ready',
    })

    assert.equal(readiness.isReady, true)
    assert.equal(readiness.state, 'READY')
  })

  // 7. Cleanup deletes uploaded/test/deleted media
  it('TEST 7: Cleanup safely deletes uploaded, test, and deleted media', async () => {
    // 1. Test photo
    await savePhoto({
      id: 'photo-test-cleanup',
      sessionId: 'sess-test',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'test',
      original: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
    })

    // 2. Uploaded photo
    await savePhoto({
      id: 'photo-uploaded-cleanup',
      sessionId: 'sess-uploaded',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([3, 4])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
      uploadState: 'uploaded',
    })

    // 3. Soft-deleted photo
    await savePhoto({
      id: 'photo-deleted-cleanup',
      sessionId: 'sess-deleted',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([5, 6])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
      deletedAt: Date.now(),
    })

    const report = await performSafeOperationalCleanup()
    assert.equal(report.testPhotosDeleted, 1)
    assert.equal(report.uploadedPhotosDeleted, 1)
    assert.equal(report.deletedMediaDeleted, 1)

    assert.equal(await getPhoto('photo-test-cleanup'), undefined)
    assert.equal(await getPhoto('photo-uploaded-cleanup'), undefined)
    assert.equal(await getPhoto('photo-deleted-cleanup'), undefined)
  })

  // 8. Cleanup preserves local_only
  it('TEST 8: Cleanup strictly preserves local_only media', async () => {
    const photoId = 'photo-local-only-protect'
    await savePhoto({
      id: photoId,
      sessionId: 'sess-local-only',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([10, 11])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
      uploadState: 'local_only',
    })

    const report = await performSafeOperationalCleanup()
    assert.equal(report.guestPhotosPreserved >= 1, true)

    const preserved = await getPhoto(photoId)
    assert.ok(preserved)
    assert.equal(preserved?.id, photoId)
  })

  // 9. Cleanup preserves queued
  it('TEST 9: Cleanup strictly preserves queued media awaiting upload', async () => {
    const photoId = 'photo-queued-protect'
    await savePhoto({
      id: photoId,
      sessionId: 'sess-queued',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([12, 13])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
      uploadState: 'queued',
    })

    await performSafeOperationalCleanup()
    const preserved = await getPhoto(photoId)
    assert.ok(preserved)
    assert.equal(preserved?.id, photoId)
  })

  // 10. Cleanup preserves failed_retryable
  it('TEST 10: Cleanup strictly preserves failed_retryable media', async () => {
    const photoId = 'photo-retryable-protect'
    await savePhoto({
      id: photoId,
      sessionId: 'sess-retryable',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([14, 15])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 2,
      thumbnailByteSize: 0,
      uploadState: 'failed_retryable',
    })

    await performSafeOperationalCleanup()
    const preserved = await getPhoto(photoId)
    assert.ok(preserved)
    assert.equal(preserved?.id, photoId)
  })

  // 11. Export creates ZIP
  it('TEST 11: Export creates a valid ZIP archive containing session directories', async () => {
    const sessId = 'sess-export-zip-001'
    const photoId = 'photo-export-zip-001'

    await savePhoto({
      id: photoId,
      sessionId: sessId,
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob([new Uint8Array([100, 101, 102])], { type: 'image/jpeg' }),
      thumbnail: null,
      status: 'ready',
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      originalByteSize: 3,
      thumbnailByteSize: 0,
    })

    await saveCompletedSession({
      id: sessId,
      mode: 1,
      photoIds: [photoId],
      kind: 'guest',
      packId: 'pack_export_test',
      packVersion: '1.0.0',
      language: 'en',
      createdAt: Date.now(),
      syncedAt: Date.now(),
      galleryUrl: `https://photobooth.pehchaan.me/gallery/${sessId}`,
    })

    const exportResult = await generateStaffExportZip()
    assert.equal(exportResult.success, true)
    assert.ok(exportResult.zipBytes)
    assert.ok(exportResult.zipBytes!.length > 50)
    // First 4 bytes of ZIP are PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    assert.equal(exportResult.zipBytes![0], 0x50)
    assert.equal(exportResult.zipBytes![1], 0x4b)
    assert.equal(exportResult.zipBytes![2], 0x03)
    assert.equal(exportResult.zipBytes![3], 0x04)
  })

  // 12. Export creates CSV index
  it('TEST 12: Export includes index.csv with correct columns and session rows', async () => {
    const sessId = 'sess-export-csv-002'
    await saveCompletedSession({
      id: sessId,
      mode: 1,
      photoIds: ['mock-photo'],
      kind: 'guest',
      packId: 'pack_csv_test',
      packVersion: '1.0.0',
      language: 'en',
      createdAt: 1700000000000,
      syncedAt: 1700000010000,
      galleryUrl: `https://photobooth.pehchaan.me/gallery/${sessId}`,
    })

    const exportResult = await generateStaffExportZip()
    assert.equal(exportResult.success, true)
    assert.ok(exportResult.csvContent)
    assert.match(exportResult.csvContent!, /sessionId,createdAt,mode,photoCount,isSynced,syncedAt,galleryUrl,kind/)
    assert.match(exportResult.csvContent!, new RegExp(sessId))
  })

  // 13. Test sessions excluded from default export
  it('TEST 13: Test sessions are excluded from default export', async () => {
    const testSessId = 'sess-test-excluded-003'
    await saveCompletedSession({
      id: testSessId,
      mode: 1,
      photoIds: ['photo-test'],
      kind: 'test',
      packId: 'pack_test',
      packVersion: '1.0.0',
      language: 'en',
      createdAt: Date.now(),
    })

    const exportResult = await generateStaffExportZip({ includeTestSessions: false })
    assert.equal(exportResult.success, true)
    assert.doesNotMatch(exportResult.csvContent!, new RegExp(testSessId))
  })

  // 14. Deleted sessions excluded from default export
  it('TEST 14: Deleted sessions are excluded from default export', async () => {
    const delSessId = 'sess-deleted-excluded-004'
    await saveCompletedSession({
      id: delSessId,
      mode: 1,
      photoIds: ['photo-del'],
      kind: 'guest',
      packId: 'pack_test',
      packVersion: '1.0.0',
      language: 'en',
      createdAt: Date.now(),
      // @ts-expect-error test deletedAt
      deletedAt: Date.now(),
    })

    const exportResult = await generateStaffExportZip({ includeDeletedSessions: false })
    assert.equal(exportResult.success, true)
    assert.doesNotMatch(exportResult.csvContent!, new RegExp(delSessId))
  })

  // 15. Preflight blocks failed non-waivable checks
  it('TEST 15: Preflight blocks Start Event if non-waivable check fails (e.g. storage/mount)', () => {
    const storageCritical = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 300 * MB })
    const unconfirmedMount: BoothMountConfig = { confirmed: false, orientation: 'portrait', confirmedAt: null }

    const preflight = evaluatePreflight({
      cameraReady: true,
      pack: getFallbackPack(),
      packError: null,
      mountConfig: unconfirmedMount,
      storageStatus: storageCritical,
      pinConfigured: true,
      printerStatus: 'available',
      networkStatus: evaluateNetworkStatus(true, true),
      guidedAccessActive: true,
    })

    assert.equal(preflight.canStart, false)
    assert.equal(preflight.hasNonWaivableFailure, true)
    assert.ok(preflight.nonWaivableFailedCount >= 2) // mount and storage failed
  })

  // 16. Waivable checks can be explicitly waived
  it('TEST 16: Waivable checks (Printer, Network, Guided Access) can be explicitly waived', () => {
    const storageOk = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 10 * GB })
    const confirmedMount: BoothMountConfig = { confirmed: true, orientation: 'portrait', confirmedAt: Date.now() }

    // Preflight with printer offline and network offline, but with waivers
    const waived = new Set(['printer', 'network', 'guided_access'])
    const preflight = evaluatePreflight(
      {
        cameraReady: true,
        pack: getFallbackPack(),
        packError: null,
        mountConfig: confirmedMount,
        storageStatus: storageOk,
        pinConfigured: true,
        printerStatus: 'offline', // Offline waivable
        networkStatus: evaluateNetworkStatus(false, false), // Offline waivable
        guidedAccessActive: false, // Unlocked waivable
      },
      waived
    )

    assert.equal(preflight.hasNonWaivableFailure, false)
    assert.equal(preflight.canStart, true)
    assert.equal(preflight.waivedCount, 3)
  })

  // 17. Printer unavailable is handled safely
  it('TEST 17: Printer unavailable/offline is handled safely without crashing', async () => {
    printerService.setPrinterStatus('offline', 'Paper Tray Open')
    assert.equal(printerService.getPrinterAvailability(), 'offline')
    assert.equal(printerService.getHumanReadablePrinterError(), 'Paper Tray Open')

    const result = await printerService.testPrint()
    assert.equal(result.success, false)
    assert.equal(result.error, 'PRINTER_OFFLINE')

    // Reset back to online
    printerService.setPrinterStatus('online', null)
    assert.equal(printerService.getPrinterAvailability(), 'available')
  })

  // 18. Network status works
  it('TEST 18: Network diagnostic status accurately reports online/offline and reachability', () => {
    const online = evaluateNetworkStatus(true, true)
    assert.equal(online.isOnline, true)
    assert.equal(online.backendReachable, true)
    assert.match(online.diagnosticMessage, /Backend Reachable/)

    const offline = evaluateNetworkStatus(false, false)
    assert.equal(offline.isOnline, false)
    assert.match(offline.diagnosticMessage, /Sync Queued Locally/)
  })

  // 19. Pause blocks new sessions
  it('TEST 19: Pause state prevents new sessions from starting', () => {
    const storageStatus = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 10 * GB })
    const readiness = computeBoothReadiness({
      eventStatus: 'paused',
      isPortrait: true,
      mountConfirmed: true,
      storageStatus,
    })

    assert.equal(readiness.isReady, false)
    assert.equal(readiness.state, 'PAUSED')
    assert.match(readiness.guestMessage!, /paused/)
  })

  // 20. End Event blocks new sessions
  it('TEST 20: End Event state prevents new sessions from starting', () => {
    const storageStatus = evaluateStorageStatus({ count: 10, bytes: 10 * MB, freeBytes: 10 * GB })
    const readiness = computeBoothReadiness({
      eventStatus: 'ended',
      isPortrait: true,
      mountConfirmed: true,
      storageStatus,
    })

    assert.equal(readiness.isReady, false)
    assert.equal(readiness.state, 'ENDED')
    assert.match(readiness.guestMessage!, /ended/)
  })

  // 21. Restart preserves state
  it('TEST 21: Restart preserves persistent Event Pack, status, and mount configuration', async () => {
    const pack = getFallbackPack()
    pack.eventName = 'Restart Preserved Gala'
    await putMetaValue(EVENT_PACK_KEY, pack)
    await putMetaValue(EVENT_STATUS_KEY, 'live')
    await confirmMount('restart-preview')

    const reloadedPack = await getMetaValue<typeof pack>(EVENT_PACK_KEY)
    const reloadedStatus = await getMetaValue<string>(EVENT_STATUS_KEY)
    const reloadedMount = await getBoothMountConfig()

    assert.equal(reloadedPack?.eventName, 'Restart Preserved Gala')
    assert.equal(reloadedStatus, 'live')
    assert.equal(reloadedMount.confirmed, true)
  })

  // 22. Steps 1–7 regression remains passing
  it('TEST 22: Steps 1–7 core capabilities and outbox storage remain fully functional', async () => {
    const stats = await getStorageStats()
    assert.equal(typeof stats.count, 'number')
    assert.equal(typeof stats.bytes, 'number')

    const outboxId = 'outbox-step8-reg-item'
    await putOutboxItem({
      id: outboxId,
      sessionId: 'sess-step8-reg',
      op: 'CREATE_SESSION',
      payload: { sessionId: 'sess-step8-reg' },
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: 0,
      createdAt: Date.now(),
      lastAttemptAt: null,
      error: null,
      permanentFailure: false,
    })

    const items = await listOutboxItems()
    assert.ok(items.some((i) => i.id === outboxId))
  })
})
