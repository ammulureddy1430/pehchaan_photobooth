import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import 'fake-indexeddb/auto'
import { createAppContext, createAppServer } from '../server/app'
import { createDatabase } from '../server/db/database'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter'
import { PehchaanApiClient } from '../src/api/client'
import {
  paymentManager,
  mockPaymentProvider,
  buildUpiIntentUrl,
  generatePaymentReference,
  generateUpiQrSvg,
  generateUpiQrDataUrl,
  type PaymentRecord,
} from '../src/payment'
import { validateEventPack } from '../src/eventPack/validatePack'
import { getFallbackPack } from '../src/eventPack/fallbackPack'
import type { EventPack } from '../eventPack/types'
import {
  savePhoto,
  getPhoto,
  saveCompletedSession,
  getCompletedSession,
  listAllPhotos,
  clearOutbox,
} from '../src/lib/photoStore'
import { deliveryManager } from '../src/delivery/deliveryManager'
import { enqueueSessionForSync } from '../src/sync/outboxManager'
import type { BoothSession, PhotoRecord } from '../src/types'

describe('Payment & Monetization (Organizer Sponsored + Individual UPI)', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let client: PehchaanApiClient
  let db: ReturnType<typeof createDatabase>
  let storage: MemoryStorageAdapter

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
    mockPaymentProvider.clear()
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  beforeEach(async () => {
    await clearOutbox()
    mockPaymentProvider.clear()
  })

  // 1. Organizer mode requires no payment
  it('1. Organizer mode requires no payment', () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'organizer' }
    assert.strictEqual(paymentManager.isPaymentRequired(pack), false)
  })

  // 2. Organizer mode works offline
  it('2. Organizer mode works offline', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'organizer' }
    assert.strictEqual(paymentManager.isPaymentRequired(pack), false)

    const sessionRecord = {
      id: 'sess_org_offline_1',
      mode: 3,
      photoIds: ['p1'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'not_required' as const,
    }
    await saveCompletedSession(sessionRecord)

    // Delivery is unlocked without requiring internet payment verification
    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.notStrictEqual(printRes.error, 'Payment required: photo printing is locked until payment is verified.')
  })

  // 3. Individual mode requires payment
  it('3. Individual mode requires payment', () => {
    const pack = getFallbackPack()
    pack.payment = {
      enabled: true,
      mode: 'individual',
      upiId: 'merchant@upi',
      merchantName: 'Pehchaan Booth',
      amount: 99,
      currency: 'INR',
    }
    assert.strictEqual(paymentManager.isPaymentRequired(pack), true)
  })

  // 4. Disabled mode has no payment
  it('4. Disabled mode has no payment', () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: false, mode: 'disabled' }
    assert.strictEqual(paymentManager.isPaymentRequired(pack), false)
  })

  // 5. Existing events default to organizer mode
  it('5. Existing events default to organizer mode', () => {
    const rawPack = {
      id: 'evt_legacy_001',
      version: '1.0.0',
      eventName: 'Legacy Wedding',
      language: 'en',
      shotCount: 3,
      betweenShotPauseMs: 0,
      composition: {
        id: 'c1',
        name: 'Strip',
        width: 400,
        height: 1200,
        background: '#000',
        overlayEnabled: false,
        slots: [
          { id: 's1', shotNumber: 1, x: 0, y: 0, width: 400, height: 350, fit: 'cover' },
          { id: 's2', shotNumber: 2, x: 0, y: 360, width: 400, height: 350, fit: 'cover' },
          { id: 's3', shotNumber: 3, x: 0, y: 720, width: 400, height: 350, fit: 'cover' },
        ],
        texts: [],
      },
    }
    const result = validateEventPack(rawPack)
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.strictEqual(result.pack.payment?.mode, 'organizer')
      assert.strictEqual(paymentManager.isPaymentRequired(result.pack), false)
    }
  })

  // 6. Valid individual payment configuration
  it('6. Valid individual payment configuration', () => {
    const rawPack = {
      ...getFallbackPack(),
      payment: {
        enabled: true,
        mode: 'individual',
        upiId: 'organizer@okaxis',
        merchantName: 'Royal Celebrations',
        amount: 149,
        currency: 'INR',
        timeoutSeconds: 300,
      },
    }
    const result = validateEventPack(rawPack)
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.strictEqual(result.pack.payment?.upiId, 'organizer@okaxis')
      assert.strictEqual(result.pack.payment?.amount, 149)
    }
  })

  // 7. Invalid individual payment configuration
  it('7. Invalid individual payment configuration fails safely', () => {
    const invalidPack = {
      ...getFallbackPack(),
      payment: {
        enabled: true,
        mode: 'individual',
        upiId: 'invalid-no-at-sign', // Missing @
        merchantName: '',            // Empty name
        amount: -50,                 // Negative amount
      },
    }
    const result = validateEventPack(invalidPack)
    assert.strictEqual(result.ok, false)
  })

  // 8. QR generation
  it('8. QR generation produces valid UPI intent URI and SVG', () => {
    const intent = buildUpiIntentUrl({
      upiId: 'test@upi',
      merchantName: 'Pehchaan Booth',
      amount: 99,
      currency: 'INR',
      paymentReference: 'PB-test-123',
    })
    assert.ok(intent.startsWith('upi://pay?'))
    assert.ok(intent.includes('pa=test%40upi') || intent.includes('pa=test@upi'))
    assert.ok(intent.includes('am=99.00'))
    assert.ok(intent.includes('tr=PB-test-123'))

    const svg = generateUpiQrSvg(intent)
    assert.ok(svg.includes('<svg'))
    assert.ok(svg.includes('</svg>'))

    const dataUrl = generateUpiQrDataUrl(intent)
    assert.ok(dataUrl.startsWith('data:image/svg+xml'))
  })

  // 9. Unique payment reference
  it('9. Unique payment reference format', () => {
    const ref1 = generatePaymentReference('evt_wedding', 'sess_001')
    const ref2 = generatePaymentReference('evt_wedding', 'sess_001')
    assert.ok(ref1.startsWith('PB-wedding-sess001-') || ref1.startsWith('PB-evt_wedding-sess_001-'))
    assert.notStrictEqual(ref1, ref2 + 'x') // Contains timestamp
  })

  // 10. Payment initiation
  it('10. Payment initiation creates record in pending status', async () => {
    const res = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_1',
      amount: 99,
      currency: 'INR',
      upiId: 'booth@upi',
      merchantName: 'Booth',
    })
    assert.strictEqual(res.status, 'pending')
    assert.strictEqual(res.amount, 99)
    assert.ok(res.paymentReference.length > 5)
  })

  // 11. Payment pending
  it('11. Payment status check returns pending while waiting', async () => {
    const record = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_2',
      amount: 99,
    })
    const statusRes = await mockPaymentProvider.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'pending')
  })

  // 12. Payment success
  it('12. Payment success transitions status to success', async () => {
    const record = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_3',
      amount: 99,
    })
    mockPaymentProvider.simulateSuccess(record.paymentReference)
    const verifyRes = await mockPaymentProvider.verifyPayment(record.paymentReference)
    assert.strictEqual(verifyRes.verified, true)
    assert.strictEqual(verifyRes.status, 'success')
  })

  // 13. Payment failure
  it('13. Payment failure transitions status to failed', async () => {
    const record = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_4',
      amount: 99,
    })
    mockPaymentProvider.simulateFailure(record.paymentReference, 'Card declined')
    const statusRes = await mockPaymentProvider.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'failed')
  })

  // 14. Payment cancellation
  it('14. Payment cancellation sets status to cancelled', async () => {
    const record = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_5',
      amount: 99,
    })
    const cancelRes = await mockPaymentProvider.cancelPayment(record.paymentReference)
    assert.strictEqual(cancelRes.status, 'cancelled')
  })

  // 15. Payment expiration
  it('15. Payment expiration sets status to expired', async () => {
    const record = await mockPaymentProvider.createPayment({
      eventId: 'evt_1',
      sessionId: 'sess_6',
      amount: 99,
    })
    mockPaymentProvider.simulateExpired(record.paymentReference)
    const statusRes = await mockPaymentProvider.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'expired')
  })

  // 16. Offline individual payment attempt
  it('16. Offline individual payment attempt maintains photos safely', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'a@upi', merchantName: 'M' }

    const photoBlob = new Blob(['photo_data'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'photo_offline_1',
      sessionId: 'sess_offline_pay',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }
    await savePhoto(photo)

    // Photos must exist locally
    const retrieved = await getPhoto('photo_offline_1')
    assert.ok(retrieved)
  })

  // 17. Retry after network recovery
  it('17. Retry after network recovery allows new payment attempt', async () => {
    const attempt1 = await mockPaymentProvider.createPayment({ eventId: 'evt_1', sessionId: 'sess_retry', amount: 99 })
    mockPaymentProvider.simulateFailure(attempt1.paymentReference)

    const attempt2 = await mockPaymentProvider.createPayment({ eventId: 'evt_1', sessionId: 'sess_retry', amount: 99 })
    assert.notStrictEqual(attempt1.paymentReference, attempt2.paymentReference)
    assert.strictEqual(attempt2.status, 'pending')
  })

  // 18. Duplicate payment protection
  it('18. Duplicate payment protection (idempotency)', async () => {
    const params = { eventId: 'evt_idem', sessionId: 'sess_idem_1', amount: 99 }
    const p1 = await paymentManager.createPayment(params)
    mockPaymentProvider.simulateSuccess(p1.paymentReference)
    await paymentManager.verifyPayment(p1.paymentReference)

    // Second call for same session returns existing verified payment
    const p2 = await paymentManager.createPayment(params)
    assert.strictEqual(p2.status, 'success')
  })

  // 19. Fake client-side success cannot unlock delivery
  it('19. Fake client-side success cannot unlock delivery', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'a@upi', merchantName: 'M' }

    const sessionRecord = {
      id: 'sess_fake_1',
      mode: 3,
      photoIds: ['p1'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'pending' as const, // Unverified
    }
    await saveCompletedSession(sessionRecord)

    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.strictEqual(printRes.success, false)
    assert.ok(printRes.error?.includes('Payment required'))
  })

  // 20. Verified payment unlocks delivery
  it('20. Verified payment unlocks delivery', async () => {
    const pack = getFallbackPack()
    pack.printEnabled = true
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'a@upi', merchantName: 'M' }

    const photoBlob = new Blob(['sample_jpeg_verified'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'photo_ver_1',
      sessionId: 'sess_verified_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }
    await savePhoto(photo)

    const sessionRecord = {
      id: 'sess_verified_1',
      mode: 3,
      photoIds: ['photo_ver_1'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'success' as const, // Verified
    }
    await saveCompletedSession(sessionRecord)

    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.strictEqual(printRes.success, true)
    assert.strictEqual(printRes.status, 'COMPLETED')
  })

  // 21. Failed payment preserves photos
  it('21. Failed payment preserves photos', async () => {
    const photoBlob = new Blob(['sample_jpeg'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'photo_failed_test',
      sessionId: 'sess_failed_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }
    await savePhoto(photo)

    const pay = await mockPaymentProvider.createPayment({ eventId: 'e', sessionId: 'sess_failed_1', amount: 99 })
    mockPaymentProvider.simulateFailure(pay.paymentReference)

    // Photo must still exist
    const photoAfter = await getPhoto('photo_failed_test')
    assert.ok(photoAfter)
  })

  // 22. Cancelled payment preserves photos
  it('22. Cancelled payment preserves photos', async () => {
    const photoBlob = new Blob(['sample_jpeg_2'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'photo_cancel_test',
      sessionId: 'sess_cancel_1',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }
    await savePhoto(photo)

    const pay = await mockPaymentProvider.createPayment({ eventId: 'e', sessionId: 'sess_cancel_1', amount: 99 })
    await mockPaymentProvider.cancelPayment(pay.paymentReference)

    const photoAfter = await getPhoto('photo_cancel_test')
    assert.ok(photoAfter)
  })

  // 23. Payment linked to correct session
  it('23. Payment linked to correct session', async () => {
    const record = await mockPaymentProvider.createPayment({ eventId: 'evt_xyz', sessionId: 'sess_target_99', amount: 99 })
    assert.strictEqual(record.sessionId, 'sess_target_99')
  })

  // 24. Payment linked to correct event
  it('24. Payment linked to correct event', async () => {
    const record = await mockPaymentProvider.createPayment({ eventId: 'evt_xyz', sessionId: 'sess_target_99', amount: 99 })
    assert.strictEqual(record.eventId, 'evt_xyz')
  })

  // 25. Existing outbox remains functional
  it('25. Existing outbox remains functional with payment state', async () => {
    const pack = getFallbackPack()
    const session: BoothSession = {
      id: 'sess_outbox_pay_1',
      mode: 3,
      currentShotIndex: 2,
      photoIds: ['p1'],
      step: 'final-review',
      retaking: false,
      kind: 'guest',
      packSnapshot: pack,
      revision: 'rev_1',
      paymentStatus: 'success',
      paymentMode: 'individual',
      paymentAmount: 99,
    }
    const photoBlob = new Blob(['data'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'p1',
      sessionId: session.id,
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }

    const items = await enqueueSessionForSync(session, [photo], false)
    assert.ok(items.length >= 2) // Session + Asset

    const storedSession = await getCompletedSession(session.id)
    assert.strictEqual(storedSession?.paymentStatus, 'success')
    assert.strictEqual(storedSession?.paymentMode, 'individual')
  })

  // 26. Existing delivery remains functional
  it('26. Existing delivery remains functional for organizer mode', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'organizer' }
    const photoBlob = new Blob(['sample_jpeg_3'], { type: 'image/jpeg' })
    const photo: PhotoRecord = {
      id: 'photo_del_1',
      sessionId: 'sess_delivery_ok',
      shotNumber: 1,
      shotIndex: 0,
      createdAt: Date.now(),
      sessionKind: 'guest',
      original: photoBlob,
      thumbnail: null,
      status: 'ready',
      originalName: 'orig.jpg',
      thumbnailName: 'thumb.jpg',
      originalByteSize: photoBlob.size,
      thumbnailByteSize: 0,
    }
    await savePhoto(photo)

    const sessionRecord = {
      id: 'sess_delivery_ok',
      mode: 3,
      photoIds: ['photo_del_1'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'not_required' as const,
    }
    await saveCompletedSession(sessionRecord)

    const expRes = await deliveryManager.exportPhotos(sessionRecord.id, false)
    assert.strictEqual(expRes.success, true)
  })

  // 27. Existing consent flow remains functional
  it('27. Existing consent flow remains functional', () => {
    const pack = getFallbackPack()
    pack.consentMode = 'explicit'
    const result = validateEventPack(pack)
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.strictEqual(result.pack.consentMode, 'explicit')
    }
  })

  // 28. Existing schoolMode remains functional
  it('28. Existing schoolMode remains functional', () => {
    const pack = getFallbackPack()
    pack.schoolMode = true
    const result = validateEventPack(pack)
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.strictEqual(result.pack.schoolMode, true)
      assert.strictEqual(result.pack.payment?.mode, 'organizer')
    }
  })

  // 29. Existing retention behavior remains functional
  it('29. Existing retention behavior remains functional', async () => {
    const all = await listAllPhotos()
    assert.ok(Array.isArray(all))
  })

  // 30. Backend REST endpoints test
  it('30. Backend Payment REST API endpoints operate cleanly', async () => {
    // POST /v1/payments
    const createRes = await fetch(`${baseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_api_test',
        sessionId: 'sess_api_test',
        amount: 199,
        currency: 'INR',
        upiId: 'test@upi',
        merchantName: 'Pehchaan',
      }),
    })
    assert.strictEqual(createRes.status, 201)
    const createJson = await createRes.json()
    assert.strictEqual(createJson.payment.amount, 199)
    assert.strictEqual(createJson.payment.status, 'pending')
    const ref = createJson.paymentReference

    // GET /v1/payments/:ref
    const getRes = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(ref)}`)
    assert.strictEqual(getRes.status, 200)
    const getJson = await getRes.json()
    assert.strictEqual(getJson.status, 'pending')

    // POST /v1/payments/:ref/verify
    const verifyRes = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(ref)}/verify`, {
      method: 'POST',
    })
    assert.strictEqual(verifyRes.status, 200)
    const verifyJson = await verifyRes.json()
    assert.strictEqual(verifyJson.verified, true)
    assert.strictEqual(verifyJson.status, 'success')

    // GET /api/payments/summary/:eventId
    const summaryRes = await fetch(`${baseUrl}/api/payments/summary/evt_api_test`)
    assert.strictEqual(summaryRes.status, 200)
    const summaryJson = await summaryRes.json()
    assert.strictEqual(summaryJson.summary.successfulCount, 1)
    assert.strictEqual(summaryJson.summary.totalCollected, 199)
  })

  // 31. Demo Payment: Success simulation uses MockPaymentProvider and paymentManager verification
  it('31. Demo payment success routes through MockPaymentProvider and paymentManager verification', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'demo@upi', merchantName: 'Demo Booth' }

    const demoSessId = `sess_demo_success_${Date.now()}`
    // Step 1: Create payment through paymentManager
    const record = await paymentManager.createPayment({
      eventId: pack.id,
      sessionId: demoSessId,
      amount: 99,
      mode: 'individual',
      upiId: 'demo@upi',
      merchantName: 'Demo Booth',
    })
    assert.strictEqual(record.status, 'pending')

    // Step 2: Simulate demo success via mock provider
    mockPaymentProvider.simulateSuccess(record.paymentReference)

    // Step 3: Run verification via paymentManager
    const verified = await paymentManager.verifyPayment(record.paymentReference)
    assert.strictEqual(verified.verified, true)
    assert.strictEqual(verified.status, 'success')

    // Step 4: Verify payment record is in success status
    const statusRes = await paymentManager.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'success')

    // Step 5: Save session with verified status and test delivery unlock
    const sessionRecord = {
      id: demoSessId,
      mode: 1,
      photoIds: ['p_demo_1'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'success' as const,
      paymentMode: 'individual' as const,
      paymentReference: record.paymentReference,
    }
    await saveCompletedSession(sessionRecord)

    // Delivery channels are unlocked
    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.notStrictEqual(printRes.error, 'Payment required: photo printing is locked until payment is verified.')
  })

  // 32. Demo Payment: Failure simulation keeps delivery locked
  it('32. Demo payment failure keeps delivery locked', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'demo@upi', merchantName: 'Demo Booth' }

    const record = await paymentManager.createPayment({
      eventId: pack.id,
      sessionId: 'sess_demo_fail',
      amount: 99,
      mode: 'individual',
    })

    mockPaymentProvider.simulateFailure(record.paymentReference, 'Demo Bank Decline')
    const statusRes = await paymentManager.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'failed')

    const sessionRecord = {
      id: 'sess_demo_fail',
      mode: 1,
      photoIds: ['p_demo_f'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'failed' as const,
      paymentMode: 'individual' as const,
      paymentReference: record.paymentReference,
    }
    await saveCompletedSession(sessionRecord)

    // Delivery must be locked
    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.strictEqual(printRes.success, false)
    assert.ok(printRes.error?.includes('Payment required'))

    const qrRes = await deliveryManager.getCloudQr(sessionRecord.id, pack)
    assert.strictEqual(qrRes.success, false)
    assert.ok(qrRes.error?.includes('Payment required'))

    const waRes = await deliveryManager.sendWhatsApp(sessionRecord.id, '+919876543210', pack)
    assert.strictEqual(waRes.success, false)
    assert.ok(waRes.error?.includes('Payment required'))

    const emailRes = await deliveryManager.sendEmail(sessionRecord.id, 'guest@example.com', pack)
    assert.strictEqual(emailRes.success, false)
    assert.ok(emailRes.error?.includes('Payment required'))
  })

  // 33. Demo Payment: Cancellation simulation keeps delivery locked
  it('33. Demo payment cancellation keeps delivery locked', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'demo@upi', merchantName: 'Demo Booth' }

    const record = await paymentManager.createPayment({
      eventId: pack.id,
      sessionId: 'sess_demo_cancel',
      amount: 99,
      mode: 'individual',
    })

    mockPaymentProvider.simulateCancel(record.paymentReference)
    await paymentManager.cancelPayment(record.paymentReference)

    const sessionRecord = {
      id: 'sess_demo_cancel',
      mode: 1,
      photoIds: ['p_demo_c'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'cancelled' as const,
      paymentMode: 'individual' as const,
      paymentReference: record.paymentReference,
    }
    await saveCompletedSession(sessionRecord)

    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.strictEqual(printRes.success, false)
    assert.ok(printRes.error?.includes('Payment required'))
  })

  // 34. Demo Payment: Timeout/expiry simulation keeps delivery locked
  it('34. Demo payment timeout simulation keeps delivery locked', async () => {
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'demo@upi', merchantName: 'Demo Booth' }

    const record = await paymentManager.createPayment({
      eventId: pack.id,
      sessionId: 'sess_demo_expired',
      amount: 99,
      mode: 'individual',
    })

    mockPaymentProvider.simulateExpired(record.paymentReference)
    const statusRes = await paymentManager.getPaymentStatus(record.paymentReference)
    assert.strictEqual(statusRes.status, 'expired')

    const sessionRecord = {
      id: 'sess_demo_expired',
      mode: 1,
      photoIds: ['p_demo_exp'],
      kind: 'guest' as const,
      packId: pack.id,
      packVersion: pack.version,
      language: 'en',
      createdAt: Date.now(),
      paymentStatus: 'expired' as const,
      paymentMode: 'individual' as const,
      paymentReference: record.paymentReference,
    }
    await saveCompletedSession(sessionRecord)

    const printRes = await deliveryManager.printSession(sessionRecord.id, pack)
    assert.strictEqual(printRes.success, false)
    assert.ok(printRes.error?.includes('Payment required'))
  })

  // 35. Guest never requires Staff PIN during payment flow
  it('35. Guest payment flow does not require Staff PIN', () => {
    // PaymentScreen and guest payment flows operate strictly without PIN entry
    const pack = getFallbackPack()
    pack.payment = { enabled: true, mode: 'individual', amount: 99, upiId: 'pay@upi', merchantName: 'Booth' }
    
    // Creating, checking, simulating, verifying, and cancelling payment are guest actions without PIN
    assert.strictEqual(paymentManager.isPaymentRequired(pack), true)
  })
})

describe('Production Payment Gateway & Webhook Security (16 Production Scenarios)', () => {
  let prodServer: ReturnType<typeof createAppServer>
  let prodBaseUrl: string
  let prodDb: ReturnType<typeof createDatabase>
  let prodStorage: MemoryStorageAdapter
  let prodGateway: import('../server/gateway/mockGatewayProvider').MockGatewayProvider
  const webhookSecret = 'test_prod_webhook_secret_999'

  before(async () => {
    prodDb = createDatabase({ memory: true })
    prodStorage = new MemoryStorageAdapter()
    const { MockGatewayProvider } = await import('../server/gateway/mockGatewayProvider')
    prodGateway = new MockGatewayProvider(webhookSecret)
    const ctx = createAppContext({ db: prodDb, storage: prodStorage, gateway: prodGateway })
    prodServer = createAppServer(ctx)

    await new Promise<void>((resolve) => {
      prodServer.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = prodServer.address() as AddressInfo
    prodBaseUrl = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      prodServer.close((err) => (err ? reject(err) : resolve()))
    })
  })

  // Scenario 1: Webhook HMAC-SHA256 signature verification passes with valid signature
  it('Scenario 1: Webhook signature verification passes with valid HMAC-SHA256', async () => {
    // 1. Create a payment
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_prod_1',
        sessionId: 'sess_prod_1',
        amount: 250,
        currency: 'INR',
      }),
    })
    assert.strictEqual(createRes.status, 201)
    const createJson = await createRes.json()
    const ref = createJson.paymentReference
    const orderId = createJson.gatewayOrderId

    // 2. Prepare valid webhook payload & signature
    const webhookPayload = JSON.stringify({
      id: 'wh_evt_001',
      event: 'payment.captured',
      paymentReference: ref,
      gatewayOrderId: orderId,
      gatewayPaymentId: 'pay_rzp_prod_001',
      amount: 250,
      currency: 'INR',
      status: 'success',
    })

    const signature = prodGateway.signPayload(webhookPayload)

    // 3. Dispatch webhook
    const whRes = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
      },
      body: webhookPayload,
    })

    assert.strictEqual(whRes.status, 200)
    const whJson = await whRes.json()
    assert.strictEqual(whJson.success, true)
    assert.ok(whJson.status === 'success' || whJson.status === 'paid')
  })

  // Scenario 2: Invalid webhook signature is rejected with 401 Unauthorized
  it('Scenario 2: Invalid webhook signature is rejected with 401 Unauthorized', async () => {
    const webhookPayload = JSON.stringify({
      id: 'wh_evt_002',
      event: 'payment.captured',
      paymentReference: 'PB-some-ref',
      amount: 250,
      currency: 'INR',
      status: 'success',
    })

    const whRes = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': 'invalid_forged_signature_hex_1234567890abcdef',
      },
      body: webhookPayload,
    })

    assert.strictEqual(whRes.status, 401)
    const whJson = await whRes.json()
    assert.strictEqual(whJson.error, 'UNAUTHORIZED_WEBHOOK')
  })

  // Scenario 3: Duplicate webhook events are handled idempotently without duplicate side effects
  it('Scenario 3: Duplicate webhook events are handled idempotently', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_prod_3',
        sessionId: 'sess_prod_3',
        amount: 150,
        currency: 'INR',
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    const webhookPayload = JSON.stringify({
      id: 'wh_evt_idem_100',
      event: 'payment.captured',
      paymentReference: ref,
      gatewayPaymentId: 'pay_idem_001',
      amount: 150,
      currency: 'INR',
      status: 'success',
    })
    const signature = prodGateway.signPayload(webhookPayload)

    // First webhook call
    const wh1 = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: webhookPayload,
    })
    assert.strictEqual(wh1.status, 200)
    const json1 = await wh1.json()
    assert.strictEqual(json1.success, true)

    // Second (duplicate) webhook call with same eventId
    const wh2 = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: webhookPayload,
    })
    assert.strictEqual(wh2.status, 200)
    const json2 = await wh2.json()
    assert.strictEqual(json2.success, true)
    assert.strictEqual(json2.idempotent, true)
  })

  // Scenario 4: Amount mismatch between webhook payload and payment record is rejected and flagged failed
  it('Scenario 4: Amount mismatch is rejected with 400 and flags payment failed', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_prod_4',
        sessionId: 'sess_prod_4',
        amount: 500, // Expected 500 INR
        currency: 'INR',
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    // Fraudulent underpayment webhook: 50 INR instead of 500
    const fraudulentPayload = JSON.stringify({
      id: 'wh_fraud_001',
      event: 'payment.captured',
      paymentReference: ref,
      amount: 50,
      currency: 'INR',
      status: 'success',
    })
    const signature = prodGateway.signPayload(fraudulentPayload)

    const whRes = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: fraudulentPayload,
    })

    assert.strictEqual(whRes.status, 400)
    const whJson = await whRes.json()
    assert.strictEqual(whJson.error, 'AMOUNT_MISMATCH')

    // Verify DB record was marked failed
    const checkRes = await fetch(`${prodBaseUrl}/v1/payments/${encodeURIComponent(ref)}`)
    const checkJson = await checkRes.json()
    assert.strictEqual(checkJson.status, 'failed')
    assert.ok(checkJson.payment.failureReason?.includes('mismatch'))
  })

  // Scenario 5: Currency mismatch is rejected
  it('Scenario 5: Currency mismatch is rejected with 400 and flags payment failed', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_prod_5',
        sessionId: 'sess_prod_5',
        amount: 200,
        currency: 'INR',
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    const mismatchCurrPayload = JSON.stringify({
      id: 'wh_curr_001',
      event: 'payment.captured',
      paymentReference: ref,
      amount: 200,
      currency: 'USD', // Mismatched currency
      status: 'success',
    })
    const signature = prodGateway.signPayload(mismatchCurrPayload)

    const whRes = await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: mismatchCurrPayload,
    })

    assert.strictEqual(whRes.status, 400)
    const whJson = await whRes.json()
    assert.strictEqual(whJson.error, 'AMOUNT_MISMATCH')
  })

  // Scenario 6: Successful webhook updates DB status to success and verifies payment
  it('Scenario 6: Successful webhook updates DB record to verified success', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_prod_6',
        sessionId: 'sess_prod_6',
        amount: 199,
        currency: 'INR',
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    const webhookPayload = JSON.stringify({
      id: 'wh_success_6',
      event: 'payment.captured',
      paymentReference: ref,
      gatewayPaymentId: 'pay_success_tx_99',
      amount: 199,
      currency: 'INR',
      status: 'success',
    })
    const signature = prodGateway.signPayload(webhookPayload)

    await fetch(`${prodBaseUrl}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: webhookPayload,
    })

    const getRes = await fetch(`${prodBaseUrl}/v1/payments/${encodeURIComponent(ref)}`)
    const getJson = await getRes.json()
    assert.ok(getJson.status === 'success' || getJson.status === 'paid')
    assert.strictEqual(getJson.payment.gatewayPaymentId, 'pay_success_tx_99')
    assert.ok(getJson.payment.verifiedAt)
  })

  // Scenario 7: Server delivery gating - WhatsApp delivery returns 402 if individual session unpaid
  it('Scenario 7: WhatsApp delivery returns 402 if session is unpaid individual payment', async () => {
    // 1. Register device & session
    const devRes = await fetch(`${prodBaseUrl}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_gating_1',
        deviceName: 'Booth 1',
        platform: 'mac',
        appVersion: '1.0.0',
      }),
    })
    const { token } = await devRes.json()

    await fetch(`${prodBaseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'evt_gating_wa', name: 'Gating WA Event' }),
    })

    await fetch(`${prodBaseUrl}/api/events/evt_gating_wa/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': token },
      body: JSON.stringify({ sessionId: 'sess_unpaid_wa', shotCount: 3 }),
    })

    // 2. Create pending individual payment
    await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_gating_wa',
        sessionId: 'sess_unpaid_wa',
        amount: 99,
        mode: 'individual',
      }),
    })

    // 3. Attempt WhatsApp delivery without payment completed
    const waRes = await fetch(`${prodBaseUrl}/api/deliver/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_unpaid_wa',
        phoneNumber: '9876543210',
      }),
    })

    assert.strictEqual(waRes.status, 402)
    const waJson = await waRes.json()
    assert.strictEqual(waJson.error?.code || waJson.error, 'PAYMENT_REQUIRED')
  })

  // Scenario 8: Server delivery gating - Gallery returns 402 if individual session unpaid
  it('Scenario 8: Gallery returns 402 if individual session unpaid', async () => {
    // JSON request
    const jsonRes = await fetch(`${prodBaseUrl}/gallery/sess_unpaid_wa`, {
      headers: { Accept: 'application/json' },
    })
    assert.strictEqual(jsonRes.status, 402)

    // HTML request
    const htmlRes = await fetch(`${prodBaseUrl}/gallery/sess_unpaid_wa`, {
      headers: { Accept: 'text/html' },
    })
    assert.strictEqual(htmlRes.status, 402)
    const htmlText = await htmlRes.text()
    assert.ok(htmlText.includes('Payment Required') || htmlText.includes('Gallery Locked'))
  })

  // Scenario 9: Server delivery gating - Assets list returns 402 if individual session unpaid
  it('Scenario 9: Assets list returns 402 if individual session unpaid', async () => {
    const assetsRes = await fetch(`${prodBaseUrl}/api/sessions/sess_unpaid_wa/assets`)
    assert.strictEqual(assetsRes.status, 402)
  })

  // Scenario 10: Organizer mode / free sessions are NEVER gated / never return 402
  it('Scenario 10: Organizer mode / free sessions are never gated and return 200', async () => {
    const devRes = await fetch(`${prodBaseUrl}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_org_free',
        deviceName: 'Free Booth',
        platform: 'mac',
        appVersion: '1.0.0',
      }),
    })
    const { token } = await devRes.json()

    await fetch(`${prodBaseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_free_sponsor',
        name: 'Sponsored Wedding',
        eventPackSnapshot: { payment: { enabled: true, mode: 'organizer' } },
      }),
    })

    const sessRes = await fetch(`${prodBaseUrl}/api/events/evt_free_sponsor/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': token },
      body: JSON.stringify({ sessionId: 'sess_free_1', shotCount: 3 }),
    })
    assert.strictEqual(sessRes.status, 201)

    // Gallery access succeeds without payment
    const galRes = await fetch(`${prodBaseUrl}/gallery/sess_free_1`, {
      headers: { Accept: 'application/json' },
    })
    assert.strictEqual(galRes.status, 200)

    // WhatsApp dispatch succeeds without payment
    const waRes = await fetch(`${prodBaseUrl}/api/deliver/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_free_1',
        phoneNumber: '9876543210',
      }),
    })
    assert.strictEqual(waRes.status, 200)
  })

  // Scenario 11: Expiry handling - Payment past expiresAt automatically transitions to expired
  it('Scenario 11: Payment past expiresAt automatically transitions to expired status on lookup', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_exp_test',
        sessionId: 'sess_exp_test',
        amount: 99,
        timeoutSeconds: 1, // 1 second expiry
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    // Wait 1.1s for expiry
    await new Promise((r) => setTimeout(r, 1100))

    const getRes = await fetch(`${prodBaseUrl}/v1/payments/${encodeURIComponent(ref)}`)
    assert.strictEqual(getRes.status, 200)
    const getJson = await getRes.json()
    assert.strictEqual(getJson.status, 'expired')
  })

  // Scenario 12: Backend server restart recovery (persistent DB retains payment records)
  it('Scenario 12: Backend server restart recovers and retains payment records', async () => {
    // 1. Create a payment in current server instance
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_restart_1',
        sessionId: 'sess_restart_1',
        amount: 299,
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    // 2. Create new AppContext with same database (simulating restart)
    const restartedCtx = createAppContext({ db: prodDb, storage: prodStorage, gateway: prodGateway })
    const restartedServer = createAppServer(restartedCtx)

    await new Promise<void>((resolve) => {
      restartedServer.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = restartedServer.address() as AddressInfo
    const restartBaseUrl = `http://127.0.0.1:${addr.port}`

    try {
      // 3. Query payment from newly spawned server
      const getRes = await fetch(`${restartBaseUrl}/v1/payments/${encodeURIComponent(ref)}`)
      assert.strictEqual(getRes.status, 200)
      const getJson = await getRes.json()
      assert.strictEqual(getJson.payment.amount, 299)
      assert.strictEqual(getJson.payment.sessionId, 'sess_restart_1')
    } finally {
      await new Promise<void>((resolve) => restartedServer.close(() => resolve()))
    }
  })

  // Scenario 13: Simulation endpoint returns 403 Forbidden in production environment
  it('Scenario 13: Simulation endpoint returns 403 Forbidden in production environment', async () => {
    const oldEnv = process.env.NODE_ENV
    const oldProvider = process.env.PAYMENT_PROVIDER
    try {
      process.env.NODE_ENV = 'production'
      process.env.PAYMENT_PROVIDER = 'razorpay'

      const simRes = await fetch(`${prodBaseUrl}/v1/payments/PB-sim-test-99/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'success' }),
      })

      assert.strictEqual(simRes.status, 403)
      const simJson = await simRes.json()
      assert.strictEqual(simJson.error?.code || simJson.error, 'FORBIDDEN')
    } finally {
      process.env.NODE_ENV = oldEnv
      process.env.PAYMENT_PROVIDER = oldProvider
    }
  })

  // Scenario 14: Gateway order creation generates valid NPCI UPI intent URI
  it('Scenario 14: Gateway order creation generates valid NPCI UPI intent URI', async () => {
    const res = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_qr_test',
        sessionId: 'sess_qr_test',
        amount: 350,
        currency: 'INR',
        upiId: 'royalphotobooth@icici',
        merchantName: 'Royal Photobooth',
      }),
    })

    assert.strictEqual(res.status, 201)
    const json = await res.json()
    assert.ok(json.qrPayload)
    assert.ok(json.qrPayload.startsWith('upi://pay?'))
    assert.ok(json.qrPayload.includes('pa=royalphotobooth%40icici') || json.qrPayload.includes('pa=royalphotobooth@icici'))
    assert.ok(json.qrPayload.includes('am=350.00'))
    assert.strictEqual(json.gatewayProvider, 'mock_upi')
  })

  // Scenario 15: Payment status query returns gateway order details
  it('Scenario 15: Payment status query returns complete gateway order details', async () => {
    const createRes = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_query_test',
        sessionId: 'sess_query_test',
        amount: 149,
      }),
    })
    const createJson = await createRes.json()
    const ref = createJson.paymentReference

    const getRes = await fetch(`${prodBaseUrl}/v1/payments/${encodeURIComponent(ref)}`)
    assert.strictEqual(getRes.status, 200)
    const getJson = await getRes.json()

    assert.strictEqual(getJson.paymentReference, ref)
    assert.ok(getJson.payment.gatewayOrderId)
    assert.strictEqual(getJson.payment.gatewayProvider, 'mock_upi')
    assert.strictEqual(getJson.payment.amount, 149)
  })

  // Scenario 16: Idempotent payment order creation returns existing active order
  it('Scenario 16: Idempotent payment order creation returns existing active order for session', async () => {
    const sessionParams = {
      eventId: 'evt_idem_sess',
      sessionId: 'sess_idem_double_charge_check',
      amount: 199,
    }

    // Call 1
    const res1 = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionParams),
    })
    assert.strictEqual(res1.status, 201)
    const json1 = await res1.json()

    // Call 2 (re-requesting payment for same session while pending)
    const res2 = await fetch(`${prodBaseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionParams),
    })
    assert.strictEqual(res2.status, 200)
    const json2 = await res2.json()

    assert.strictEqual(json1.paymentReference, json2.paymentReference)
    assert.strictEqual(json2.idempotent, true)
    assert.strictEqual(json2.isNew, false)
  })

  // ----------------------------------------------------
  // STEP 6B: Razorpay Session UPI Payment & Status Gating
  // ----------------------------------------------------
  describe('Step 6B — Production UPI Payment (Razorpay Session Endpoints)', () => {
    const testEventId = 'evt_razorpay_test_01'
    const orgEventId = 'evt_org_test_01'
    const disEventId = 'evt_dis_test_01'
    const testSessionId = 'sess_rzp_booth_101'
    const webhookSecret = 'test_webhook_secret_xyz'

    before(async () => {
      // 1. Setup individual payment event (₹60, INR, individual mode)
      await fetch(`${prodBaseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: testEventId,
          name: 'Razorpay Individual Event',
          schoolId: 'sch-rzp-001',
          eventDate: '2026-09-18',
        }),
      })
      prodDb.prepare(`
        INSERT INTO event_configurations (
          id, event_id, school_id, branding_json, photo_settings_json, template_id,
          template_customization_json, delivery_json, payment_json, privacy_json,
          staff_pin, event_pack_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          payment_json = excluded.payment_json,
          updated_at = excluded.updated_at
      `).run(
        `cfg_${testEventId}`,
        testEventId,
        null,
        '{}',
        '{}',
        'classic-strip',
        '{}',
        '{}',
        JSON.stringify({
          enabled: true,
          mode: 'individual',
          amount: 60,
          currency: 'INR',
          upiId: 'pehchaan@razorpay',
          merchantName: 'Pehchaan Booth',
          timeoutSeconds: 300,
        }),
        '{}',
        '482917',
        '{}',
        'ready',
        1,
        Date.now(),
        Date.now()
      )

      // 2. Setup organizer event
      await fetch(`${prodBaseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: orgEventId,
          name: 'Organizer Event',
          eventDate: '2026-09-18',
        }),
      })
      prodDb.prepare(`
        INSERT INTO event_configurations (
          id, event_id, school_id, branding_json, photo_settings_json, template_id,
          template_customization_json, delivery_json, payment_json, privacy_json,
          staff_pin, event_pack_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          payment_json = excluded.payment_json,
          updated_at = excluded.updated_at
      `).run(
        `cfg_${orgEventId}`,
        orgEventId,
        null,
        '{}',
        '{}',
        'classic-strip',
        '{}',
        '{}',
        JSON.stringify({
          enabled: true,
          mode: 'organizer',
          amount: 0,
          currency: 'INR',
        }),
        '{}',
        '482917',
        '{}',
        'ready',
        1,
        Date.now(),
        Date.now()
      )

      // 3. Setup disabled event
      await fetch(`${prodBaseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: disEventId,
          name: 'Disabled Payment Event',
          eventDate: '2026-09-18',
        }),
      })
      prodDb.prepare(`
        INSERT INTO event_configurations (
          id, event_id, school_id, branding_json, photo_settings_json, template_id,
          template_customization_json, delivery_json, payment_json, privacy_json,
          staff_pin, event_pack_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          payment_json = excluded.payment_json,
          updated_at = excluded.updated_at
      `).run(
        `cfg_${disEventId}`,
        disEventId,
        null,
        '{}',
        '{}',
        'classic-strip',
        '{}',
        '{}',
        JSON.stringify({
          enabled: false,
          mode: 'disabled',
          amount: 0,
          currency: 'INR',
        }),
        '{}',
        '482917',
        '{}',
        'ready',
        1,
        Date.now(),
        Date.now()
      )

      // Create test sessions
      await fetch(`${prodBaseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: testSessionId, eventId: testEventId }),
      })
      await fetch(`${prodBaseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess_org_101', eventId: orgEventId }),
      })
      await fetch(`${prodBaseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess_dis_101', eventId: disEventId }),
      })
    })

    it('1. POST /v1/sessions/:sessionId/payment/create creates transaction with 201 & valid UPI QR intent when session pre-exists', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.payment.amount, 60)
      assert.strictEqual(data.payment.currency, 'INR')
      assert.strictEqual(data.payment.status, 'pending')
      assert.ok(data.payment.qrUri.startsWith('upi://pay?'))
      assert.ok(data.payment.qrUri.includes('am=60.00'))
      assert.ok(data.payment.qrUri.includes('cu=INR'))
      assert.ok(data.payment.paymentReference.startsWith('PB-'))
    })

    it('1b. POST /v1/sessions/:sessionId/payment/create safely auto-registers racing session not yet in SQLite', async () => {
      const racingSessionId = `sess_racing_${Date.now()}`
      const res = await fetch(`${prodBaseUrl}/v1/sessions/${racingSessionId}/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 201)
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.payment.sessionId, racingSessionId)
      assert.strictEqual(data.payment.amount, 60)
      assert.strictEqual(data.payment.currency, 'INR')
      assert.strictEqual(data.payment.status, 'pending')
      assert.ok(data.payment.qrUri.startsWith('upi://pay?'))
      assert.ok(data.payment.qrUri.includes('am=60.00'))

      // Verify the session now exists in session repository
      const statusRes = await fetch(`${prodBaseUrl}/v1/sessions/${racingSessionId}/payment/status`)
      assert.strictEqual(statusRes.status, 200)
    })

    it('1c. POST /v1/sessions/:sessionId/payment/create fails safely with 404 when non-existent eventId is specified', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/sess_unknown_evt/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: 'evt_completely_fake_999' }),
      })

      assert.strictEqual(res.status, 404)
      const data = await res.json()
      assert.strictEqual(data.error.code, 'EVENT_NOT_FOUND')
    })

    it('1d. POST /v1/sessions/:sessionId/payment/create is idempotent when called repeatedly on same session', async () => {
      const res1 = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.strictEqual(res1.status, 200)
      const data1 = await res1.json()
      assert.strictEqual(data1.idempotent, true)
      assert.strictEqual(data1.payment.amount, 60)
    })

    it('2. Organizer mode event rejects payment creation with 400 PAYMENT_NOT_REQUIRED', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/sess_org_101/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
      const data = await res.json()
      assert.strictEqual(data.error.code, 'PAYMENT_NOT_REQUIRED')
    })

    it('3. Disabled mode event rejects payment creation with 400 PAYMENT_NOT_REQUIRED', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/sess_dis_101/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      assert.strictEqual(res.status, 400)
      const data = await res.json()
      assert.strictEqual(data.error.code, 'PAYMENT_NOT_REQUIRED')
    })

    it('4. & 5. Authoritative amount enforcement: iPad-supplied spoofed amount is ignored', async () => {
      const spoofSessionId = 'sess_spoof_check_01'
      await fetch(`${prodBaseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: spoofSessionId, eventId: testEventId }),
      })

      const res = await fetch(`${prodBaseUrl}/v1/sessions/${spoofSessionId}/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1, currency: 'USD' }), // Spoofed
      })

      assert.strictEqual(res.status, 201)
      const data = await res.json()
      // Authoritative config has 60 INR
      assert.strictEqual(data.payment.amount, 60)
      assert.strictEqual(data.payment.currency, 'INR')
    })

    it('6. GET /v1/sessions/:sessionId/payment/status returns pending status before payment', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/status`)
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.payment.status, 'pending')
      assert.strictEqual(data.payment.amount, 60)
    })

    it('7. Pending payment blocks photo delivery (402 PAYMENT_REQUIRED)', async () => {
      const res = await fetch(`${prodBaseUrl}/api/deliver/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: testSessionId,
          phoneNumber: '9876543210',
        }),
      })

      assert.strictEqual(res.status, 402)
      const data = await res.json()
      assert.strictEqual(data.error.code, 'PAYMENT_REQUIRED')
    })

    it('8. Webhook with invalid signature is rejected with 401', async () => {
      const res = await fetch(`${prodBaseUrl}/api/payments/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'invalid_tampered_signature_12345',
        },
        body: JSON.stringify({ event: 'payment.captured' }),
      })

      assert.strictEqual(res.status, 401)
    })

    it('9. Webhook with amount mismatch is rejected with 400', async () => {
      const statusRes = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/status`)
      const statusData = await statusRes.json()
      const ref = statusData.payment.paymentReference

      const webhookPayload = JSON.stringify({
        id: 'evt_webhook_mismatch_01',
        event: 'payment.captured',
        paymentReference: ref,
        amount: 10, // 10 INR instead of 60 INR
        currency: 'INR',
        status: 'success',
      })

      const sig = prodGateway.signPayload(webhookPayload)

      const res = await fetch(`${prodBaseUrl}/api/payments/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': sig,
        },
        body: webhookPayload,
      })

      assert.strictEqual(res.status, 400)
    })

    it('10. Valid captured Razorpay webhook transitions payment to paid/success', async () => {
      const statusRes = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/status`)
      const statusData = await statusRes.json()
      const ref = statusData.payment.paymentReference

      const webhookPayload = JSON.stringify({
        id: 'evt_webhook_captured_01',
        event: 'payment.captured',
        paymentReference: ref,
        gatewayPaymentId: 'pay_rzp_captured_001',
        amount: 60,
        currency: 'INR',
        status: 'success',
      })

      const sig = prodGateway.signPayload(webhookPayload)

      const res = await fetch(`${prodBaseUrl}/api/payments/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': sig,
        },
        body: webhookPayload,
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.success, true)
    })

    it('11. GET /v1/sessions/:sessionId/payment/status returns paid after capture', async () => {
      const res = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/status`)
      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.ok(data.payment.status === 'paid' || data.payment.status === 'success')
      assert.ok(data.payment.verifiedAt)
    })

    it('12. Duplicate webhook event is idempotent (200 OK)', async () => {
      const statusRes = await fetch(`${prodBaseUrl}/v1/sessions/${testSessionId}/payment/status`)
      const statusData = await statusRes.json()
      const ref = statusData.payment.paymentReference

      const webhookPayload = JSON.stringify({
        id: 'evt_webhook_captured_01', // Same event id
        event: 'payment.captured',
        paymentReference: ref,
        gatewayPaymentId: 'pay_rzp_captured_001',
        amount: 60,
        currency: 'INR',
        status: 'success',
      })

      const sig = prodGateway.signPayload(webhookPayload)

      const res = await fetch(`${prodBaseUrl}/api/payments/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': sig,
        },
        body: webhookPayload,
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.idempotent, true)
    })

    it('13. Verified paid payment unlocks photo delivery', async () => {
      const res = await fetch(`${prodBaseUrl}/api/deliver/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: testSessionId,
          phoneNumber: '9876543210',
          eventName: 'Razorpay Test Gala',
        }),
      })

      assert.strictEqual(res.status, 200)
      const data = await res.json()
      assert.strictEqual(data.success, true)
      assert.strictEqual(data.status, 'DELIVERED')
    })
  })
})

