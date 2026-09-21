import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createAppContext, createAppServer } from '../server/app.js'
import { createDatabase } from '../server/db/database.js'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter.js'
import { LocalStorageAdapter } from '../server/storage/localStorageAdapter.js'
import { PehchaanApiClient, ApiClientError } from '../src/api/client.js'
import { generateDeviceToken, verifyDeviceToken } from '../server/auth/token.js'
import { AppError } from '../server/errors/AppError.js'

import { validateEventPack } from '../src/eventPack/validatePack.js'

describe('Step 5: Cloud / Backend Foundation Tests', () => {
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
  })

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    db.close()
  })

  // ----------------------------------------------------
  // DEVICE TESTS
  // ----------------------------------------------------
  describe('Device Registration & Authentication', () => {
    it('registration succeeds and returns device + token', async () => {
      const res = await client.registerDevice({
        deviceId: 'dev-ipad-001',
        deviceName: 'Front Booth iPad 1',
        platform: 'ipados',
        appVersion: '0.1.0',
      })

      assert.equal(res.isNew, true)
      assert.equal(res.device.deviceId, 'dev-ipad-001')
      assert.equal(res.device.deviceName, 'Front Booth iPad 1')
      assert.equal(res.device.status, 'active')
      assert.ok(res.token && res.token.length > 20)

      const verified = verifyDeviceToken(res.token)
      assert.equal(verified.deviceId, 'dev-ipad-001')
      assert.equal(verified.role, 'device')
    })

    it('repeated registration is safe and updates metadata without creating duplicate', async () => {
      const res1 = await client.registerDevice({
        deviceId: 'dev-ipad-repeat',
        deviceName: 'iPad Initial',
        platform: 'chrome-prototype',
        appVersion: '0.1.0',
      })
      assert.equal(res1.isNew, true)

      const res2 = await client.registerDevice({
        deviceId: 'dev-ipad-repeat',
        deviceName: 'iPad Updated Name',
        platform: 'chrome-prototype',
        appVersion: '0.1.1',
      })

      assert.equal(res2.isNew, false)
      assert.equal(res2.device.deviceId, 'dev-ipad-repeat')
      assert.equal(res2.device.deviceName, 'iPad Updated Name')
      assert.equal(res2.device.appVersion, '0.1.1')
      assert.ok(res2.token)

      // Ensure DB only has one record for this device
      const count = db
        .prepare('SELECT COUNT(*) as c FROM devices WHERE device_id = ?')
        .get('dev-ipad-repeat') as { c: number }
      assert.equal(count.c, 1)
    })

    it('device retrieval works and does not leak auth secrets', async () => {
      const device = await client.getDevice('dev-ipad-001')
      assert.equal(device.deviceId, 'dev-ipad-001')
      assert.equal(device.deviceName, 'Front Booth iPad 1')
      assert.equal((device as any).token, undefined)
      assert.equal((device as any).secret, undefined)

      const list = await client.listDevices()
      assert.ok(Array.isArray(list))
      assert.ok(list.length >= 2)
      assert.ok(list.some((d) => d.deviceId === 'dev-ipad-001'))
    })

    it('missing token is rejected on protected endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/events/evt_demo/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 's-1' }),
      })

      assert.equal(res.status, 401)
      const data = await res.json()
      assert.equal(data.error?.code, 'MISSING_DEVICE_TOKEN')
    })

    it('invalid token is rejected', async () => {
      const res = await fetch(`${baseUrl}/api/events/evt_demo/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.token.garbage',
        },
        body: JSON.stringify({ sessionId: 's-1' }),
      })

      assert.equal(res.status, 401)
      const data = await res.json()
      assert.equal(data.error?.code, 'INVALID_DEVICE_TOKEN')
    })

    it('revoked device is rejected on protected endpoints', async () => {
      const reg = await client.registerDevice({
        deviceId: 'dev-to-revoke',
        deviceName: 'Revoke Test',
        platform: 'test',
        appVersion: '1.0.0',
      })

      const revoked = await client.revokeDevice('dev-to-revoke')
      assert.equal(revoked.status, 'revoked')
      assert.ok(revoked.revokedAt !== null)

      const res = await fetch(`${baseUrl}/api/devices/dev-to-revoke/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${reg.token}`,
        },
        body: JSON.stringify({}),
      })

      assert.equal(res.status, 403)
      const data = await res.json()
      assert.equal(data.error?.code, 'DEVICE_REVOKED')

      await assert.rejects(
        () =>
          client.registerDevice({
            deviceId: 'dev-to-revoke',
            deviceName: 'Attempt Re-register',
            platform: 'test',
            appVersion: '1.0.1',
          }),
        (err: ApiClientError) => {
          assert.equal(err.status, 403)
          assert.equal(err.code, 'DEVICE_REVOKED')
          return true
        }
      )
    })
  })

  // ----------------------------------------------------
  // EVENT TESTS
  // ----------------------------------------------------
  describe('Events & Event Pack Association', () => {
    before(async () => {
      // Register an active valid device
      await client.registerDevice({
        deviceId: 'dev-event-tester',
        deviceName: 'Event Tester Device',
        platform: 'chrome',
        appVersion: '0.1.0',
      })
    })

    it('event creation works and persists Event Pack association', async () => {
      const packSnapshot = {
        id: 'pack_wedding_2026',
        version: '1.2.0',
        eventName: 'Anjali & Rohan Wedding',
        shotCount: 3,
        mirrorOutput: true,
      }

      const res = await client.createEvent({
        eventId: 'evt_wedding_01',
        name: 'Anjali & Rohan Wedding',
        status: 'live',
        eventPackId: 'pack_wedding_2026',
        eventPackVersion: '1.2.0',
        eventPackSnapshot: packSnapshot,
      })

      assert.equal(res.event.eventId, 'evt_wedding_01')
      assert.equal(res.event.name, 'Anjali & Rohan Wedding')
      assert.equal(res.event.eventPackId, 'pack_wedding_2026')
      assert.equal(res.event.eventPackVersion, '1.2.0')
      assert.deepEqual(res.event.eventPackSnapshot, packSnapshot)
    })

    it('event retrieval works', async () => {
      const event = await client.getEvent('evt_wedding_01')
      assert.equal(event.eventId, 'evt_wedding_01')
      assert.equal(event.name, 'Anjali & Rohan Wedding')
    })

    it('non-existent event retrieval returns 404', async () => {
      await assert.rejects(
        () => client.getEvent('evt_non_existent'),
        (err: ApiClientError) => {
          assert.equal(err.status, 404)
          assert.equal(err.code, 'EVENT_NOT_FOUND')
          return true
        }
      )
    })

    it('GET /api/events/:eventId/pack returns complete event pack and configuration for event', async () => {
      const pack = await client.getEventPack('evt_wedding_01')
      assert.ok(pack)
      assert.equal(pack.eventId, 'evt_wedding_01')
      assert.equal(pack.name, 'Anjali & Rohan Wedding')
      assert.equal(pack.status, 'live')
      assert.ok(pack.schoolName)
      assert.ok(pack.photoSettings)
      assert.ok(pack.delivery)
      assert.ok(pack.payment)
      assert.ok(pack.privacy)
      assert.ok(pack.composition)
      assert.ok(pack.staffPin)

      // Validate pack conforms to EventPack schema
      const validation = validateEventPack(pack)
      assert.equal(validation.ok, true, `Validation failed: ${!validation.ok ? (validation as any).errors.join(', ') : ''}`)
    })

    it('GET /api/events/:eventId/pack returns valid default pack for unconfigured event', async () => {
      await client.createEvent({
        eventId: 'evt_sports_day',
        name: 'Annual Sports Day 2026',
        status: 'draft',
      })

      const pack = await client.getEventPack('evt_sports_day')
      assert.ok(pack)
      assert.equal(pack.eventId, 'evt_sports_day')
      assert.equal(pack.name, 'Annual Sports Day 2026')
      assert.equal(pack.shotCount, 3)
      assert.ok(pack.composition.slots.length === 3)
      assert.equal(pack.payment.mode, 'organizer')
      assert.equal(pack.privacy.schoolMode, true)

      const validation = validateEventPack(pack)
      assert.equal(validation.ok, true)
    })

    it('GET /api/events/:eventId/pack rejects revoked device token', async () => {
      const revokedDevToken = generateDeviceToken('dev-to-revoke')
      const unauthClient = new PehchaanApiClient({ baseUrl })
      await assert.rejects(
        () => unauthClient.getEventPack('evt_wedding_01', { token: revokedDevToken }),
        (err: ApiClientError) => {
          assert.equal(err.status, 403)
          assert.equal(err.code, 'DEVICE_REVOKED')
          return true
        }
      )
    })

    it('GET /api/events/:eventId/pack for non-existent event returns 404', async () => {
      await assert.rejects(
        () => client.getEventPack('evt_does_not_exist'),
        (err: ApiClientError) => {
          assert.equal(err.status, 404)
          assert.equal(err.code, 'EVENT_NOT_FOUND')
          return true
        }
      )
    })
  })

  // ----------------------------------------------------
  // SESSION TESTS
  // ----------------------------------------------------
  describe('Sessions & Idempotency', () => {
    before(async () => {
      await client.registerDevice({
        deviceId: 'dev-session-tester',
        deviceName: 'Session Tester Device',
        platform: 'chrome',
        appVersion: '0.1.0',
      })
    })

    it('session creation works under an event', async () => {
      const res = await client.createSession('evt_wedding_01', {
        sessionId: 'sess-001',
        shotCount: 3,
        language: 'hi',
        status: 'completed',
        eventPackVersion: '1.2.0',
        metadata: { guestCount: 2 },
      })

      assert.equal(res.idempotent, false)
      assert.equal(res.session.sessionId, 'sess-001')
      assert.equal(res.session.eventId, 'evt_wedding_01')
      assert.equal(res.session.deviceId, 'dev-session-tester')
      assert.equal(res.session.shotCount, 3)
      assert.equal(res.session.language, 'hi')
    })

    it('duplicate sessionId is strictly idempotent (Mandatory)', async () => {
      const res2 = await client.createSession('evt_wedding_01', {
        sessionId: 'sess-001',
        shotCount: 3,
        language: 'hi',
        status: 'completed',
      })

      assert.equal(res2.idempotent, true)
      assert.equal(res2.session.sessionId, 'sess-001')

      const count = db
        .prepare('SELECT COUNT(*) as c FROM sessions WHERE session_id = ?')
        .get('sess-001') as { c: number }
      assert.equal(count.c, 1)
    })

    it('session retrieval returns session details', async () => {
      const res = await client.getSession('sess-001')
      assert.equal(res.session.sessionId, 'sess-001')
      assert.equal(res.session.eventId, 'evt_wedding_01')
      assert.ok(Array.isArray(res.assets))
    })

    it('creating session for non-existent event is rejected', async () => {
      await assert.rejects(
        () =>
          client.createSession('evt_non_existent', {
            sessionId: 'sess-orphan',
            shotCount: 3,
          }),
        (err: ApiClientError) => {
          assert.equal(err.status, 404)
          assert.equal(err.code, 'EVENT_NOT_FOUND')
          return true
        }
      )
    })
  })

  // ----------------------------------------------------
  // ASSET TESTS
  // ----------------------------------------------------
  describe('Assets & Idempotency', () => {
    it('asset creation works and stores metadata + buffer in storage abstraction', async () => {
      const dummyJpeg = Buffer.from('FAKE-JPEG-DATA-SHOT-1')

      const res = await client.createAsset(
        'sess-001',
        {
          assetRole: 'original',
          shotNumber: 1,
          filename: 'original_1.jpg',
          contentType: 'image/jpeg',
        },
        dummyJpeg
      )

      assert.equal(res.idempotent, false)
      assert.equal(res.asset.sessionId, 'sess-001')
      assert.equal(res.asset.assetRole, 'original')
      assert.equal(res.asset.shotNumber, 1)
      assert.equal(res.asset.filename, 'original_1.jpg')
      assert.equal(res.asset.byteSize, dummyJpeg.byteLength)
      assert.ok(res.asset.checksum && res.asset.checksum.length === 64)

      const stored = await storage.get(res.asset.storageKey)
      assert.ok(stored)
      assert.equal(stored.data.toString(), 'FAKE-JPEG-DATA-SHOT-1')
    })

    it('duplicate asset creation is strictly idempotent (Mandatory)', async () => {
      const dummyJpeg = Buffer.from('FAKE-JPEG-DATA-SHOT-1')

      const res2 = await client.createAsset(
        'sess-001',
        {
          assetRole: 'original',
          shotNumber: 1,
          filename: 'original_1.jpg',
          contentType: 'image/jpeg',
        },
        dummyJpeg
      )

      assert.equal(res2.idempotent, true)
      assert.equal(res2.asset.sessionId, 'sess-001')
      assert.equal(res2.asset.filename, 'original_1.jpg')

      const count = db
        .prepare('SELECT COUNT(*) as c FROM assets WHERE session_id = ? AND filename = ?')
        .get('sess-001', 'original_1.jpg') as { c: number }
      assert.equal(count.c, 1)
    })

    it('binary upload with custom headers works', async () => {
      const rawBuffer = Buffer.from('RAW-BINARY-SHOT-2')
      const reg = await client.registerDevice({
        deviceId: 'dev-binary-uploader',
        deviceName: 'Binary Device',
        platform: 'native',
        appVersion: '1.0.0',
      })

      const res = await fetch(`${baseUrl}/api/sessions/sess-001/assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          Authorization: `Bearer ${reg.token}`,
          'x-asset-role': 'original',
          'x-asset-filename': 'original_2.jpg',
          'x-shot-number': '2',
        },
        body: rawBuffer,
      })

      assert.equal(res.status, 201)
      const data = await res.json()
      assert.equal(data.asset.filename, 'original_2.jpg')
      assert.equal(data.asset.shotNumber, 2)
      assert.equal(data.asset.byteSize, rawBuffer.byteLength)
    })

    it('multiple distinct assets can belong to same session', async () => {
      const composedJpeg = Buffer.from('COMPOSED-STRIP-JPEG')
      const resComposed = await client.createAsset(
        'sess-001',
        {
          assetRole: 'composed',
          filename: 'composed.jpg',
          contentType: 'image/jpeg',
        },
        composedJpeg
      )

      assert.equal(resComposed.asset.assetRole, 'composed')

      const sessionWithAssets = await client.getSession('sess-001')
      assert.ok(sessionWithAssets.assets.length >= 3)
      assert.ok(sessionWithAssets.assets.some((a) => a.assetRole === 'original'))
      assert.ok(sessionWithAssets.assets.some((a) => a.assetRole === 'composed'))
    })

    it('creating asset for non-existent session is rejected', async () => {
      const dummy = Buffer.from('test')
      await assert.rejects(
        () =>
          client.createAsset(
            'sess-missing',
            {
              assetRole: 'original',
              filename: 'test.jpg',
            },
            dummy
          ),
        (err: ApiClientError) => {
          assert.equal(err.status, 404)
          assert.equal(err.code, 'SESSION_NOT_FOUND')
          return true
        }
      )
    })

    it('invalid asset role is rejected', async () => {
      const dummy = Buffer.from('test')
      await assert.rejects(
        () =>
          client.createAsset(
            'sess-001',
            {
              assetRole: 'invalid-role' as any,
              filename: 'bad.jpg',
            },
            dummy
          ),
        (err: ApiClientError) => {
          assert.equal(err.status, 400)
          assert.equal(err.code, 'INVALID_ASSET')
          return true
        }
      )
    })
  })

  // ----------------------------------------------------
  // LOCAL STORAGE ADAPTER TESTS
  // ----------------------------------------------------
  describe('Storage Abstraction: LocalDiskStorage', () => {
    let tempDir: string
    let localStorageAdapter: LocalStorageAdapter

    before(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pehchaan-storage-test-'))
      localStorageAdapter = new LocalStorageAdapter(tempDir)
    })

    after(async () => {
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('writes and reads back files correctly with sha256 checksum', async () => {
      const payload = Buffer.from('LOCAL-DISK-STORAGE-CONTENT')
      const stored = await localStorageAdapter.put('sessions/test-s1/orig.jpg', payload, 'image/jpeg')

      assert.equal(stored.byteSize, payload.byteLength)
      assert.ok(stored.checksum.length === 64)

      const retrieved = await localStorageAdapter.get('sessions/test-s1/orig.jpg')
      assert.ok(retrieved)
      assert.equal(retrieved.contentType, 'image/jpeg')
      assert.equal(retrieved.data.toString(), 'LOCAL-DISK-STORAGE-CONTENT')
      assert.equal(retrieved.checksum, stored.checksum)
    })

    it('rejects path traversal attempts', async () => {
      const payload = Buffer.from('TRAVERSAL')
      await assert.rejects(
        () => localStorageAdapter.put('../../../etc/passwd', payload, 'text/plain'),
        (err: AppError) => {
          return true
        }
      )
    })
  })

  // ----------------------------------------------------
  // HEARTBEAT TESTS
  // ----------------------------------------------------
  describe('Heartbeat', () => {
    it('heartbeat updates lastSeen and lastHeartbeat', async () => {
      const reg = await client.registerDevice({
        deviceId: 'dev-heartbeat-test',
        deviceName: 'Heartbeat Device',
        platform: 'ipados',
        appVersion: '0.1.0',
      })

      const beforeHb = Date.now()
      const hbRes = await client.heartbeat('dev-heartbeat-test', {
        batteryLevel: 0.95,
        freeDiskBytes: 1024000000,
        status: 'active',
      })

      assert.equal(hbRes.ok, true)
      assert.equal(hbRes.deviceId, 'dev-heartbeat-test')
      assert.ok(hbRes.device.lastHeartbeat !== null)
      assert.ok(hbRes.device.lastHeartbeat! >= beforeHb)
      assert.equal(hbRes.device.metadata?.batteryLevel, 0.95)
    })
  })
})
