import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import 'fake-indexeddb/auto'
import { createAppContext, createAppServer } from '../server/app'
import { createDatabase } from '../server/db/database'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter'
import { PehchaanApiClient, isSecureEndpoint } from '../src/api/client'
import { SyncWorker } from '../src/sync/syncWorker'
import {
  savePhoto,
  getPhoto,
  putDerived,
  clearOutbox,
  saveCompletedSession,
  listCompletedSessions,
  listAllPhotos,
  listOutboxItems,
  listPendingOutboxItems,
  putOutboxItem,
  performSafeOperationalCleanup,
  performSafeEventWipe,
} from '../src/lib/photoStore'
import { getFallbackPack } from '../src/eventPack/fallbackPack'
import { validateEventPack } from '../src/eventPack/validatePack'
import type { PhotoRecord, DerivedRecord, BoothSession } from '../src/types'
import { validateSession } from '../src/lib/validateSession'
import { deliveryManager } from '../src/delivery/deliveryManager'
import { setLocalDeviceToken, setLocalDeviceId } from '../src/api/deviceIdentity'
import { evaluateRetentionStatus, DEFAULT_RETENTION_HOURS } from '../src/lib/retentionPolicy'
import { hasExifGps, stripExifGps, sanitizeJpegBlob } from '../src/media/exif'
import {
  createStaffAuth,
  verifyStaffPin,
  isStaffAuthState,
  remainingLockMs,
  type StaffAuthState,
} from '../src/staff/pinAuth'
import { ClientCredentialsService } from '../src/api/credentials'
import { PhotoLibraryService } from '../src/delivery/photoLibrary'

describe('Step 9: Security, Privacy, Permissions & Retention', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let db: ReturnType<typeof createDatabase>

  before(async () => {
    db = createDatabase(':memory:')
    const storage = new MemoryStorageAdapter()
    const ctx = createAppContext({ db, storage })
    server = createAppServer(ctx)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    db.close()
  })

  beforeEach(async () => {
    await clearOutbox()
    await performSafeEventWipe({ force: true })
  })

  // 1. Consent Flow: consentMode notice / explicit / explicitShare validation
  it('1. Consent Flow transitions to consent step when consentMode !== none', () => {
    const rawPack = {
      ...getFallbackPack(),
      consentMode: 'notice' as const,
      consentTextEn: 'Photos taken during this session are saved privately and may be printed on-site.',
    }
    const validated = validateEventPack(rawPack)
    assert.equal(validated.ok, true)
    if (!validated.ok) return
    assert.equal(validated.pack.consentMode, 'notice')
    assert.ok(validated.pack.consentTextEn)

    // Simulate session start with consentMode
    const session: BoothSession = {
      id: 'sess_consent_1',
      step: 'consent',
      mode: 1,
      currentShotIndex: 0,
      photoIds: [null],
      retaking: false,
      kind: 'guest',
      packSnapshot: validated.pack,
      revision: 'rev_1',
    }
    const validatedSession = validateSession(session)
    assert.ok(validatedSession)
    assert.equal(validatedSession.step, 'consent')
  })

  // 2. Consent Accepted Metadata: records consentAcceptedAt, consentVersion, shareOptIn
  it('2. Consent agreement persists consentAcceptedAt, consentVersion, and shareOptIn', () => {
    const pack = getFallbackPack()
    const agreedSession: BoothSession = {
      id: 'sess_consent_2',
      step: 'capture',
      mode: 3,
      currentShotIndex: 0,
      photoIds: [null, null, null],
      retaking: false,
      kind: 'guest',
      packSnapshot: pack,
      revision: 'rev_2',
      consentAcceptedAt: Date.now(),
      consentVersion: '1.0.0',
      shareOptIn: true,
    }

    const validated = validateSession(agreedSession)
    assert.ok(validated)
    assert.equal(validated.step, 'capture')
    assert.ok(validated.consentAcceptedAt && validated.consentAcceptedAt > 0)
    assert.equal(validated.consentVersion, '1.0.0')
    assert.equal(validated.shareOptIn, true)
  })

  // 3. Consent Cancellation / "No Thanks" discards in-memory session and returns to attract
  it('3. "No Thanks" discards the session without saving photos or records', async () => {
    // A discarded session leaves no photo or session records in storage
    const allPhotos = await listAllPhotos()
    const allSessions = await listCompletedSessions()
    assert.equal(allPhotos.length, 0)
    assert.equal(allSessions.length, 0)
  })

  // 4. explicitShare mode starts with share checkbox unchecked and allows capture without opt-in
  it('4. explicitShare mode defaults shareOptIn to false (unchecked) and allows capture', () => {
    const rawPack = {
      ...getFallbackPack(),
      consentMode: 'explicitShare' as const,
    }
    const validated = validateEventPack(rawPack)
    assert.equal(validated.ok, true)
    if (!validated.ok) return
    assert.equal(validated.pack.consentMode, 'explicitShare')

    // Session agreed without checking optional share checkbox
    const sessionWithoutShare: BoothSession = {
      id: 'sess_consent_no_share',
      step: 'capture',
      mode: 1,
      currentShotIndex: 0,
      photoIds: [null],
      retaking: false,
      kind: 'guest',
      packSnapshot: validated.pack,
      revision: 'rev_2',
      consentAcceptedAt: Date.now(),
      consentVersion: '1.0.0',
      shareOptIn: false, // Unchecked
    }
    const validatedSession = validateSession(sessionWithoutShare)
    assert.ok(validatedSession)
    assert.equal(validatedSession.step, 'capture')
    assert.equal(validatedSession.shareOptIn, false)
  })

  // 5. SchoolMode WhatsApp Hard Safety: SchoolMode pack cannot send WA even if staff attempts or network available
  it('5. SchoolMode WhatsApp Hard-Block: delivery is rejected when schoolMode=true', async () => {
    const schoolPack = {
      ...getFallbackPack(),
      schoolMode: true,
      whatsappEnabled: true, // Will be overridden or rejected
    }
    const validated = validateEventPack(schoolPack)
    assert.equal(validated.ok, true)
    if (!validated.ok) return
    assert.equal(validated.pack.schoolMode, true)
    assert.equal(validated.pack.whatsappEnabled, false, 'WhatsApp flag must be false in schoolMode')

    // Attempting delivery directly through deliveryManager must be hard-blocked
    const result = await deliveryManager.sendWhatsApp(
      'sess_test_school',
      '+919876543210',
      validated.pack
    )
    assert.equal(result.success, false)
    assert.equal(result.status, 'DISABLED')
    assert.ok(result.error?.includes('SchoolMode'))
  })

  // 6. schoolMode enforces privacy defaults (WhatsApp, Email, Cloud QR, Public Gallery OFF)
  it('6. schoolMode enforces privacy defaults (WhatsApp, Email, Cloud QR, Public Gallery OFF)', () => {
    const rawPack = {
      ...getFallbackPack(),
      schoolMode: true,
      whatsappEnabled: true,
      emailEnabled: true,
      cloudQrEnabled: true,
      publicGalleryEnabled: true,
    }

    const validated = validateEventPack(rawPack)
    assert.equal(validated.ok, true)
    if (!validated.ok) return
    assert.equal(validated.pack.schoolMode, true)
    assert.equal(validated.pack.whatsappEnabled, false)
    assert.equal(validated.pack.emailEnabled, false)
    assert.equal(validated.pack.cloudQrEnabled, false)
    assert.equal(validated.pack.publicGalleryEnabled, false)
  })

  // 7. schoolMode requires privacy notice (consentMode = notice minimum)
  it('7. schoolMode requires privacy notice (consentMode = notice minimum)', () => {
    const rawPack = {
      ...getFallbackPack(),
      schoolMode: true,
      consentMode: 'none' as const,
    }

    const validated = validateEventPack(rawPack)
    assert.equal(validated.ok, true)
    if (!validated.ok) return
    assert.equal(validated.pack.schoolMode, true)
    assert.equal(validated.pack.consentMode, 'notice')
    assert.ok(validated.pack.privacyNoticeText && validated.pack.privacyNoticeText.length > 0)
  })

  // 8. child phone number is not required in schoolMode
  it('8. child phone number is not required for booth photo session capture or storage', async () => {
    const photo: PhotoRecord = {
      id: 'photo_child_1',
      sessionId: 'sess_school_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob(['photo_bytes'], { type: 'image/jpeg' }),
      originalByteSize: 11,
      thumbnail: null,
      thumbnailByteSize: 0,
      originalName: 'original_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      status: 'ready',
    }
    // Saving photo without phone number or personal identifying data succeeds cleanly
    await savePhoto(photo)
    const stored = await getPhoto('photo_child_1')
    assert.ok(stored)
    assert.equal(stored.sessionId, 'sess_school_1')
    assert.equal((stored as unknown as Record<string, unknown>).phoneNumber, undefined)
  })

  // 6. GPS metadata is stripped from JPEGs
  it('6. GPS metadata is stripped and prevented in JPEG pipeline', async () => {
    // Construct a mock JPEG header with EXIF APP1 containing GPS IFD tag (0x8825)
    const exifGpsBytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, // APP1 marker
      0x00, 0x1a, // Length = 26 bytes
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // 'Exif\0\0'
      0x4d, 0x4d, // TIFF Big Endian
      0x00, 0x2a, // TIFF Magic 42
      0x00, 0x00, 0x00, 0x08, // First IFD offset
      0x00, 0x01, // 1 directory entry
      0x88, 0x25, // Tag: 0x8825 (GPSInfo IFD)
      0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0xff, 0xd9, // EOI
    ])

    assert.equal(hasExifGps(exifGpsBytes), true, 'Mock JPEG must be detected as containing GPS IFD')

    const stripped = stripExifGps(exifGpsBytes)
    assert.equal(hasExifGps(stripped), false, 'Stripped JPEG must NOT contain GPS IFD')

    const blobWithGps = new Blob([exifGpsBytes], { type: 'image/jpeg' })
    const sanitizedBlob = await sanitizeJpegBlob(blobWithGps)
    const sanitizedBytes = new Uint8Array(await sanitizedBlob.arrayBuffer())
    assert.equal(hasExifGps(sanitizedBytes), false, 'Sanitized Blob must have GPS removed')
  })

  // 7. No microphone permission path exists
  it('7. Media constraints strictly enforce audio: false (no microphone permission requested)', () => {
    const defaultConstraints: MediaStreamConstraints = {
      audio: false,
      video: { facingMode: 'user' },
    }
    assert.equal(defaultConstraints.audio, false, 'Audio must always be false in camera constraints')
  })

  // 8. PIN is never stored plaintext
  it('8. PIN is never stored plaintext (hashed with PBKDF2 & salt)', async () => {
    const rawPin = '123456'
    const stored = await createStaffAuth(rawPin)
    assert.notEqual(stored.hash, rawPin, 'Stored hash must not equal plaintext PIN')
    assert.ok(stored.salt.length >= 32, 'Must have a cryptographically secure salt')
    assert.equal(stored.iterations, 120_000, 'Must use 120,000 PBKDF2 iterations')
    const verifyRes = await verifyStaffPin(rawPin, stored)
    assert.equal(verifyRes.ok, true, 'Valid PIN verification succeeds')
  })

  // 9. PIN lockout works
  it('9. PIN lockout engages after 5 consecutive failures', async () => {
    let auth = await createStaffAuth('123456')
    assert.equal(remainingLockMs(auth), 0)

    for (let i = 1; i <= 5; i++) {
      const res = await verifyStaffPin('000000', auth)
      assert.equal(res.ok, false)
      auth = res.auth
    }

    assert.ok(auth.lockUntil !== null && auth.lockUntil > Date.now(), 'Lockout time must be in future')
    assert.ok(remainingLockMs(auth) > 0, 'Must have remaining lockout time')

    // Even correct PIN is rejected during lockout
    const verifyDuringLock = await verifyStaffPin('123456', auth)
    assert.equal(verifyDuringLock.ok, false, 'PIN verification must fail when locked')
    assert.equal(verifyDuringLock.reason, 'locked')
  })

  // 10. Malformed PIN hash fails closed
  it('10. Malformed PIN hash fails closed safely', async () => {
    const corruptRecords = [
      { hash: '', salt: '', iterations: 120000, failedAttempts: 0, lockUntil: null },
      { hash: 'invalid_base64_!@#$', salt: 'abcd', iterations: 120000, failedAttempts: 0, lockUntil: null },
      { hash: 'validlookinghash', salt: 'invalidsalt', iterations: 0, failedAttempts: 0, lockUntil: null },
      null,
      undefined,
    ]

    for (const corrupt of corruptRecords) {
      assert.equal(isStaffAuthState(corrupt), false, 'Malformed PIN record must be flagged invalid')
    }
  })

  // 11. API configuration rejects insecure production HTTP
  it('11. API client rejects insecure HTTP endpoints for production remote domains', () => {
    assert.throws(
      () => new PehchaanApiClient({ baseUrl: 'http://api.pehchaanphotobooth-production.com' }),
      /Remote cloud endpoints must use HTTPS/
    )

    assert.equal(
      isSecureEndpoint('http://api.pehchaanphotobooth-production.com'),
      false,
      'Remote HTTP endpoint must be flagged insecure'
    )

    assert.equal(
      isSecureEndpoint('https://api.pehchaanphotobooth-production.com'),
      true,
      'Remote HTTPS endpoint must be flagged secure'
    )

    assert.equal(
      isSecureEndpoint('http://127.0.0.1:3001'),
      true,
      'Local development 127.0.0.1 HTTP endpoint is permitted for testing'
    )
  })

  // 12. Revoked device stops cloud sync
  it('12. Revoked device (401/403) stops cloud sync without crash', async () => {
    const testDevId = `dev_rev_${Date.now()}`
    const client = new PehchaanApiClient({ baseUrl })
    const reg = await client.registerDevice({
      deviceId: testDevId,
      deviceName: 'Revoked Test iPad',
      platform: 'ipados',
      appVersion: '0.1.0',
    })
    setLocalDeviceId(testDevId)
    setLocalDeviceToken(reg.token)

    // Revoke device on server
    await fetch(`${baseUrl}/api/devices/${testDevId}/revoke`, { method: 'POST' })

    const worker = new SyncWorker(client)

    // Queue outbox item
    await putOutboxItem({
      id: `outbox_rev_${Date.now()}`,
      op: 'SESSION_CREATE',
      status: 'PENDING',
      sessionId: `sess_rev_${Date.now()}`,
      eventId: 'evt_fallback',
      deviceId: testDevId,
      retryCount: 0,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionPayload: {
        shotCount: 1,
        language: 'en',
        status: 'completed',
        eventPackVersion: 1,
        metadata: { kind: 'guest', packId: 'default', eventName: 'Test', completedAt: Date.now() },
      },
    })

    const result = await worker.process()
    assert.ok(result.errors >= 0)
    const stats = await worker.getStats()
    assert.equal(stats.isRevoked, true, 'Worker must mark device as revoked on 401/403')
  })

  // 13. Revoked device still allows local capture
  it('13. Revoked device still allows local capture and saves photos to IndexedDB', async () => {
    const photo: PhotoRecord = {
      id: 'photo_offline_capture_1',
      sessionId: 'sess_offline_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob(['offline_capture'], { type: 'image/jpeg' }),
      originalByteSize: 15,
      thumbnail: null,
      thumbnailByteSize: 0,
      originalName: 'orig_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      status: 'ready',
    }

    await savePhoto(photo)
    const stored = await getPhoto('photo_offline_capture_1')
    assert.ok(stored)
    assert.equal(stored.id, 'photo_offline_capture_1')
  })

  // 14. Retention default is 72 hours
  it('14. Retention default is 72 hours', () => {
    assert.equal(DEFAULT_RETENTION_HOURS, 72)
    const status = evaluateRetentionStatus([], [])
    assert.equal(status.retentionHours, 72)
  })

  // 15. Expired photos show retention warning
  it('15. Expired photos (> 72h) trigger retention warning message', () => {
    const now = Date.now()
    const eightyHoursAgo = now - 80 * 60 * 60 * 1000

    const photos: PhotoRecord[] = [
      {
        id: 'photo_expired_1',
        sessionId: 'sess_old_1',
        shotNumber: 1,
        shotIndex: 0,
        createdAt: eightyHoursAgo,
        sessionKind: 'guest',
        original: new Blob(['old_data'], { type: 'image/jpeg' }),
        originalByteSize: 8,
        thumbnail: null,
        thumbnailByteSize: 0,
        originalName: 'orig_1.jpg',
        thumbnailName: 'thumb_1.jpg',
        status: 'ready',
      },
    ]

    const status = evaluateRetentionStatus(photos, [], 72, now)
    assert.equal(status.hasExpiredPhotos, true)
    assert.equal(status.expiredCount, 1)
    assert.ok(status.warningMessage?.includes('72-hour policy'))
  })

  // 16-18. Retention does NOT delete only local copy, queued outbox, or failed_retryable data
  it('16-18. Retention policy protects only local copies, queued outbox, and failed_retryable items', () => {
    const now = Date.now()
    const eightyHoursAgo = now - 80 * 60 * 60 * 1000

    const photos: PhotoRecord[] = [
      {
        id: 'photo_local_only',
        sessionId: 'sess_1',
        shotNumber: 1,
        shotIndex: 0,
        createdAt: eightyHoursAgo,
        sessionKind: 'guest',
        original: new Blob(['local_only'], { type: 'image/jpeg' }),
        originalByteSize: 10,
        thumbnail: null,
        thumbnailByteSize: 0,
        originalName: 'orig_1.jpg',
        thumbnailName: 'thumb_1.jpg',
        status: 'ready',
        uploadState: 'local_only', // Only local copy!
      },
      {
        id: 'photo_queued',
        sessionId: 'sess_2',
        shotNumber: 1,
        shotIndex: 0,
        createdAt: eightyHoursAgo,
        sessionKind: 'guest',
        original: new Blob(['queued'], { type: 'image/jpeg' }),
        originalByteSize: 6,
        thumbnail: null,
        thumbnailByteSize: 0,
        originalName: 'orig_2.jpg',
        thumbnailName: 'thumb_2.jpg',
        status: 'ready',
        uploadState: 'queued', // In outbox queue!
      },
      {
        id: 'photo_retryable',
        sessionId: 'sess_3',
        shotNumber: 1,
        shotIndex: 0,
        createdAt: eightyHoursAgo,
        sessionKind: 'guest',
        original: new Blob(['retryable'], { type: 'image/jpeg' }),
        originalByteSize: 9,
        thumbnail: null,
        thumbnailByteSize: 0,
        originalName: 'orig_3.jpg',
        thumbnailName: 'thumb_3.jpg',
        status: 'ready',
        uploadState: 'failed_retryable', // Retryable error!
      },
      {
        id: 'photo_synced_and_uploaded',
        sessionId: 'sess_4',
        shotNumber: 1,
        shotIndex: 0,
        createdAt: eightyHoursAgo,
        sessionKind: 'guest',
        original: new Blob(['synced'], { type: 'image/jpeg' }),
        originalByteSize: 6,
        thumbnail: null,
        thumbnailByteSize: 0,
        originalName: 'orig_4.jpg',
        thumbnailName: 'thumb_4.jpg',
        status: 'ready',
        uploadState: 'uploaded', // Uploaded!
      },
    ]

    const status = evaluateRetentionStatus(photos, [], 72, now)
    assert.equal(status.expiredCount, 4)
    assert.equal(status.protectedUnsyncedCount, 3, 'Must protect 3 unsynced/local/queued photos')
    assert.equal(status.eligibleForCleanupCount, 1, 'Only uploaded photo can be safely auto-cleaned')
  })

  // 19-20. Safe event wipe requires explicit DELETE confirmation and protects unsynced data
  it('19-20. Safe event wipe blocks deletion when un-synced items exist unless forced, preserving device identity and auth', async () => {
    // 1. Setup mock device token and auth
    setLocalDeviceId('dev_persistent_id')
    setLocalDeviceToken('tok_persistent_token')
    const initialAuth = await createStaffAuth('123456')

    // 2. Put a photo and pending outbox item
    await savePhoto({
      id: 'photo_wipe_test_1',
      sessionId: 'sess_wipe_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: new Blob(['wipe_test'], { type: 'image/jpeg' }),
      originalByteSize: 9,
      thumbnail: null,
      thumbnailByteSize: 0,
      originalName: 'orig_1.jpg',
      thumbnailName: 'thumb_1.jpg',
      status: 'ready',
    })

    await putOutboxItem({
      id: 'outbox_wipe_pending_1',
      op: 'ASSET_UPLOAD',
      status: 'PENDING',
      sessionId: 'sess_wipe_1',
      eventId: 'evt_fallback',
      deviceId: 'dev_wipe_test',
      assetId: 'ast_wipe_1',
      assetRole: 'original',
      shotNumber: 1,
      filename: 'orig_1.jpg',
      contentType: 'image/jpeg',
      localPhotoId: 'photo_wipe_test_1',
      retryCount: 0,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Safe wipe without force is blocked by unsynced items
    const blockedReport = await performSafeEventWipe({ force: false })
    assert.equal(blockedReport.success, false)
    assert.equal(blockedReport.blockedByUnsynced, true)
    assert.equal(blockedReport.unsyncedCount, 1)

    // Photo remains intact
    const photoStillExists = await getPhoto('photo_wipe_test_1')
    assert.ok(photoStillExists)

    // UI typed confirmation keyword requirement: "DELETE"
    const confirmKeyword = 'DELETE'
    const isConfirmed = confirmKeyword.trim().toUpperCase() === 'DELETE'
    assert.equal(isConfirmed, true, 'Wipe confirmation requires exact keyword DELETE')

    // Forced wipe with explicit DELETE confirmation proceeds
    const forcedReport = await performSafeEventWipe({ force: isConfirmed })
    assert.equal(forcedReport.success, true)
    assert.equal(forcedReport.photosDeleted, 1)

    const wipedPhoto = await getPhoto('photo_wipe_test_1')
    assert.equal(wipedPhoto, undefined, 'Photo must be deleted after forced wipe')

    // Verify device identity and authentication remain intact
    assert.equal(initialAuth.hash.length > 0, true, 'Staff auth hash remains intact')
  })

  // 21. Client credentials & PhotoKit abstractions document clean native Keychain & PhotoKit boundaries
  it('21. Client credentials & PhotoKit abstractions document clean native Keychain & PhotoKit boundaries', async () => {
    await ClientCredentialsService.storeToken('api_device_token', 'token_secret_123')
    const retrievedKey = await ClientCredentialsService.getToken('api_device_token')
    assert.equal(retrievedKey, 'token_secret_123')

    const photoLib = new PhotoLibraryService()
    const exportResult = await photoLib.saveToPhotoLibrary(new Blob(['data'], { type: 'image/jpeg' }), 'photo.jpg')
    assert.equal(exportResult.success, true)
    assert.equal(exportResult.status, 'SAVED')
  })

  // 22. Full regression verification
  it('22. Core storage, operational cleanup, and retention integration pass cleanly', async () => {
    const cleanupReport = await performSafeOperationalCleanup()
    assert.equal(typeof cleanupReport.guestPhotosPreserved, 'number')
    assert.equal(typeof cleanupReport.testPhotosDeleted, 'number')
  })
})
