import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createAppContext, createAppServer } from '../server/app.js'
import { createDatabase } from '../server/db/database.js'
import { MemoryStorageAdapter } from '../server/storage/memoryStorageAdapter.js'
import { generateAdminToken, verifyAdminToken } from '../server/auth/adminAuth.js'
import { AdminRepository } from '../server/db/repositories/adminRepository.js'
import { validateEventPack } from '../src/eventPack/validatePack.js'
import { generateRandomStaffPin, createStaffAuth, verifyStaffPin } from '../src/staff/pinAuth.js'

describe('Admin & School Portal Backend Tests', () => {
  let server: ReturnType<typeof createAppServer>
  let baseUrl: string
  let db: ReturnType<typeof createDatabase>
  let storage: MemoryStorageAdapter
  let ctx: ReturnType<typeof createAppContext>

  async function getAdminAuthToken(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@pehchaan.me',
        password: 'AdminPassword123!',
      }),
    })
    const data = await res.json()
    if (!data.token) {
      console.error('getAdminAuthToken failed:', res.status, data)
    }
    return data.token
  }

  before(async () => {
    db = createDatabase({ memory: true })
    storage = new MemoryStorageAdapter()
    ctx = createAppContext({ db, storage })
    server = createAppServer(ctx)

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    db.close()
  })

  // ----------------------------------------------------
  // 1. AUTHENTICATION & LOGIN TESTS
  // ----------------------------------------------------
  describe('Admin Login & Session Management', () => {
    it('1. Default admin account logs in successfully and returns JWT-style token', async () => {
      const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@pehchaan.me',
          password: 'AdminPassword123!',
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.token && typeof data.token === 'string')
      assert.equal(data.admin.email, 'admin@pehchaan.me')
      assert.equal(data.admin.name, 'Pehchaan Administrator')
      assert.equal(data.admin.role, 'admin')
      // Ensure password hash and salt are never leaked to client
      assert.equal(data.admin.passwordHash, undefined)
      assert.equal(data.admin.salt, undefined)

      // Verify token signature & payload
      const verified = verifyAdminToken(data.token)
      assert.equal(verified.adminId, 'admin_seed_01')
      assert.equal(verified.email, 'admin@pehchaan.me')
      assert.equal(verified.role, 'admin')
    })

    it('2. Invalid password returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@pehchaan.me',
          password: 'WrongPassword!',
        }),
      })

      assert.equal(res.status, 401)
      const data = await res.json()
      assert.equal(data.error.code, 'INVALID_CREDENTIALS')
    })

    it('3. Non-existent email returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'unknown@school.org',
          password: 'SomePassword123!',
        }),
      })

      assert.equal(res.status, 401)
      const data = await res.json()
      assert.equal(data.error.code, 'INVALID_CREDENTIALS')
    })

    it('4. Missing email or password returns 400 Validation Error', async () => {
      const res1 = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@pehchaan.me' }),
      })
      assert.equal(res1.status, 400)

      const res2 = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'Password123!' }),
      })
      assert.equal(res2.status, 400)
    })

    it('5. GET /api/admin/auth/me returns authenticated admin profile', async () => {
      const token = await getAdminAuthToken()
      const meRes = await fetch(`${baseUrl}/api/admin/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(meRes.status, 200)
      const meData = await meRes.json()
      assert.equal(meData.admin.email, 'admin@pehchaan.me')
      assert.equal(meData.admin.name, 'Pehchaan Administrator')
    })

    it('6. POST /api/admin/auth/logout succeeds with valid token', async () => {
      const token = await getAdminAuthToken()
      const logoutRes = await fetch(`${baseUrl}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(logoutRes.status, 200)
      const logoutData = await logoutRes.json()
      assert.equal(logoutData.success, true)
    })
  })

  // ----------------------------------------------------
  // 2. PROTECTED ADMIN ROUTING & SECURITY
  // ----------------------------------------------------
  describe('Protected Admin Route Security', () => {
    it('7. Unauthenticated request to /api/admin/stats is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/stats`)
      assert.equal(res.status, 401)
    })

    it('8. Unauthenticated request to /api/admin/events is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events`)
      assert.equal(res.status, 401)
    })

    it('9. Unauthenticated request to /api/admin/profile is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/profile`)
      assert.equal(res.status, 401)
    })

    it('10. Tampered or expired token is rejected with 401', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiJ9.invalidpayload.invalidsig'
      const res = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${invalidToken}` },
      })
      assert.equal(res.status, 401)
    })

    it('11. Custom header x-admin-token is accepted as valid authentication', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { 'x-admin-token': token },
      })
      assert.equal(res.status, 200)
    })

    it('12. Expired admin token is rejected with 401', () => {
      // Generate a token expired 10 seconds ago
      const expiredToken = generateAdminToken(
        { id: 'admin_seed_01', email: 'admin@pehchaan.me', name: 'Admin', role: 'admin' },
        -10000
      )
      assert.throws(() => {
        verifyAdminToken(expiredToken)
      }, /expired/i)
    })
  })

  // ----------------------------------------------------
  // 3. DASHBOARD STATS & EVENTS
  // ----------------------------------------------------
  describe('Dashboard Stats & Events Data', () => {
    it('13. Dashboard stats and events return accurate structured data', async () => {
      const token = await getAdminAuthToken()

      // Register device and create test events
      ctx.deviceRepo.registerDevice({
        deviceId: 'admin-test-booth-1',
        deviceName: 'Admin Test Booth',
        platform: 'web',
        appVersion: '0.1.0',
      })

      ctx.eventRepo.createEvent({
        eventId: 'evt_sports_day_2026',
        name: 'Annual Sports Day 2026',
        status: 'live',
        metadata: { venue: 'School Sports Ground' },
      })

      ctx.eventRepo.createEvent({
        eventId: 'evt_science_fair_2026',
        name: 'Inter-School Science Fair',
        status: 'ended',
        metadata: { venue: 'Auditorium' },
      })

      // Add test sessions under live event
      ctx.sessionRepo.createSession('evt_sports_day_2026', {
        sessionId: 'sess_admin_01',
        deviceId: 'admin-test-booth-1',
        shotCount: 3,
        status: 'completed',
      })
      ctx.sessionRepo.createSession('evt_sports_day_2026', {
        sessionId: 'sess_admin_02',
        deviceId: 'admin-test-booth-1',
        shotCount: 3,
        status: 'completed',
      })

      // Test Stats endpoint
      const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(statsRes.status, 200)
      const statsData = await statsRes.json()
      assert.ok(statsData.stats)
      assert.ok(statsData.stats.totalEvents >= 2)
      assert.ok(statsData.stats.activeEvents >= 1)
      assert.ok(statsData.stats.completedEvents >= 1)
      assert.ok(statsData.stats.totalSessions >= 2)
      assert.ok(Array.isArray(statsData.stats.recentEvents))

      // Test Events endpoint
      const eventsRes = await fetch(`${baseUrl}/api/admin/events`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(eventsRes.status, 200)
      const eventsData = await eventsRes.json()
      assert.ok(Array.isArray(eventsData.events))

      const sportsEvent = eventsData.events.find((e: any) => e.eventId === 'evt_sports_day_2026')
      assert.ok(sportsEvent)
      assert.equal(sportsEvent.sessionCount, 2)
      assert.equal(sportsEvent.venue, 'School Sports Ground')
      assert.equal(sportsEvent.status, 'live')
    })
  })

  // ----------------------------------------------------
  // 4. SCHOOL PROFILE
  // ----------------------------------------------------
  describe('School Profile Loading and Updating', () => {
    it('14. GET /api/admin/profile returns the current school profile', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.profile)
      assert.ok(data.profile.schoolName)
      assert.ok(data.profile.email)
    })

    it('15. PUT /api/admin/profile updates and persists profile fields', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolName: 'Hyderabad Public School - Pehchaan Chapter',
          contactPerson: 'Mrs. Ananya Sharma',
          email: 'principal@hps-pehchaan.edu.in',
          phone: '+91 94400 11223',
          address: '1-8-1, Begumpet, Hyderabad, Telangana 500016',
          logoUrl: 'https://example.com/school-logo.png',
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.profile.schoolName, 'Hyderabad Public School - Pehchaan Chapter')
      assert.equal(data.profile.contactPerson, 'Mrs. Ananya Sharma')
      assert.equal(data.profile.email, 'principal@hps-pehchaan.edu.in')
      assert.equal(data.profile.phone, '+91 94400 11223')
      assert.equal(data.profile.address, '1-8-1, Begumpet, Hyderabad, Telangana 500016')
      assert.equal(data.profile.logoUrl, 'https://example.com/school-logo.png')

      // Verify persistence with a fresh GET
      const getRes = await fetch(`${baseUrl}/api/admin/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const getData = await getRes.json()
      assert.equal(getData.profile.schoolName, 'Hyderabad Public School - Pehchaan Chapter')
      assert.equal(getData.profile.contactPerson, 'Mrs. Ananya Sharma')
    })

    it('16. PUT /api/admin/profile rejects invalid email', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: 'invalid-email-address',
        }),
      })
      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })
  })

  // ----------------------------------------------------
  // 5. STEP 2: SCHOOL EVENT CREATION & REGISTRATION
  // ----------------------------------------------------
  describe('Step 2: School Event Creation, Validation & Management', () => {
    let createdEventId: string

    it('17. POST /api/admin/events creates a new event with status Draft and attaches school ID', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Annual Winter Carnival 2026',
          eventDate: '2026-12-18',
          startTime: '10:00',
          endTime: '18:00',
          venue: 'Main Campus Quadrangle',
          description: 'Winter celebration with photobooth prints for all students',
        }),
      })

      assert.equal(res.status, 201)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.ok(data.event.eventId)
      assert.equal(data.event.name, 'Annual Winter Carnival 2026')
      assert.equal(data.event.eventDate, '2026-12-18')
      assert.equal(data.event.startTime, '10:00')
      assert.equal(data.event.endTime, '18:00')
      assert.equal(data.event.venue, 'Main Campus Quadrangle')
      assert.equal(data.event.description, 'Winter celebration with photobooth prints for all students')
      assert.equal(data.event.status, 'draft')
      assert.equal(data.event.schoolId, 'sch_default')
      assert.equal(data.event.sessionCount, 0)

      createdEventId = data.event.eventId
    })

    it('18. POST /api/admin/events rejects missing required fields (name, date, times, venue)', async () => {
      const token = await getAdminAuthToken()

      // Missing Name
      const res1 = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventDate: '2026-12-18',
          startTime: '10:00',
          endTime: '18:00',
          venue: 'Main Campus Quadrangle',
        }),
      })
      assert.equal(res1.status, 400)
      const data1 = await res1.json()
      assert.match(data1.error.message, /Name is required/i)

      // Missing Event Date
      const res2 = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Sports Meet',
          startTime: '10:00',
          endTime: '18:00',
          venue: 'Grounds',
        }),
      })
      assert.equal(res2.status, 400)
      const data2 = await res2.json()
      assert.match(data2.error.message, /Date is required/i)

      // Missing Venue
      const res3 = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Sports Meet',
          eventDate: '2026-12-18',
          startTime: '10:00',
          endTime: '18:00',
        }),
      })
      assert.equal(res3.status, 400)
      const data3 = await res3.json()
      assert.match(data3.error.message, /Venue is required/i)
    })

    it('19. POST /api/admin/events rejects invalid time range when End Time <= Start Time', async () => {
      const token = await getAdminAuthToken()

      const res = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Invalid Timing Event',
          eventDate: '2026-12-18',
          startTime: '16:00',
          endTime: '11:00', // End time earlier than start time
          venue: 'Hall A',
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.match(data.error.message, /later than Start Time/i)
    })

    it('20. Unauthenticated event creation is rejected with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Event',
          eventDate: '2026-12-18',
          startTime: '10:00',
          endTime: '18:00',
          venue: 'Main Campus Quadrangle',
        }),
      })

      assert.equal(res.status, 401)
    })

    it('21. Client-supplied schoolId spoofing is ignored and authenticated school is used', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId: 'sch_spoofed_other_institution',
          name: 'Institution Event 2026',
          eventDate: '2026-11-20',
          startTime: '09:00',
          endTime: '15:00',
          venue: 'Auditorium 2',
        }),
      })

      assert.equal(res.status, 201)
      const data = await res.json()
      assert.equal(data.event.schoolId, 'sch_default') // Safely tied to authenticated profile
    })

    it('22. GET /api/admin/events/:eventId returns full single event details', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${createdEventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.event)
      assert.equal(data.event.eventId, createdEventId)
      assert.equal(data.event.name, 'Annual Winter Carnival 2026')
      assert.equal(data.event.venue, 'Main Campus Quadrangle')
      assert.equal(data.event.status, 'draft')
      assert.equal(data.event.sessionCount, 0)
    })

    it('23. GET /api/admin/events returns list of events with enriched details', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.events))
      const found = data.events.find((e: any) => e.eventId === createdEventId)
      assert.ok(found)
      assert.equal(found.name, 'Annual Winter Carnival 2026')
      assert.equal(found.status, 'draft')
    })

    it('24. PUT /api/admin/events/:eventId edits and updates draft event details', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${createdEventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Annual Grand Winter Carnival 2026 (Updated)',
          eventDate: '2026-12-19',
          startTime: '09:30',
          endTime: '18:30',
          venue: 'Main Campus Grounds & Auditorium',
          description: 'Updated winter festival notes',
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.event.name, 'Annual Grand Winter Carnival 2026 (Updated)')
      assert.equal(data.event.eventDate, '2026-12-19')
      assert.equal(data.event.startTime, '09:30')
      assert.equal(data.event.endTime, '18:30')
      assert.equal(data.event.venue, 'Main Campus Grounds & Auditorium')
      assert.equal(data.event.description, 'Updated winter festival notes')

      // Verify persistence with a GET
      const getRes = await fetch(`${baseUrl}/api/admin/events/${createdEventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const getData = await getRes.json()
      assert.equal(getData.event.name, 'Annual Grand Winter Carnival 2026 (Updated)')
    })

    it('25. PUT /api/admin/events/:eventId validates updated time range', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${createdEventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startTime: '18:00',
          endTime: '08:00',
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.match(data.error.message, /later than Start Time/i)
    })

    it('26. POST /api/admin/events/:eventId/cancel cancels event safely', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${createdEventId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.event.status, 'cancelled')

      // Verify via GET
      const getRes = await fetch(`${baseUrl}/api/admin/events/${createdEventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const getData = await getRes.json()
      assert.equal(getData.event.status, 'cancelled')
    })

    it('27. Non-existent event ID returns 404', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/evt_nonexistent_99999`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(res.status, 404)
    })
  })

  // ----------------------------------------------------
  // 5. STEP 3: EVENT CONFIGURATION, BRANDING & EVENT PACK
  // ----------------------------------------------------
  describe('Step 3: Event Configuration, Branding & Event Pack Preparation', () => {
    let testEventId: string

    before(async () => {
      const token = await getAdminAuthToken()
      // Create a dedicated event for configuration testing
      const res = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Tech Symposium 2026',
          eventDate: '2026-11-20',
          startTime: '10:00',
          endTime: '18:00',
          venue: 'Auditorium Hall B',
          description: 'Annual technology symposium photobooth event',
        }),
      })
      const data = await res.json()
      testEventId = data.event.eventId
      assert.ok(testEventId)
    })

    it('28. GET /api/admin/events/:eventId/config returns default initialized configuration', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.ok(data.event)
      assert.ok(data.config)
      assert.equal(data.config.eventId, testEventId)
      assert.equal(data.config.branding.eventTitle, 'Tech Symposium 2026')
      assert.equal(data.config.photoSettings.shotCount, 3)
      assert.equal(data.config.photoSettings.mirrorOutput, true)
      assert.equal(data.config.delivery.printEnabled, true)
      assert.equal(data.config.delivery.whatsappEnabled, false) // Privacy safe default
      assert.equal(data.config.privacy.schoolMode, true) // School mode default
      assert.equal(data.config.payment.mode, 'organizer')
      assert.ok(data.config.eventPack)
    })

    it('29. PUT /api/admin/events/:eventId/config updates branding and photo settings atomically', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          branding: {
            schoolLogoUrl: '/api/admin/storage/logos/custom_logo.png',
            schoolName: 'Pehchaan International Institute',
            eventTitle: 'TechFest & AI Gala 2026',
            eventSubtitle: 'Campus Auditorium',
            useDefaultSchoolLogo: false,
            accentColor: '#10b981',
          },
          photoSettings: {
            shotCount: 1,
            orientation: 'single_hero',
            mirrorOutput: false,
            blackAndWhiteEnabled: true,
            sepiaEnabled: false,
            betweenShotPauseMs: 500,
            retentionHours: 48,
          },
          template: {
            templateId: 'single-portrait',
            background: '#18181b',
            overlayEnabled: true,
            customTitle: 'TechFest Gala 2026',
            customSubtitle: 'Innovators Edition',
          },
          delivery: {
            printEnabled: false,
            cloudQrEnabled: true,
            whatsappEnabled: false,
            emailEnabled: true,
          },
          payment: {
            mode: 'organizer',
            amount: 0,
            currency: 'INR',
          },
          privacy: {
            schoolMode: true,
            consentMode: 'explicit',
            privacyNoticeText: 'Explicit consent required for AI Gala event.',
            retentionHours: 48,
          },
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.config.branding.eventTitle, 'TechFest & AI Gala 2026')
      assert.equal(data.config.branding.accentColor, '#10b981')
      assert.equal(data.config.photoSettings.shotCount, 1)
      assert.equal(data.config.photoSettings.mirrorOutput, false)
      assert.equal(data.config.template.templateId, 'single-portrait')
      assert.equal(data.config.delivery.printEnabled, false)
      assert.equal(data.config.delivery.emailEnabled, true)
      assert.equal(data.config.privacy.consentMode, 'explicit')
      assert.equal(data.config.status, 'complete')

      // Check generated event pack
      const pack = data.config.eventPack
      assert.ok(pack)
      assert.equal(pack.eventName, 'TechFest & AI Gala 2026')
      assert.equal(pack.shotCount, 1)
      assert.equal(pack.emailEnabled, true)
      assert.equal(pack.printEnabled, false)
      assert.equal(pack.schoolMode, true)

      // Validate pack structure with validateEventPack
      const valid = validateEventPack(pack)
      assert.equal(valid.ok, true, `Event pack validation failed: ${!valid.ok ? valid.errors.join(', ') : ''}`)
    })

    it('30. Configuration changes persist after reload (GET returns updated version)', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.config.branding.eventTitle, 'TechFest & AI Gala 2026')
      assert.equal(data.config.photoSettings.shotCount, 1)
      assert.equal(data.config.delivery.emailEnabled, true)
      assert.equal(data.config.privacy.consentMode, 'explicit')
    })

    it('30b. GET /api/events/:eventId/pack returns the latest saved custom configuration and layout', async () => {
      const res = await fetch(`${baseUrl}/api/events/${testEventId}/pack`)
      assert.equal(res.status, 200)
      const pack = await res.json()

      assert.equal(pack.eventId, testEventId)
      assert.equal(pack.eventName, 'TechFest & AI Gala 2026')
      assert.equal(pack.shotCount, 1)
      assert.equal(pack.photoSettings.shotCount, 1)
      assert.equal(pack.delivery.emailEnabled, true)
      assert.equal(pack.emailEnabled, true)
      assert.equal(pack.schoolMode, true)
      assert.ok(pack.composition)
      assert.equal(pack.composition.slots.length, 1)

      const validation = validateEventPack(pack)
      assert.equal(validation.ok, true, `Event pack validation failed: ${!validation.ok ? validation.errors.join(', ') : ''}`)
    })

    it('31. PUT /api/admin/events/:eventId/config rejects empty event title', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          branding: {
            eventTitle: '   ',
          },
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.match(data.error.message, /Event Title/i)
    })

    it('32. Individual Payment mode requires positive amount and valid UPI ID', async () => {
      const token = await getAdminAuthToken()

      // Missing UPI ID and 0 amount
      const res1 = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment: {
            mode: 'individual',
            amount: 0,
            upiId: '',
          },
        }),
      })
      assert.equal(res1.status, 400)
      const data1 = await res1.json()
      assert.equal(data1.error.code, 'VALIDATION_ERROR')

      // Invalid UPI ID without @
      const res2 = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment: {
            mode: 'individual',
            amount: 50,
            upiId: 'invalidupiid',
          },
        }),
      })
      assert.equal(res2.status, 400)

      // Valid individual payment config
      const res3 = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment: {
            mode: 'individual',
            amount: 150,
            currency: 'INR',
            upiId: 'techfest@okhdfcbank',
            merchantName: 'TechFest Organizer',
          },
        }),
      })
      assert.equal(res3.status, 200)
      const data3 = await res3.json()
      assert.equal(data3.config.payment.mode, 'individual')
      assert.equal(data3.config.payment.amount, 150)
      assert.equal(data3.config.payment.upiId, 'techfest@okhdfcbank')
      assert.equal(data3.config.eventPack.payment.amount, 150)
      assert.equal(data3.config.eventPack.payment.upiId, 'techfest@okhdfcbank')

      // Validate Event Pack with individual payment
      const valid = validateEventPack(data3.config.eventPack)
      assert.equal(valid.ok, true)
    })

    it('33. School Mode privacy rule automatically enforces WhatsApp OFF and Notice consent', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          delivery: {
            whatsappEnabled: true, // Should be overridden to false in school mode
          },
          privacy: {
            schoolMode: true,
            consentMode: 'none', // Should be promoted to 'notice'
          },
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      // In school mode, WhatsApp is strictly false for privacy safety
      assert.equal(data.config.delivery.whatsappEnabled, false)
      assert.equal(data.config.eventPack.whatsappEnabled, false)
      assert.equal(data.config.privacy.consentMode, 'notice')
      assert.equal(data.config.eventPack.consentMode, 'notice')
    })

    it('34. Disabled payment mode disables payment screen in Event Pack', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment: {
            mode: 'disabled',
          },
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.config.payment.mode, 'disabled')
      assert.equal(data.config.eventPack.payment.enabled, false)
      assert.equal(data.config.eventPack.payment.mode, 'disabled')
    })

    it('35. Event Pack snapshot in events table is synchronized atomically', async () => {
      const token = await getAdminAuthToken()
      // Fetch event from admin events endpoint
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.event.eventPackSnapshot)
      assert.equal(data.event.eventPackSnapshot.eventName, 'TechFest & AI Gala 2026')
    })

    it('36. Cross-school authorization prevents unauthorized config modification', async () => {
      // Seed a foreign school and admin user in DB
      db.prepare(
        `INSERT OR IGNORE INTO school_profiles (id, school_name, contact_person, email, phone, address, logo_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'sch_other_foreign',
        'Other Foreign School',
        'Foreign Coordinator',
        'foreign@otherschool.edu',
        '+91 99999 88888',
        'Other City',
        null,
        Date.now(),
        Date.now()
      )

      db.prepare(
        `INSERT OR IGNORE INTO admin_users (id, email, password_hash, salt, name, role, school_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'admin_foreign_99',
        'foreign@otherschool.edu',
        'dummyhash',
        'dummysalt',
        'Foreign Admin',
        'school_admin',
        'sch_other_foreign',
        Date.now(),
        Date.now()
      )

      // Create admin token for a different school
      const foreignAdminToken = generateAdminToken({
        id: 'admin_foreign_99',
        email: 'foreign@otherschool.edu',
        name: 'Foreign Admin',
        role: 'school_admin',
        schoolId: 'sch_other_foreign',
      })

      // Attempt GET config of default school's event
      const getRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        headers: { Authorization: `Bearer ${foreignAdminToken}` },
      })
      assert.equal(getRes.status, 403)

      // Attempt PUT config of default school's event
      const putRes = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${foreignAdminToken}`,
        },
        body: JSON.stringify({
          branding: { eventTitle: 'Hijacked Event' },
        }),
      })
      assert.equal(putRes.status, 403)
    })

    it('37. Unauthenticated request to /api/admin/events/:eventId/config returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${testEventId}/config`)
      assert.equal(res.status, 401)
    })

    it('38. POST /api/admin/upload validates and uploads branding logo successfully', async () => {
      const token = await getAdminAuthToken()
      const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const res = await fetch(`${baseUrl}/api/admin/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: 'school_logo.png',
          dataUrl: `data:image/png;base64,${samplePng}`,
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.ok(data.url)
      assert.match(data.url, /\/api\/assets\/file\/logos\//)
    })

    it('39. POST /api/admin/upload rejects non-image or invalid payloads', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: 'script.js',
          dataUrl: 'data:text/javascript;base64,YWxlcnQoMSk=',
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })
  })

  // ----------------------------------------------------
  // 6. STEP 4: EVENT ID, ACTIVATION QR & BOOTH ACTIVATION
  // ----------------------------------------------------
  describe('Step 4: Unique Event ID, Activation QR & Photobooth Activation', () => {
    let activeTestEventId: string
    let activeToken: string
    let incompleteEventId: string
    let cancelledEventId: string

    before(async () => {
      const token = await getAdminAuthToken()

      // 1. Create fully configured event for activation testing
      const createRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Annual Sports Day 2026',
          venue: 'Olympic Sports Complex',
          eventDate: '2026-11-15',
          startTime: '09:00',
          endTime: '17:00',
        }),
      })
      const createData = await createRes.json()
      assert.ok(createData.event, `Create event failed: ${JSON.stringify(createData)}`)
      activeTestEventId = createData.event.eventId

      // Save complete configuration
      await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branding: { eventTitle: 'Sports Day 2026', schoolName: 'Pehchaan Model School' },
          photoSettings: { shotCount: 3, orientation: 'portrait_strip', mirrorOutput: true },
          template: { templateId: 'classic-strip', background: '#0b0a09', overlayEnabled: false },
          delivery: { printEnabled: true, cloudQrEnabled: true, emailEnabled: false, whatsappEnabled: false },
          payment: { mode: 'organizer', amount: 0, currency: 'INR' },
          privacy: { schoolMode: true, consentMode: 'notice', retentionHours: 72 },
        }),
      })

      // 2. Create an incomplete event
      const incRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Unconfigured Gathering',
          venue: 'Main Hall',
          eventDate: '2026-11-20',
          startTime: '10:00',
          endTime: '14:00',
        }),
      })
      const incData = await incRes.json()
      assert.ok(incData.event, `Create incomplete event failed: ${JSON.stringify(incData)}`)
      incompleteEventId = incData.event.eventId

      // 3. Create a cancelled event
      const canRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Cancelled Carnival',
          venue: 'Grounds',
          eventDate: '2026-11-25',
          startTime: '11:00',
          endTime: '16:00',
        }),
      })
      const canData = await canRes.json()
      assert.ok(canData.event, `Create cancelled event failed: ${JSON.stringify(canData)}`)
      cancelledEventId = canData.event.eventId

      await fetch(`${baseUrl}/api/admin/events/${cancelledEventId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    })

    it('40. Event ID is generated in stable, readable PEH-XXXXXX format and is unique', async () => {
      const token = await getAdminAuthToken()
      const res1 = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Unique Test Event 1',
          venue: 'Hall A',
          eventDate: '2026-12-01',
          startTime: '09:00',
          endTime: '12:00',
        }),
      })
      const data1 = await res1.json()

      const res2 = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Unique Test Event 2',
          venue: 'Hall B',
          eventDate: '2026-12-02',
          startTime: '13:00',
          endTime: '17:00',
        }),
      })
      const data2 = await res2.json()

      assert.match(data1.event.eventId, /^PEH-[A-Z0-9]{6}$/)
      assert.match(data2.event.eventId, /^PEH-[A-Z0-9]{6}$/)
      assert.notEqual(data1.event.eventId, data2.event.eventId)
    })

    it('41. GET /api/admin/events/:eventId/activation returns readiness checklist, QR SVG, and opaque payload', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.eventId, activeTestEventId)
      assert.equal(data.readiness.isReady, true)
      assert.equal(data.activationStatus, 'ready')
      assert.ok(data.qrSvg && data.qrSvg.includes('<svg'))
      assert.ok(data.qrDataUrl && data.qrDataUrl.startsWith('data:image/svg+xml'))
      assert.ok(data.qrPayload)
      assert.ok(data.activationToken)

      activeToken = data.activationToken

      // Verify QR payload is clean, opaque JSON
      const parsedQr = JSON.parse(data.qrPayload)
      assert.equal(parsedQr.app, 'pehchaan-photobooth')
      assert.equal(parsedQr.eventId, activeTestEventId)
      assert.equal(parsedQr.token, data.activationToken)

      // SECURITY CRITICAL: Ensure NO secrets or passwords are in the QR payload
      assert.equal((parsedQr as any).password, undefined)
      assert.equal((parsedQr as any).pin, undefined)
      assert.equal((parsedQr as any).staffPin, undefined)
      assert.equal((parsedQr as any).apiKey, undefined)
      assert.equal((parsedQr as any).secret, undefined)
      assert.equal((parsedQr as any).db, undefined)
    })

    it('42. GET /api/admin/events/:eventId/activation for incomplete event reports not ready', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${incompleteEventId}/activation`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.readiness.isReady, false)
      assert.equal(data.activationStatus, 'not_ready')
      assert.ok(data.readiness.checks.some((c: any) => !c.passed))
    })

    it('43. POST /api/admin/events/:eventId/activation/regenerate produces a new token and invalidates the previous one', async () => {
      const token = await getAdminAuthToken()
      const res = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.notEqual(data.activationToken, activeToken)

      const oldToken = activeToken
      activeToken = data.activationToken

      // Verify older token is rejected during booth activation
      const rejectOldRes = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeTestEventId,
          token: oldToken,
        }),
      })
      assert.equal(rejectOldRes.status, 401)
      const rejectData = await rejectOldRes.json()
      assert.equal(rejectData.error.code, 'INVALID_ACTIVATION_TOKEN')
    })

    it('44. POST /api/booth/activate successfully activates event and returns Event Pack', async () => {
      const res = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeTestEventId,
          token: activeToken,
          deviceId: 'dev_booth_ipad_01',
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.event.eventId, activeTestEventId)
      assert.equal(data.event.status, 'live')
      assert.equal(data.event.name, 'Annual Sports Day 2026')
      assert.ok(data.config)
      assert.ok(data.eventPack)
      assert.equal(data.eventPack.id, `pack_${activeTestEventId}`)
      assert.equal(data.eventPack.shotCount, 3)
      assert.equal(data.eventPack.schoolMode, true)

      // Verify active device count now reflects the activated device
      const adminToken = await getAdminAuthToken()
      const statusRes = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const statusData = await statusRes.json()
      assert.equal(statusData.activationStatus, 'active_on_booth')
      assert.ok(statusData.activeDeviceCount >= 1)
    })

    it('45. POST /api/booth/activate supports case-insensitive Event ID lookup', async () => {
      const lowercaseId = activeTestEventId.toLowerCase()
      const res = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: lowercaseId,
          token: activeToken,
        }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.event.eventId, activeTestEventId)
    })

    it('46. POST /api/booth/activate rejects non-existent Event ID with 404', async () => {
      const res = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'PEH-NONEXISTENT',
        }),
      })

      assert.equal(res.status, 404)
      const data = await res.json()
      assert.equal(data.error.code, 'EVENT_NOT_FOUND')
    })

    it('47. POST /api/booth/activate rejects cancelled event with 400', async () => {
      const res = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: cancelledEventId,
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'EVENT_CANCELLED')
    })

    it('48. POST /api/booth/activate rejects unconfigured event with 400', async () => {
      const res = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: incompleteEventId,
        }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'CONFIG_INCOMPLETE')
    })

    it('49. Cross-school activation access is rejected (403)', async () => {
      // Create second school and admin in database
      db.prepare(
        `INSERT OR REPLACE INTO school_profiles (id, school_name, contact_person, email, phone, address, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('sch_other_02', 'Other Academy', 'Principal', 'other@academy.edu', '9999999999', 'Other City', Date.now(), Date.now())

      db.prepare(
        `INSERT OR REPLACE INTO admin_users (id, email, password_hash, salt, name, role, school_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('admin_school_2', 'admin2@other-school.edu', 'hash', 'salt', 'Other Admin', 'staff', 'sch_other_02', Date.now(), Date.now())

      const foreignAdminToken = generateAdminToken({
        id: 'admin_school_2',
        email: 'admin2@other-school.edu',
        name: 'Other Admin',
        role: 'staff',
        schoolId: 'sch_other_02',
      })

      // Attempt to view activation of school 1's event
      const res = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation`, {
        headers: { Authorization: `Bearer ${foreignAdminToken}` },
      })
      assert.equal(res.status, 403)

      // Attempt to regenerate token of school 1's event
      const regenRes = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${foreignAdminToken}` },
      })
      assert.equal(regenRes.status, 403)
    })

    it('50. Unauthenticated admin activation request returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation`)
      assert.equal(res.status, 401)
    })

    it('51. Staff PIN can be generated randomly, saved in event config, and synced end-to-end to photobooth kiosk', async () => {
      const token = await getAdminAuthToken()

      // 1. Generate random 6-digit staff PIN
      const customPin = generateRandomStaffPin()
      assert.match(customPin, /^\d{6}$/)

      // 2. Save configuration with custom staff PIN
      const saveRes = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          staffPin: customPin,
        }),
      })

      assert.equal(saveRes.status, 200)
      const saveData = await saveRes.json()
      assert.equal(saveData.config.staffPin, customPin)
      assert.equal(saveData.eventPack.staffPin, customPin)

      // 3. Verify GET activation returns the configured staffPin
      const actRes = await fetch(`${baseUrl}/api/admin/events/${activeTestEventId}/activation`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(actRes.status, 200)
      const actData = await actRes.json()
      assert.equal(actData.staffPin, customPin)

      // 4. Verify booth activation returns staffPin and valid Event Pack
      const boothRes = await fetch(`${baseUrl}/api/booth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeTestEventId,
          token: activeToken,
        }),
      })
      assert.equal(boothRes.status, 200)
      const boothData = await boothRes.json()
      assert.equal(boothData.staffPin, customPin)
      assert.equal(boothData.eventPack.staffPin, customPin)

      // 5. Verify booth authentication works with the custom staff PIN
      const boothAuth = await createStaffAuth(boothData.staffPin)
      const verifyCustom = await verifyStaffPin(customPin, boothAuth)
      assert.equal(verifyCustom.ok, true)

      // 6. Verify master default PIN (482917) also continues to work as emergency fallback
      const verifyMaster = await verifyStaffPin('482917', boothAuth)
      assert.equal(verifyMaster.ok, true)

      // 7. Verify wrong PIN is rejected
      const verifyWrong = await verifyStaffPin('000000', boothAuth)
      assert.equal(verifyWrong.ok, false)
    })
  })

  describe('Step 5: School Event Dashboard & Operational Telemetry', () => {
    let dashboardEventId: string
    let adminToken: string

    before(async () => {
      adminToken = await getAdminAuthToken()
      // Create a dedicated event with sessions, assets, payments, deliveries, and devices
      const createRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Annual Sports Gala 2026',
          eventDate: '2026-11-20',
          startTime: '09:00',
          endTime: '18:00',
          venue: 'Stadium Main Arena',
          description: 'Comprehensive sports day photobooth activation.',
        }),
      })
      const createData = await createRes.json()
      dashboardEventId = createData.event.eventId

      // Configure event with Individual Payment & School Mode ON
      await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          branding: {
            schoolName: 'Pehchaan Sports Academy',
            eventTitle: 'Sports Gala 2026',
            eventSubtitle: 'Champion Portraits',
            useDefaultSchoolLogo: true,
            accentColor: '#10b981',
          },
          photoSettings: {
            shotCount: 3,
            orientation: 'portrait_strip',
            mirrorOutput: true,
            blackAndWhiteEnabled: true,
            sepiaEnabled: false,
            betweenShotPauseMs: 3000,
            retentionHours: 72,
          },
          template: {
            templateId: 'classic-strip',
            background: '#ffffff',
            overlayEnabled: true,
          },
          delivery: {
            printEnabled: true,
            cloudQrEnabled: true,
            whatsappEnabled: true, // Will be blocked by schoolMode
            emailEnabled: true,
          },
          payment: {
            mode: 'individual',
            amount: 50,
            currency: 'INR',
            upiId: 'sports@okaxis',
            merchantName: 'Pehchaan Photobooth',
          },
          privacy: {
            schoolMode: true,
            consentMode: 'notice',
            privacyNoticeText: 'School event photo notice',
            retentionHours: 72,
            publicGalleryEnabled: false,
          },
        }),
      })

      // Register test device and activate event on it
      const testDevId = 'kiosk-dash-01'
      db.prepare(
        `INSERT OR REPLACE INTO devices (device_id, device_name, platform, app_version, status, registered_at, last_seen, active_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(testDevId, 'iPad Pro Main Kiosk', 'iPadOS 18.1', '1.0.0', 'active', Date.now(), Date.now(), dashboardEventId)

      // Create activation record
      db.prepare(
        `INSERT OR REPLACE INTO device_event_activations (id, device_id, event_id, activation_token, activated_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('act_dev_01', testDevId, dashboardEventId, 'act_token_test', Date.now(), Date.now())

      // Create 3 sessions
      const s1 = 'sess_dash_01'
      const s2 = 'sess_dash_02'
      const s3 = 'sess_dash_03'

      db.prepare(
        `INSERT INTO sessions (session_id, event_id, device_id, shot_count, language, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(s1, dashboardEventId, testDevId, 3, 'en', 'completed', Date.now() - 3600000, Date.now())

      db.prepare(
        `INSERT INTO sessions (session_id, event_id, device_id, shot_count, language, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(s2, dashboardEventId, testDevId, 3, 'en', 'completed', Date.now() - 1800000, Date.now())

      db.prepare(
        `INSERT INTO sessions (session_id, event_id, device_id, shot_count, language, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(s3, dashboardEventId, testDevId, 3, 'en', 'in_progress', Date.now(), Date.now())

      // Create assets for s1 and s2
      db.prepare(
        `INSERT INTO assets (asset_id, session_id, device_id, asset_role, shot_number, filename, content_type, byte_size, checksum, storage_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('ast_dash_01', s1, testDevId, 'composed', null, 'composite.jpg', 'image/jpeg', 245000, 'sha_test_1', 'sessions/sess_dash_01/composed/composite.jpg', Date.now())

      db.prepare(
        `INSERT INTO assets (asset_id, session_id, device_id, asset_role, shot_number, filename, content_type, byte_size, checksum, storage_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('ast_dash_02', s2, testDevId, 'composed', null, 'composite.jpg', 'image/jpeg', 238000, 'sha_test_2', 'sessions/sess_dash_02/composed/composite.jpg', Date.now())

      // Create verified payment for s1 and pending payment for s2
      db.prepare(
        `INSERT INTO payments (id, event_id, session_id, device_id, payment_reference, amount, currency, mode, status, provider, upi_id, created_at, updated_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('pay_dash_01', dashboardEventId, s1, testDevId, 'PAY-REF-DASH-1', 50, 'INR', 'individual', 'success', 'upi', 'parent1@okaxis', Date.now() - 3500000, Date.now(), Date.now())

      db.prepare(
        `INSERT INTO payments (id, event_id, session_id, device_id, payment_reference, amount, currency, mode, status, provider, upi_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('pay_dash_02', dashboardEventId, s2, testDevId, 'PAY-REF-DASH-2', 50, 'INR', 'individual', 'pending', 'upi', 'parent2@okaxis', Date.now() - 1700000, Date.now())

      // Create delivery record for s1 (print + qr)
      db.prepare(
        `INSERT INTO deliveries (id, event_id, session_id, device_id, channel, status, recipient_masked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('del_dash_01', dashboardEventId, s1, testDevId, 'print', 'success', 'Thermal Print 2x6', Date.now() - 3400000, Date.now())

      db.prepare(
        `INSERT INTO deliveries (id, event_id, session_id, device_id, channel, status, recipient_masked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('del_dash_02', dashboardEventId, s1, testDevId, 'qr', 'success', 'Gallery QR', Date.now() - 3400000, Date.now())
    })

    it('51. GET /api/admin/events/:eventId/dashboard returns 200 with complete dashboard structure', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      assert.equal(res.status, 200)
      const data = await res.json()

      assert.equal(data.success, true)
      assert.ok(data.event)
      assert.ok(data.summary)
      assert.ok(data.sessions)
      assert.ok(data.photos)
      assert.ok(data.deliveries)
      assert.ok(data.payments)
      assert.ok(data.devices)
      assert.ok(data.sync)
      assert.ok(data.recentActivity)
      assert.ok(data.performance)
    })

    it('52. Summary metrics accurately compute real database records', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const summary = data.summary

      assert.equal(summary.totalSessions, 3)
      assert.equal(summary.completedSessions, 2)
      assert.equal(summary.inProgressSessions, 1)
      assert.equal(summary.failedSessions, 0)
      assert.equal(summary.totalPhotos, 2)
      assert.equal(summary.processedPhotos, 2)
      assert.equal(summary.totalDeliveries, 2)
      assert.equal(summary.successfulDeliveries, 2)
      assert.equal(summary.totalPayments, 2)
      assert.equal(summary.successfulPayments, 1)
      assert.equal(summary.pendingPayments, 1)
      assert.equal(summary.totalPaymentAmount, 50)
      assert.equal(summary.paymentMode, 'individual')
      assert.equal(summary.activeBooths, 1)
      assert.equal(summary.pendingSync, 0)
    })

    it('53. Sessions list returns privacy-safe fields and omits raw guest PII', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const sessions = data.sessions

      assert.equal(sessions.length, 3)
      const s1 = sessions.find((s: any) => s.sessionId === 'sess_dash_01')
      assert.ok(s1)
      assert.equal(s1.status, 'completed')
      assert.equal(s1.photoCount, 1)
      assert.equal(s1.syncStatus, 'synced')
      // Ensure no raw phoneNumber or email is present on session object
      assert.equal(s1.phoneNumber, undefined)
      assert.equal(s1.email, undefined)
    })

    it('54. Photos section includes asset records with valid download/view URLs', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const photos = data.photos

      assert.equal(photos.totalCaptured, 2)
      assert.equal(photos.processedPhotos, 2)
      assert.ok(photos.recentPhotos.length > 0)
      const first = photos.recentPhotos[0]
      assert.ok(first.url.startsWith('/api/assets/file/'))
      assert.ok(first.byteSize > 0)
      assert.equal(first.assetRole, 'composed')
    })

    it('55. Delivery section reflects channel stats and schoolMode WhatsApp block', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const del = data.deliveries

      assert.equal(del.schoolMode, true)
      assert.equal(del.successful, 2)
      assert.equal(del.channels.print.enabled, true)
      assert.equal(del.channels.print.success, 1)
      assert.equal(del.channels.qr.enabled, true)
      assert.equal(del.channels.qr.success, 1)
      assert.equal(del.channels.whatsapp.enabled, false)
      assert.equal(del.channels.whatsapp.disabledBySchoolMode, true)
    })

    it('56. Payment section shows accurate mode, attempt counts, and revenue total', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const pay = data.payments

      assert.equal(pay.mode, 'individual')
      assert.equal(pay.amount, 50)
      assert.equal(pay.currency, 'INR')
      assert.equal(pay.totalAttempts, 2)
      assert.equal(pay.successful, 1)
      assert.equal(pay.pending, 1)
      assert.equal(pay.totalRevenue, 50)
      assert.ok(pay.recentPayments.length > 0)
      // Masked UPI check
      assert.ok(pay.recentPayments[0].upiId.includes('***@'))
    })

    it('57. Device status lists active booths, online state, and app versions', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const devs = data.devices

      assert.equal(devs.length, 1)
      assert.equal(devs[0].deviceId, 'kiosk-dash-01')
      assert.equal(devs[0].deviceName, 'iPad Pro Main Kiosk')
      assert.equal(devs[0].platform, 'iPadOS 18.1')
      assert.equal(devs[0].status, 'active')
      assert.equal(devs[0].isOnline, true)
      assert.equal(devs[0].syncStatus, 'synced')
    })

    it('58. Sync health section reports 0 pending items for durable cloud records', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const sync = data.sync

      assert.equal(sync.status, 'healthy')
      assert.equal(sync.pendingItems, 0)
      assert.equal(sync.failedItems, 0)
      assert.ok(sync.totalSyncedItems > 0)
    })

    it('59. Recent activity stream contains chronological milestones', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const acts = data.recentActivity

      assert.ok(acts.length > 0)
      const types = acts.map((a: any) => a.activityType)
      assert.ok(types.includes('event_created') || types.includes('booth_activated') || types.includes('delivery_completed') || types.includes('session_created'))
    })

    it('60. Derived performance KPIs handle math cleanly and avoid NaN/infinity', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      const perf = data.performance

      assert.equal(perf.completionRate, 67) // 2 completed / 3 total = 66.67% -> 67%
      assert.equal(perf.avgPhotosPerSession, 0.7) // 2 photos / 3 sessions = 0.67 -> 0.7
      assert.equal(perf.deliverySuccessRate, 100) // 2 success / 2 attempts = 100%
      assert.equal(perf.paymentSuccessRate, 50) // 1 success / 2 attempts = 50%
      assert.equal(perf.syncSuccessRate, 100)
    })

    it('61. Non-existent event returns 404 for dashboard endpoint', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/PEH-NONEXISTENT/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      assert.equal(res.status, 404)
    })

    it('62. Cross-school dashboard access is rejected with 403 Forbidden', async () => {
      // Create token for foreign school
      const foreignAdminToken = generateAdminToken({
        id: 'admin_school_2',
        email: 'admin2@other-school.edu',
        name: 'Other Admin',
        role: 'staff',
        schoolId: 'sch_other_02',
      })

      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${foreignAdminToken}` },
      })
      assert.equal(res.status, 403)
    })

    it('63. Unauthenticated request to event dashboard returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`)
      assert.equal(res.status, 401)
    })

    it('64. POST /api/deliveries/record logs delivery and updates metrics immediately', async () => {
      const recordRes = await fetch(`${baseUrl}/api/deliveries/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: dashboardEventId,
          sessionId: 'sess_dash_02',
          deviceId: 'kiosk-dash-01',
          channel: 'email',
          status: 'success',
          recipientMasked: 'gu***@school.edu',
        }),
      })
      assert.equal(recordRes.status, 200)

      // Fetch dashboard and verify email delivery count incremented
      const dashRes = await fetch(`${baseUrl}/api/admin/events/${dashboardEventId}/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const dashData = await dashRes.json()
      assert.equal(dashData.deliveries.channels.email.success, 1)
      assert.equal(dashData.summary.successfulDeliveries, 3)
    })

    it('65. GET /api/admin/stats and GET /api/admin/dashboard return school-wide aggregated metrics', async () => {
      const res = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.stats)
      assert.ok(data.stats.totalEvents >= 1)
      assert.ok(typeof data.stats.totalSessions === 'number')
      assert.ok(typeof data.stats.totalPhotos === 'number')
      assert.ok(typeof data.stats.totalDeliveries === 'number')
      assert.ok(Array.isArray(data.stats.recentEvents))
      assert.ok(data.stats.recentEvents.length > 0)
    })
  })

  // ----------------------------------------------------
  // STEP 6: ADMIN PHOTOBOOTH FLEET & EVENT ASSIGNMENT
  // ----------------------------------------------------
  describe('Step 6: Admin Photobooth Device Fleet Management & Event Assignment', () => {
    let adminToken: string
    let assignableEventId: string
    let cancelledEventId: string
    const testIpadId = 'ipad-booth-assigned-01'

    before(async () => {
      adminToken = await getAdminAuthToken()

      // Register an iPad kiosk
      await fetch(`${baseUrl}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testIpadId,
          deviceName: 'Front Desk iPad Pro',
          platform: 'iPadOS',
          appVersion: '2.1.0',
        }),
      })

      // Create an assignable event
      const evRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Science & Robotics Gala 2026',
          venue: 'Auditorium Hall B',
          eventDate: '2026-12-10',
          startTime: '10:00',
          endTime: '16:00',
        }),
      })
      const evData = await evRes.json()
      assignableEventId = evData.event.eventId

      // Create a cancelled event
      const canRes = await fetch(`${baseUrl}/api/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Cancelled Science Fair',
          venue: 'Gymnasium',
          eventDate: '2026-12-11',
          startTime: '10:00',
          endTime: '14:00',
        }),
      })
      const canData = await canRes.json()
      cancelledEventId = canData.event.eventId
      await fetch(`${baseUrl}/api/admin/events/${cancelledEventId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    })

    it('66. GET /api/admin/devices lists registered fleet devices with activeEventId', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.ok(Array.isArray(data.devices))
      const found = data.devices.find((d: any) => d.deviceId === testIpadId)
      assert.ok(found)
      assert.equal(found.deviceName, 'Front Desk iPad Pro')
      assert.equal(found.activeEventId, null)
    })

    it('67. Admin assigns existing Event to existing Device (A)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: assignableEventId }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.device.deviceId, testIpadId)
      assert.equal(data.device.activeEventId, assignableEventId)

      // Verify GET /api/devices/:deviceId reflects activeEventId
      const getDevRes = await fetch(`${baseUrl}/api/devices/${testIpadId}`)
      assert.equal(getDevRes.status, 200)
      const devData = await getDevRes.json()
      assert.equal(devData.device.activeEventId, assignableEventId)
    })

    it('68. iPad Registration after Assignment returns real assigned eventId (B)', async () => {
      const regRes = await fetch(`${baseUrl}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testIpadId,
          deviceName: 'Front Desk iPad Pro (Updated)',
          platform: 'iPadOS',
          appVersion: '2.1.1',
        }),
      })

      assert.equal(regRes.status, 200)
      const regData = await regRes.json()
      assert.equal(regData.isNew, false)
      assert.equal(regData.device.deviceId, testIpadId)
      assert.equal(regData.device.activeEventId, assignableEventId)
    })

    it('69. Admin unassigns event via POST /api/admin/devices/:deviceId/unassign-event (C)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/unassign-event`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.device.activeEventId, null)

      // Subsequent iPad registration returns activeEventId: null
      const regRes = await fetch(`${baseUrl}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testIpadId,
          deviceName: 'Front Desk iPad Pro',
          platform: 'iPadOS',
          appVersion: '2.1.1',
        }),
      })
      const regData = await regRes.json()
      assert.equal(regData.device.activeEventId, null)
    })

    it('70. Admin unassigns event via POST /api/admin/devices/:deviceId/assign-event with null eventId', async () => {
      // Re-assign first
      await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: assignableEventId }),
      })

      // Unassign with eventId: null
      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: null }),
      })

      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.success, true)
      assert.equal(data.device.activeEventId, null)
    })

    it('71. Assigning to unknown device returns 404 DEVICE_NOT_FOUND (D)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices/non-existent-device-999/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: assignableEventId }),
      })

      assert.equal(res.status, 404)
      const data = await res.json()
      assert.equal(data.error.code, 'DEVICE_NOT_FOUND')
    })

    it('72. Assigning unknown event returns 404 NOT_FOUND (E)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: 'evt_completely_unknown_xyz' }),
      })

      assert.equal(res.status, 404)
      const data = await res.json()
      assert.equal(data.error.code, 'NOT_FOUND')
    })

    it('73. Unauthorized / non-admin request is rejected with 401 (F)', async () => {
      // Missing token
      const res1 = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: assignableEventId }),
      })
      assert.equal(res1.status, 401)

      // Invalid token
      const res2 = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid.token' },
        body: JSON.stringify({ eventId: assignableEventId }),
      })
      assert.equal(res2.status, 401)
    })

    it('74. Cross-school event assignment is rejected with 403 Forbidden (G)', async () => {
      // Ensure foreign school and admin exist in DB
      db.prepare(
        `INSERT OR IGNORE INTO school_profiles (id, school_name, contact_person, email, phone, address, logo_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'sch_other_foreign',
        'Other Foreign School',
        'Foreign Coordinator',
        'foreign@otherschool.edu',
        '+91 99999 88888',
        'Other City',
        null,
        Date.now(),
        Date.now()
      )

      db.prepare(
        `INSERT OR IGNORE INTO admin_users (id, email, password_hash, salt, name, role, school_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'admin_foreign_99',
        'foreign@otherschool.edu',
        'dummyhash',
        'dummysalt',
        'Foreign Admin',
        'school_admin',
        'sch_other_foreign',
        Date.now(),
        Date.now()
      )

      // Create admin token for a different school
      const foreignAdminToken = generateAdminToken({
        id: 'admin_foreign_99',
        email: 'foreign@otherschool.edu',
        name: 'Foreign Admin',
        role: 'school_admin',
        schoolId: 'sch_other_foreign',
      })

      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${foreignAdminToken}` },
        body: JSON.stringify({ eventId: assignableEventId }),
      })

      assert.equal(res.status, 403)
      const data = await res.json()
      assert.equal(data.error.code, 'FORBIDDEN')
    })

    it('75. Assigning cancelled event is rejected with 400 EVENT_CANCELLED', async () => {
      const res = await fetch(`${baseUrl}/api/admin/devices/${testIpadId}/assign-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: cancelledEventId }),
      })

      assert.equal(res.status, 400)
      const data = await res.json()
      assert.equal(data.error.code, 'EVENT_CANCELLED')
    })
  })
})



