import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createAppContext, createAppServer } from '../server/app.js'
import { createDatabase } from '../server/db/database.js'
import { createStorage } from '../server/storage/storageFactory.js'
import { generateAdminToken } from '../server/auth/adminAuth.js'

describe('Event Inquiries & Leads System Tests', () => {
  let server: http.Server
  let baseUrl: string
  let adminToken: string

  before(async () => {
    const db = createDatabase({ memory: true })
    const storage = createStorage({ type: 'memory' })
    const ctx = createAppContext({ db, storage })

    const admin = ctx.adminRepo.getAdminByEmail('admin@pehchaan.me')
    assert.ok(admin)
    adminToken = generateAdminToken(admin)

    server = createAppServer(ctx)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  test('GET /api/inquiries/meta returns metadata options', async () => {
    const res = await fetch(`${baseUrl}/api/inquiries/meta`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.equal(data.success, true)
    assert.ok(Array.isArray(data.cities))
    assert.ok(data.cities.includes('Hyderabad'))
    assert.ok(Array.isArray(data.audienceBands))
    assert.ok(Array.isArray(data.settings))
  })

  test('POST /api/inquiries successfully submits a booking inquiry', async () => {
    const payload = {
      organisation: 'Oakridge International School',
      contactName: 'Priya Sharma',
      whatsappNumber: '+91 98765 43210',
      email: 'priya.sharma@oakridge.edu.in',
      city: 'Hyderabad',
      eventDateText: 'Mid November 2026',
      audienceBand: '100 – 300 guests',
      setting: 'Indoor',
      requirements: 'Main auditorium foyer access from 9am',
      customWishes: 'Custom school crest frame overlay',
    }

    const res = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    assert.equal(res.status, 201)
    const data = (await res.json()) as any
    assert.equal(data.success, true)
    assert.ok(data.inquiry)
    assert.ok(data.inquiry.id.startsWith('INQ-'))
    assert.equal(data.inquiry.organisation, 'Oakridge International School')
    assert.equal(data.inquiry.contactName, 'Priya Sharma')
    assert.equal(data.inquiry.status, 'new')
  })

  test('POST /api/inquiries validates required fields', async () => {
    const res = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisation: '',
        contactName: '',
      }),
    })

    assert.equal(res.status, 400)
    const data = (await res.json()) as any
    assert.equal(data.error.code, 'VALIDATION_ERROR')
  })

  test('GET /api/admin/inquiries lists submitted inquiries with stats', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inquiries`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.equal(data.success, true)
    assert.ok(Array.isArray(data.inquiries))
    assert.equal(data.inquiries.length, 1)
    assert.equal(data.stats.total, 1)
    assert.equal(data.stats.new, 1)
  })

  test('PUT /api/admin/inquiries/:id updates status and internal notes', async () => {
    // Get existing inquiry ID
    const listRes = await fetch(`${baseUrl}/api/admin/inquiries`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const listData = (await listRes.json()) as any
    const inquiryId = listData.inquiries[0].id

    const updateRes = await fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'contacted',
        notes: 'Called on WhatsApp, sent quotation PDF',
      }),
    })

    assert.equal(updateRes.status, 200)
    const updateData = (await updateRes.json()) as any
    assert.equal(updateData.success, true)
    assert.equal(updateData.inquiry.status, 'contacted')
    assert.equal(updateData.inquiry.notes, 'Called on WhatsApp, sent quotation PDF')
  })
})
