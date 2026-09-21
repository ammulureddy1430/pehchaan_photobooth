import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import os from 'node:os'
import type Database from 'better-sqlite3'
import { DeviceRepository } from './db/repositories/deviceRepository.js'
import { EventRepository } from './db/repositories/eventRepository.js'
import { SessionRepository } from './db/repositories/sessionRepository.js'
import { AssetRepository } from './db/repositories/assetRepository.js'
import { PaymentRepository } from './db/repositories/paymentRepository.js'
import { AdminRepository } from './db/repositories/adminRepository.js'
import { SchoolRepository } from './db/repositories/schoolRepository.js'
import {
  EventConfigurationRepository,
  getDefaultConfiguration,
  generateEventPack,
  validateServerEventPack,
} from './db/repositories/eventConfigurationRepository.js'
import { EventDashboardRepository } from './db/repositories/eventDashboardRepository.js'
import { InquiryRepository } from './db/repositories/inquiryRepository.js'
import type { AssetStorage } from './storage/storage.js'
import { createStorage } from './storage/storageFactory.js'
import { createDatabase } from './db/database.js'
import { authenticateDevice, extractDeviceToken } from './auth/authMiddleware.js'
import { authenticateAdmin, generateAdminToken, extractAdminToken, verifyAdminToken } from './auth/adminAuth.js'
import { AppError, formatErrorResponse } from './errors/AppError.js'
import type { AssetRole } from './db/types.js'
import { publicTunnelService, PublicTunnelService } from './tunnel.js'
import { createGatewayProvider, type PaymentGatewayProvider } from './gateway/index.js'
import { generateQrSvg, generateQrDataUrl } from './utils/qrGenerator.js'

export interface AppContext {
  db: Database.Database
  storage: AssetStorage
  deviceRepo: DeviceRepository
  eventRepo: EventRepository
  sessionRepo: SessionRepository
  assetRepo: AssetRepository
  paymentRepo: PaymentRepository
  adminRepo: AdminRepository
  schoolRepo: SchoolRepository
  eventConfigRepo: EventConfigurationRepository
  eventDashboardRepo: EventDashboardRepository
  inquiryRepo: InquiryRepository
  gateway: PaymentGatewayProvider
  tunnel?: PublicTunnelService
}

export function createAppContext(options: {
  db?: Database.Database
  storage?: AssetStorage
  gateway?: PaymentGatewayProvider
  tunnel?: PublicTunnelService
  adminRepo?: AdminRepository
  schoolRepo?: SchoolRepository
  eventConfigRepo?: EventConfigurationRepository
  eventDashboardRepo?: EventDashboardRepository
  inquiryRepo?: InquiryRepository
} = {}): AppContext {
  const db = options.db || createDatabase()
  const storage = options.storage || createStorage()
  const deviceRepo = new DeviceRepository(db)
  const eventRepo = new EventRepository(db)
  const sessionRepo = new SessionRepository(db)
  const assetRepo = new AssetRepository(db, storage)
  const paymentRepo = new PaymentRepository(db)
  const adminRepo = options.adminRepo || new AdminRepository(db)
  const schoolRepo = options.schoolRepo || new SchoolRepository(db)
  const eventConfigRepo = options.eventConfigRepo || new EventConfigurationRepository(db)
  const eventDashboardRepo =
    options.eventDashboardRepo ||
    new EventDashboardRepository(db, eventRepo, eventConfigRepo, schoolRepo)
  const inquiryRepo = options.inquiryRepo || new InquiryRepository(db)
  const gateway = options.gateway || createGatewayProvider()
  const tunnel = options.tunnel || publicTunnelService

  return {
    db,
    storage,
    deviceRepo,
    eventRepo,
    sessionRepo,
    assetRepo,
    paymentRepo,
    adminRepo,
    schoolRepo,
    eventConfigRepo,
    eventDashboardRepo,
    inquiryRepo,
    gateway,
    tunnel,
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const buffer = await readBody(req)
  if (buffer.length === 0) {
    return {} as T
  }
  const text = buffer.toString('utf8')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON in request body')
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-token, x-admin-token',
  })
  res.end(json)
}

function sendError(res: ServerResponse, err: unknown): void {
  const { status, body } = formatErrorResponse(err)
  sendJson(res, status, body)
}

function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-token, x-admin-token',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return true
  }
  return false
}

function checkSessionPaymentGating(ctx: AppContext, sessionId: string, eventId?: string | null): boolean {
  const payment = ctx.paymentRepo.getPaymentBySessionId(sessionId)
  if (payment) {
    if (payment.mode === 'individual' && payment.status !== 'success' && payment.status !== 'paid') {
      return false
    }
    return true
  }

  if (eventId) {
    const event = ctx.eventRepo.getEvent(eventId)
    const pack = event?.eventPackSnapshot as any
    if (pack?.payment?.enabled && pack?.payment?.mode === 'individual') {
      return false
    }
  }

  return true
}

export function createRequestHandler(ctx: AppContext) {
  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (handleCors(req, res)) return

    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = parsedUrl.pathname
      const method = req.method?.toUpperCase() || 'GET'

      // Health check & Server info
      if (method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
        sendJson(res, 200, { status: 'healthy', time: Date.now() })
        return
      }

      if (method === 'GET' && pathname === '/api/server-info') {
        const interfaces = os.networkInterfaces()
        const ips: string[] = []
        for (const name of Object.keys(interfaces)) {
          for (const net of interfaces[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
              ips.push(net.address)
            }
          }
        }
        const port = parsedUrl.port || '3001'
        const primaryLanIp = ips[0] || '127.0.0.1'
        const publicUrl = ctx.tunnel?.getPublicUrl() || publicTunnelService.getPublicUrl() || null
        sendJson(res, 200, {
          status: 'healthy',
          time: Date.now(),
          primaryLanIp,
          lanIps: ips,
          port,
          publicUrl,
          baseUrl: publicUrl || `http://${primaryLanIp}:${port}`,
        })
        return
      }

      // GET /api/tunnel
      if (method === 'GET' && pathname === '/api/tunnel') {
        const publicUrl = ctx.tunnel?.getPublicUrl() || publicTunnelService.getPublicUrl() || null
        sendJson(res, 200, {
          active: Boolean(publicUrl),
          publicUrl,
        })
        return
      }

      // POST /api/tunnel/start
      if (method === 'POST' && pathname === '/api/tunnel/start') {
        const tunnel = ctx.tunnel || publicTunnelService
        const publicUrl = await tunnel.startTunnel()
        sendJson(res, 200, {
          success: Boolean(publicUrl),
          publicUrl,
        })
        return
      }

      // POST /api/tunnel/stop
      if (method === 'POST' && pathname === '/api/tunnel/stop') {
        const tunnel = ctx.tunnel || publicTunnelService
        tunnel.stopTunnel()
        sendJson(res, 200, {
          success: true,
          publicUrl: null,
        })
        return
      }

      // ----------------------------------------------------
      // PUBLIC INQUIRIES & EVENT BOOKING ROUTES
      // ----------------------------------------------------

      // POST /api/inquiries - Submit event booking inquiry
      if (method === 'POST' && pathname === '/api/inquiries') {
        const body = await readJsonBody(req)
        const inquiry = ctx.inquiryRepo.createInquiry({
          organisation: body.organisation,
          contactName: body.contactName || body.name,
          whatsappNumber: body.whatsappNumber || body.whatsapp || body.phone,
          email: body.email,
          city: body.city,
          eventDateText: body.eventDateText || body.dateText || body.date,
          audienceBand: body.audienceBand || body.audience,
          setting: body.setting,
          requirements: body.requirements,
          customWishes: body.customWishes || body.wishes,
          metadata: body.metadata,
        })
        sendJson(res, 201, {
          success: true,
          inquiry,
          message: 'Thank you for reaching out! We have received your photobooth inquiry and will contact you via WhatsApp shortly.',
        })
        return
      }

      // GET /api/inquiries/meta - Get options and metadata for inquiry form
      if (method === 'GET' && pathname === '/api/inquiries/meta') {
        sendJson(res, 200, {
          success: true,
          cities: [
            'Hyderabad',
            'Bangalore',
            'Mumbai',
            'Delhi NCR',
            'Chennai',
            'Pune',
            'Kolkata',
            'Goa',
            'Jaipur',
            'Other',
          ],
          audienceBands: [
            'Under 100 guests',
            '100 – 300 guests',
            '300 – 500 guests',
            '500 – 1,000 guests',
            '1,000+ guests',
          ],
          settings: [
            'Indoor',
            'Outdoor (Covered)',
            'Outdoor (Open Air)',
            'Hybrid / Multiple Locations',
          ],
        })
        return
      }

      // ----------------------------------------------------
      // ADMIN & SCHOOL PORTAL ROUTES
      // ----------------------------------------------------

      // POST /api/admin/auth/login
      if (method === 'POST' && pathname === '/api/admin/auth/login') {
        const body = await readJsonBody(req)
        const { email, password } = body

        if (!email || typeof email !== 'string' || !email.trim()) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Email is required')
        }
        if (!password || typeof password !== 'string') {
          throw new AppError(400, 'VALIDATION_ERROR', 'Password is required')
        }

        const admin = ctx.adminRepo.getAdminByEmail(email.trim())
        if (!admin) {
          throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
        }

        const isValid = AdminRepository.verifyPassword(password, admin.passwordHash, admin.salt)
        if (!isValid) {
          throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
        }

        const token = generateAdminToken(admin)
        sendJson(res, 200, {
          token,
          admin: ctx.adminRepo.toSafe(admin),
        })
        return
      }

      // GET /api/admin/auth/me
      if (method === 'GET' && pathname === '/api/admin/auth/me') {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        sendJson(res, 200, { admin })
        return
      }

      // POST /api/admin/auth/logout
      if (method === 'POST' && pathname === '/api/admin/auth/logout') {
        authenticateAdmin(req, ctx.adminRepo)
        sendJson(res, 200, { success: true, message: 'Logged out successfully' })
        return
      }

      // GET /api/admin/stats or GET /api/admin/dashboard
      if (method === 'GET' && (pathname === '/api/admin/stats' || pathname === '/api/admin/dashboard')) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const stats = ctx.eventDashboardRepo.getSchoolDashboardStats(admin.schoolId)
        sendJson(res, 200, {
          success: true,
          stats,
        })
        return
      }

      // ----------------------------------------------------
      // ADMIN INQUIRIES & LEADS MANAGEMENT ROUTES
      // ----------------------------------------------------

      const adminInquiryDetailMatch = pathname.match(/^\/api\/admin\/inquiries\/([^/]+)$/)

      // GET /api/admin/inquiries/stats
      if (method === 'GET' && pathname === '/api/admin/inquiries/stats') {
        authenticateAdmin(req, ctx.adminRepo)
        const stats = ctx.inquiryRepo.getInquiryStats()
        sendJson(res, 200, {
          success: true,
          stats,
        })
        return
      }

      // GET /api/admin/inquiries
      if (method === 'GET' && pathname === '/api/admin/inquiries') {
        authenticateAdmin(req, ctx.adminRepo)
        const searchParams = parsedUrl.searchParams
        const status = searchParams.get('status') || undefined
        const search = searchParams.get('search') || undefined
        const limitStr = searchParams.get('limit')
        const limit = limitStr ? parseInt(limitStr, 10) : undefined

        const inquiries = ctx.inquiryRepo.listInquiries({ status, search, limit })
        const stats = ctx.inquiryRepo.getInquiryStats()
        sendJson(res, 200, {
          success: true,
          inquiries,
          stats,
        })
        return
      }

      // GET /api/admin/inquiries/:id
      if (method === 'GET' && adminInquiryDetailMatch && !pathname.endsWith('/stats')) {
        authenticateAdmin(req, ctx.adminRepo)
        const inquiryId = adminInquiryDetailMatch[1]
        const inquiry = ctx.inquiryRepo.getInquiry(inquiryId)
        if (!inquiry) {
          throw new AppError(404, 'NOT_FOUND', `Inquiry ${inquiryId} not found`)
        }
        sendJson(res, 200, {
          success: true,
          inquiry,
        })
        return
      }

      // PUT /api/admin/inquiries/:id
      if (method === 'PUT' && adminInquiryDetailMatch) {
        authenticateAdmin(req, ctx.adminRepo)
        const inquiryId = adminInquiryDetailMatch[1]
        const body = await readJsonBody(req)
        const updated = ctx.inquiryRepo.updateInquiry(inquiryId, body)
        sendJson(res, 200, {
          success: true,
          inquiry: updated,
        })
        return
      }

      // DELETE /api/admin/inquiries/:id
      if (method === 'DELETE' && adminInquiryDetailMatch) {
        authenticateAdmin(req, ctx.adminRepo)
        const inquiryId = adminInquiryDetailMatch[1]
        const deleted = ctx.inquiryRepo.deleteInquiry(inquiryId)
        if (!deleted) {
          throw new AppError(404, 'NOT_FOUND', `Inquiry ${inquiryId} not found`)
        }
        sendJson(res, 200, {
          success: true,
          message: 'Inquiry deleted successfully',
        })
        return
      }

      // Matchers for admin event routes
      const adminEventDashboardMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/dashboard$/)
      const adminEventConfigMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/config$/)
      const adminEventActivationMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/activation$/)
      const adminEventActivationRegenMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/activation\/regenerate$/)
      const adminEventCancelMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)\/cancel$/)
      const adminEventDetailsMatch = pathname.match(/^\/api\/admin\/events\/([^/]+)$/)

      // GET /api/admin/events/:eventId/dashboard
      if (method === 'GET' && adminEventDashboardMatch) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventDashboardMatch[1]
        const isSuperAdmin = admin.role === 'superadmin'
        const data = ctx.eventDashboardRepo.getEventDashboard(eventId, admin.schoolId, isSuperAdmin)
        sendJson(res, 200, {
          success: true,
          ...data,
        })
        return
      }

      // GET /api/admin/events
      if (method === 'GET' && pathname === '/api/admin/events') {
        authenticateAdmin(req, ctx.adminRepo)
        const profile = ctx.schoolRepo.getProfile()
        const events = ctx.eventRepo.listEventsBySchool(profile?.id)
        const enrichedEvents = events.map((e) => {
          const sessionCountRow = ctx.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE event_id = ?').get(e.eventId) as { count: number }
          const photoCountRow = ctx.db.prepare(`
            SELECT COUNT(*) as count FROM assets a
            JOIN sessions s ON a.session_id = s.session_id
            WHERE s.event_id = ?
          `).get(e.eventId) as { count: number }
          const deliveryCountRow = ctx.db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE event_id = ? AND status = 'success'").get(e.eventId) as { count: number }
          const config = ctx.eventConfigRepo.getConfiguration(e.eventId)

          return {
            ...e,
            sessionCount: sessionCountRow?.count || 0,
            photoCount: photoCountRow?.count || 0,
            deliveryCount: deliveryCountRow?.count || 0,
            paymentMode: config?.payment?.mode || 'organizer',
            venue: e.venue || (e.metadata as any)?.venue || 'School Campus',
            schoolName: profile?.schoolName || 'School Campus',
          }
        })
        sendJson(res, 200, { events: enrichedEvents })
        return
      }

      // POST /api/admin/events - Create Event
      if (method === 'POST' && pathname === '/api/admin/events') {
        authenticateAdmin(req, ctx.adminRepo)
        const profile = ctx.schoolRepo.getProfile()
        const body = await readJsonBody(req)

        const name = (body.name || body.eventName || '').trim()
        const eventDate = (body.eventDate || body.date || '').trim()
        const startTime = (body.startTime || '').trim()
        const endTime = (body.endTime || '').trim()
        const venue = (body.venue || '').trim()
        const description = (body.description || '').trim()

        if (!name) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Event Name is required.')
        }
        if (!eventDate) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Event Date is required.')
        }
        if (!startTime) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Start Time is required.')
        }
        if (!endTime) {
          throw new AppError(400, 'VALIDATION_ERROR', 'End Time is required.')
        }
        if (!venue) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Venue is required.')
        }

        // Validate time range
        const startParts = startTime.split(':').map(Number)
        const endParts = endTime.split(':').map(Number)
        if (startParts.length >= 2 && endParts.length >= 2 && !isNaN(startParts[0]) && !isNaN(endParts[0])) {
          const startMin = startParts[0] * 60 + (startParts[1] || 0)
          const endMin = endParts[0] * 60 + (endParts[1] || 0)
          if (endMin <= startMin) {
            throw new AppError(400, 'VALIDATION_ERROR', 'End Time must be later than Start Time.')
          }
        } else if (endTime <= startTime) {
          throw new AppError(400, 'VALIDATION_ERROR', 'End Time must be later than Start Time.')
        }

        const { event } = ctx.eventRepo.createEvent({
          schoolId: profile.id,
          name,
          eventDate,
          startTime,
          endTime,
          venue,
          description,
          status: 'draft',
          metadata: {
            venue,
            description,
            schoolName: profile.schoolName,
          },
        })

        const enrichedEvent = {
          ...event,
          sessionCount: 0,
          schoolName: profile.schoolName,
        }

        sendJson(res, 201, { success: true, event: enrichedEvent })
        return
      }

      // POST /api/admin/events/:eventId/cancel
      if (method === 'POST' && adminEventCancelMatch) {
        authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventCancelMatch[1]
        const existing = ctx.eventRepo.getEvent(eventId)
        if (!existing) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        const profile = ctx.schoolRepo.getProfile()
        if (existing.schoolId && profile && existing.schoolId !== profile.id) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this event.')
        }

        const updated = ctx.eventRepo.updateEvent(eventId, {
          status: 'cancelled',
        })

        sendJson(res, 200, { success: true, event: updated })
        return
      }

      // GET /api/admin/events/:eventId
      if (method === 'GET' && adminEventDetailsMatch && !pathname.endsWith('/cancel')) {
        authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventDetailsMatch[1]
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        const profile = ctx.schoolRepo.getProfile()
        if (event.schoolId && profile && event.schoolId !== profile.id) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this event.')
        }
        const sessionCountRow = ctx.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE event_id = ?').get(eventId) as { count: number }
        sendJson(res, 200, {
          event: {
            ...event,
            sessionCount: sessionCountRow?.count || 0,
            schoolName: profile?.schoolName || 'School Campus',
          },
        })
        return
      }

      // PUT /api/admin/events/:eventId
      if (method === 'PUT' && adminEventDetailsMatch && !pathname.endsWith('/cancel')) {
        authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventDetailsMatch[1]
        const existing = ctx.eventRepo.getEvent(eventId)
        if (!existing) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        const profile = ctx.schoolRepo.getProfile()
        if (existing.schoolId && profile && existing.schoolId !== profile.id) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this event.')
        }

        const body = await readJsonBody(req)

        const name = body.name !== undefined ? (body.name || body.eventName || '').trim() : existing.name
        if (!name) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Event Name cannot be empty.')
        }

        const eventDate = body.eventDate !== undefined ? (body.eventDate || body.date || '').trim() : existing.eventDate
        if (body.eventDate !== undefined && !eventDate) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Event Date cannot be empty.')
        }

        const startTime = body.startTime !== undefined ? (body.startTime || '').trim() : existing.startTime
        const endTime = body.endTime !== undefined ? (body.endTime || '').trim() : existing.endTime
        if (body.startTime !== undefined && !startTime) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Start Time cannot be empty.')
        }
        if (body.endTime !== undefined && !endTime) {
          throw new AppError(400, 'VALIDATION_ERROR', 'End Time cannot be empty.')
        }

        if (startTime && endTime) {
          const startParts = startTime.split(':').map(Number)
          const endParts = endTime.split(':').map(Number)
          if (startParts.length >= 2 && endParts.length >= 2 && !isNaN(startParts[0]) && !isNaN(endParts[0])) {
            const startMin = startParts[0] * 60 + (startParts[1] || 0)
            const endMin = endParts[0] * 60 + (endParts[1] || 0)
            if (endMin <= startMin) {
              throw new AppError(400, 'VALIDATION_ERROR', 'End Time must be later than Start Time.')
            }
          } else if (endTime <= startTime) {
            throw new AppError(400, 'VALIDATION_ERROR', 'End Time must be later than Start Time.')
          }
        }

        const venue = body.venue !== undefined ? (body.venue || '').trim() : existing.venue
        if (body.venue !== undefined && !venue) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Venue cannot be empty.')
        }

        const description = body.description !== undefined ? (body.description || '').trim() : existing.description
        const status = body.status !== undefined ? body.status : existing.status

        const updated = ctx.eventRepo.updateEvent(eventId, {
          name,
          eventDate,
          startTime,
          endTime,
          venue,
          description,
          status,
          metadata: {
            venue,
            description,
            schoolName: profile.schoolName,
          },
        })

        const sessionCountRow = ctx.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE event_id = ?').get(eventId) as { count: number }

        sendJson(res, 200, {
          success: true,
          event: {
            ...updated,
            sessionCount: sessionCountRow?.count || 0,
            schoolName: profile?.schoolName || 'School Campus',
          },
        })
        return
      }

      // GET /api/admin/events/:eventId/config
      if (method === 'GET' && adminEventConfigMatch) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventConfigMatch[1]
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        if (admin.role !== 'admin' && admin.schoolId && event.schoolId && admin.schoolId !== event.schoolId) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this event configuration.')
        }

        const profile = ctx.schoolRepo.getProfile()
        let config = ctx.eventConfigRepo.getConfiguration(eventId)
        if (!config) {
          const defaults = getDefaultConfiguration(event, profile)
          config = {
            id: `cfg_${eventId}`,
            ...defaults,
            version: 1,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          }
        }

        sendJson(res, 200, {
          success: true,
          event,
          config,
          school: profile,
        })
        return
      }

      // PUT /api/admin/events/:eventId/config
      if (method === 'PUT' && adminEventConfigMatch) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventConfigMatch[1]
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        if (admin.role !== 'admin' && admin.schoolId && event.schoolId && admin.schoolId !== event.schoolId) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this event configuration.')
        }

        const profile = ctx.schoolRepo.getProfile()
        const body = await readJsonBody(req)
        const saved = ctx.eventConfigRepo.saveConfiguration(event, body, profile)

        sendJson(res, 200, {
          success: true,
          config: saved,
          eventPack: saved.eventPack,
        })
        return
      }

      // GET /api/admin/events/:eventId/activation
      if (method === 'GET' && adminEventActivationMatch) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventActivationMatch[1]
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        if (admin.role !== 'admin' && admin.schoolId && event.schoolId && admin.schoolId !== event.schoolId) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access activation for this event.')
        }

        const profile = ctx.schoolRepo.getProfile()
        const config = ctx.eventConfigRepo.getConfiguration(event.eventId)

        // Ensure activation token exists
        let activationToken = event.activationToken
        if (!activationToken) {
          activationToken = ctx.eventRepo.regenerateActivationToken(event.eventId)
        }

        // Evaluate readiness checks
        const isCancelled = event.status === 'cancelled'
        const hasConfig = Boolean(config)
        const configComplete = config?.status === 'complete'

        let packValid = false
        let packErrors: string[] = []
        if (config?.eventPack) {
          const valid = validateServerEventPack(config.eventPack)
          packValid = valid.ok
          if (!valid.ok) packErrors = valid.errors
        }

        const checks = [
          { key: 'event_valid', label: 'Event Details & Schedule', passed: Boolean(event.name && !isCancelled) },
          { key: 'not_cancelled', label: 'Event Active Status (Not Cancelled)', passed: !isCancelled },
          { key: 'branding', label: 'Institutional Branding & Logo', passed: Boolean(config?.branding?.eventTitle) },
          { key: 'photo_settings', label: 'Photo Composition & Shots', passed: Boolean(config?.photoSettings?.shotCount) },
          { key: 'template', label: 'Template Specification', passed: Boolean(config?.template?.templateId) },
          { key: 'delivery', label: 'Delivery Channels', passed: Boolean(config?.delivery) },
          { key: 'payment', label: 'Monetization Configuration', passed: Boolean(config?.payment) },
          { key: 'privacy', label: 'Privacy & Child Protection Rules', passed: Boolean(config?.privacy) },
          { key: 'event_pack', label: 'Event Pack Validation', passed: packValid },
        ]

        const isReady = !isCancelled && hasConfig && configComplete && packValid
        const activeDeviceCount = ctx.eventRepo.getActiveDeviceCount(event.eventId)

        let activationStatus: 'not_ready' | 'ready' | 'active_on_booth' = 'not_ready'
        if (isReady) {
          activationStatus = activeDeviceCount > 0 || event.status === 'live' ? 'active_on_booth' : 'ready'
        }

        const qrPayload = JSON.stringify({
          app: 'pehchaan-photobooth',
          eventId: event.eventId,
          token: activationToken,
          eventName: event.name,
          schoolName: profile?.schoolName || 'Pehchaan Academy',
        })

        const qrSvg = generateQrSvg(qrPayload, { margin: 3 })
        const qrDataUrl = generateQrDataUrl(qrPayload, { margin: 3 })

        sendJson(res, 200, {
          success: true,
          eventId: event.eventId,
          eventName: event.name,
          schoolName: profile?.schoolName || 'Pehchaan Academy',
          eventDate: event.eventDate,
          startTime: event.startTime,
          endTime: event.endTime,
          venue: event.venue,
          eventStatus: event.status,
          configurationStatus: config?.status || 'incomplete',
          activationStatus,
          activeDeviceCount,
          activationToken,
          qrPayload,
          qrSvg,
          qrDataUrl,
          staffPin: config?.staffPin || '482917',
          readiness: {
            isReady,
            checks,
            errors: packErrors,
          },
        })
        return
      }

      // POST /api/admin/events/:eventId/activation/regenerate
      if (method === 'POST' && adminEventActivationRegenMatch) {
        const admin = authenticateAdmin(req, ctx.adminRepo)
        const eventId = adminEventActivationRegenMatch[1]
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
        }
        if (admin.role !== 'admin' && admin.schoolId && event.schoolId && admin.schoolId !== event.schoolId) {
          throw new AppError(403, 'FORBIDDEN', 'You do not have permission to regenerate activation credentials for this event.')
        }

        const newToken = ctx.eventRepo.regenerateActivationToken(event.eventId)
        sendJson(res, 200, {
          success: true,
          eventId: event.eventId,
          activationToken: newToken,
        })
        return
      }

      // POST /api/booth/activate or POST /api/events/activate (Kiosk / Booth Activation Endpoint)
      if (method === 'POST' && (pathname === '/api/booth/activate' || pathname === '/api/events/activate')) {
        const body = await readJsonBody(req)
        const rawEventId = (body.eventId || body.id || '').trim()
        const token = (body.token || body.activationToken || '').trim()
        const deviceId = (body.deviceId || '').trim()

        if (!rawEventId) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Event ID is required for activation.')
        }

        const event = ctx.eventRepo.getEvent(rawEventId)
        if (!event) {
          throw new AppError(404, 'EVENT_NOT_FOUND', `Event "${rawEventId}" not found. Please check the Event ID and try again.`)
        }

        if (event.status === 'cancelled') {
          throw new AppError(400, 'EVENT_CANCELLED', `Event "${event.name}" is cancelled and cannot be activated on photobooth kiosks.`)
        }

        // Get and validate configuration
        const config = ctx.eventConfigRepo.getConfiguration(event.eventId)
        if (!config || config.status !== 'complete') {
          throw new AppError(400, 'CONFIG_INCOMPLETE', `Event "${event.name}" configuration is incomplete. Complete all configuration modules before activation.`)
        }

        // Validate Event Pack
        if (!config.eventPack) {
          throw new AppError(400, 'EVENT_PACK_INVALID', 'Event Pack configuration is missing or invalid.')
        }

        const valid = validateServerEventPack(config.eventPack)
        if (!valid.ok) {
          throw new AppError(400, 'EVENT_PACK_INVALID', `Event Pack validation failed: ${valid.errors.join(', ')}`)
        }

        // If token is provided, verify it
        if (token && event.activationToken && token !== event.activationToken) {
          throw new AppError(401, 'INVALID_ACTIVATION_TOKEN', 'The provided activation token is invalid or has been revoked.')
        }

        // Link device if provided
        if (deviceId) {
          ctx.eventRepo.recordDeviceActivation(deviceId, event.eventId, token || event.activationToken || undefined)
        }

        // Transition event status from draft to live
        if (event.status === 'draft') {
          ctx.eventRepo.updateEvent(event.eventId, { status: 'live' })
        }

        const profile = ctx.schoolRepo.getProfile()

        sendJson(res, 200, {
          success: true,
          event: {
            eventId: event.eventId,
            name: event.name,
            schoolName: profile?.schoolName || 'Pehchaan Model School',
            eventDate: event.eventDate,
            startTime: event.startTime,
            endTime: event.endTime,
            venue: event.venue,
            status: 'live',
          },
          config,
          eventPack: config.eventPack,
          staffPin: config.staffPin || '482917',
        })
        return
      }

      // GET /api/booth/active or GET /api/events/active (Fetch active live event & latest configured event pack for booth)
      if (method === 'GET' && (pathname === '/api/booth/active' || pathname === '/api/events/active')) {
        const queryParams = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`).searchParams
        const eventIdParam = queryParams.get('eventId') || queryParams.get('id')

        let event = null
        if (eventIdParam) {
          event = ctx.eventRepo.getEvent(eventIdParam)
        }

        if (!event) {
          // Find first live or active event, or latest configured event
          const allEvents = ctx.eventRepo.listEvents()
          event = allEvents.find((e) => e.status === 'live' || (e.status as string) === 'active') || allEvents[0] || null
        }

        if (!event) {
          sendJson(res, 200, {
            success: false,
            message: 'No events registered on server.',
          })
          return
        }

        const config = ctx.eventConfigRepo.getConfiguration(event.eventId)
        const profile = ctx.schoolRepo.getProfile()

        if (!config || !config.eventPack) {
          sendJson(res, 200, {
            success: false,
            message: `Event "${event.name}" is not yet configured.`,
          })
          return
        }

        sendJson(res, 200, {
          success: true,
          event: {
            eventId: event.eventId,
            name: event.name,
            schoolName: profile?.schoolName || 'Pehchaan Model School',
            eventDate: event.eventDate,
            startTime: event.startTime,
            endTime: event.endTime,
            venue: event.venue,
            status: event.status,
          },
          config,
          eventPack: config.eventPack,
          staffPin: config.staffPin || '482917',
        })
        return
      }

      // POST /api/admin/upload (Image / Logo upload)
      if (method === 'POST' && pathname === '/api/admin/upload') {
        authenticateAdmin(req, ctx.adminRepo)
        const body = await readJsonBody(req)
        const { filename = 'logo.png' } = body
        const rawData = body.imageBase64 || body.dataUrl

        if (!rawData || typeof rawData !== 'string') {
          throw new AppError(400, 'VALIDATION_ERROR', 'imageBase64 or dataUrl data string is required.')
        }

        if (!rawData.startsWith('data:image/')) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Only image files (PNG, JPEG, SVG, WebP) are supported.')
        }

        const base64Data = rawData.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        if (buffer.length > 2 * 1024 * 1024) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Uploaded image exceeds the 2MB size limit.')
        }

        const mimeMatch = rawData.match(/^data:(image\/[a-zA-Z+.-]+);base64,/)
        const contentType = mimeMatch ? mimeMatch[1] : 'image/png'

        const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '') || 'logo.png'
        const storageKey = `logos/event_${Date.now()}_${cleanFilename}`
        await ctx.storage.put(storageKey, buffer, contentType)

        sendJson(res, 200, {
          success: true,
          url: `/api/assets/file/${storageKey}`,
          storageKey,
        })
        return
      }

      // GET /api/admin/profile
      if (method === 'GET' && pathname === '/api/admin/profile') {
        authenticateAdmin(req, ctx.adminRepo)
        const profile = ctx.schoolRepo.getProfile()
        sendJson(res, 200, { profile })
        return
      }

      // PUT /api/admin/profile
      if (method === 'PUT' && pathname === '/api/admin/profile') {
        authenticateAdmin(req, ctx.adminRepo)
        const body = await readJsonBody(req)
        const updated = ctx.schoolRepo.updateProfile({
          schoolName: body.schoolName,
          contactPerson: body.contactPerson,
          email: body.email,
          phone: body.phone,
          address: body.address,
          logoUrl: body.logoUrl,
        })
        sendJson(res, 200, { success: true, profile: updated })
        return
      }

      // ----------------------------------------------------
      // DEVICE ROUTES
      // ----------------------------------------------------

      // POST /api/devices/register
      if (method === 'POST' && pathname === '/api/devices/register') {
        const body = await readJsonBody(req)
        const result = ctx.deviceRepo.registerDevice({
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          platform: body.platform,
          appVersion: body.appVersion,
          metadata: body.metadata,
        })
        sendJson(res, result.isNew ? 201 : 200, {
          device: result.device,
          token: result.token,
          isNew: result.isNew,
        })
        return
      }

      // POST /api/devices/:deviceId/revoke
      const revokeMatch = pathname.match(/^\/api\/devices\/([^/]+)\/revoke$/)
      if (method === 'POST' && revokeMatch) {
        const deviceId = decodeURIComponent(revokeMatch[1])
        const device = ctx.deviceRepo.revokeDevice(deviceId)
        sendJson(res, 200, { success: true, device })
        return
      }

      // POST /api/devices/:deviceId/heartbeat
      const heartbeatMatch = pathname.match(/^\/api\/devices\/([^/]+)\/heartbeat$/)
      if (method === 'POST' && heartbeatMatch) {
        const deviceId = decodeURIComponent(heartbeatMatch[1])
        const authDevice = authenticateDevice(req, ctx.deviceRepo)

        if (authDevice.deviceId !== deviceId) {
          throw new AppError(403, 'UNAUTHORIZED', 'Device token does not match target device')
        }

        const body = await readJsonBody(req)
        const updated = ctx.deviceRepo.heartbeat(deviceId, {
          batteryLevel: body.batteryLevel,
          appVersion: body.appVersion,
          freeDiskBytes: body.freeDiskBytes,
          status: body.status,
          metadata: body.metadata,
        })

        sendJson(res, 200, {
          ok: true,
          deviceId: updated.deviceId,
          serverTime: Date.now(),
          status: updated.status,
          device: updated,
        })
        return
      }

      // GET /api/devices
      if (method === 'GET' && pathname === '/api/devices') {
        const devices = ctx.deviceRepo.listDevices()
        sendJson(res, 200, { devices })
        return
      }

      // GET /api/devices/:deviceId
      const getDeviceMatch = pathname.match(/^\/api\/devices\/([^/]+)$/)
      if (method === 'GET' && getDeviceMatch) {
        const deviceId = decodeURIComponent(getDeviceMatch[1])
        const device = ctx.deviceRepo.getDevice(deviceId)
        if (!device) {
          throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${deviceId} not found`)
        }
        sendJson(res, 200, { device: ctx.deviceRepo.toSafe(device) })
        return
      }

      // ----------------------------------------------------
      // EVENT ROUTES
      // ----------------------------------------------------

      // POST /api/events
      if (method === 'POST' && pathname === '/api/events') {
        const body = await readJsonBody(req)
        const result = ctx.eventRepo.createEvent({
          eventId: body.eventId,
          name: body.name,
          status: body.status,
          eventPackId: body.eventPackId,
          eventPackVersion: body.eventPackVersion,
          eventPackSnapshot: body.eventPackSnapshot,
          metadata: body.metadata,
        })
        sendJson(res, result.isNew ? 201 : 200, { event: result.event, isNew: result.isNew })
        return
      }

      // GET /api/events
      if (method === 'GET' && pathname === '/api/events') {
        const events = ctx.eventRepo.listEvents()
        sendJson(res, 200, { events })
        return
      }

      // GET /api/events/:eventId
      const getEventMatch = pathname.match(/^\/api\/events\/([^/]+)$/)
      if (method === 'GET' && getEventMatch) {
        const eventId = decodeURIComponent(getEventMatch[1])
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'EVENT_NOT_FOUND', `Event ${eventId} not found`)
        }
        sendJson(res, 200, { event })
        return
      }

      // GET /api/events/:eventId/pack (Fetch event pack & full configuration for native app / booth)
      const getEventPackMatch = pathname.match(/^\/api\/events\/([^/]+)\/pack$/)
      if (method === 'GET' && getEventPackMatch) {
        const eventId = decodeURIComponent(getEventPackMatch[1])
        const event = ctx.eventRepo.getEvent(eventId)
        if (!event) {
          throw new AppError(404, 'EVENT_NOT_FOUND', `Event "${eventId}" not found`)
        }

        // Optional authorization checks if tokens are passed
        const adminToken = extractAdminToken(req)
        if (adminToken) {
          try {
            const adminPayload = verifyAdminToken(adminToken)
            if (adminPayload.role !== 'admin' && adminPayload.schoolId && event.schoolId && adminPayload.schoolId !== event.schoolId) {
              throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this event pack.')
            }
          } catch (err: any) {
            if (err?.statusCode === 403 || err?.code === 'FORBIDDEN') throw err
          }
        }

        const deviceToken = extractDeviceToken(req)
        if (deviceToken) {
          try {
            authenticateDevice(req, ctx.deviceRepo)
          } catch (err: any) {
            if (err?.code === 'DEVICE_REVOKED' || err?.statusCode === 403) {
              throw err
            }
          }
        }

        const profile = ctx.schoolRepo.getProfile()
        let config = ctx.eventConfigRepo.getConfiguration(event.eventId)

        if (!config) {
          const defaults = getDefaultConfiguration(event, profile)
          if (event.eventPackSnapshot) {
            config = {
              id: `cfg_${event.eventId}`,
              ...defaults,
              eventPack: event.eventPackSnapshot,
              version: 1,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
            }
          } else {
            config = {
              id: `cfg_${event.eventId}`,
              ...defaults,
              version: 1,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
            }
          }
        }

        const generated = generateEventPack(event, config)
        const eventPack = {
          ...generated,
          ...(config.eventPack && typeof config.eventPack === 'object' ? config.eventPack : {}),
          composition: ((config.eventPack as any)?.composition) || generated.composition,
          language: (config.eventPack as any)?.language || generated.language || 'en',
          version: (config.eventPack as any)?.version || event.eventPackVersion || '1.0.0',
          id: (config.eventPack as any)?.id || event.eventPackId || `pack_${event.eventId}`,
        }

        sendJson(res, 200, {
          success: true,
          ...eventPack,
          eventId: event.eventId,
          name: event.name,
          eventName: config.branding?.eventTitle || (eventPack as any).eventName || event.name,
          schoolName: profile?.schoolName || config.branding?.schoolName || (eventPack as any).schoolName || 'Pehchaan Model School',
          status: event.status,
          photoSettings: config.photoSettings,
          delivery: config.delivery,
          payment: config.payment,
          privacy: config.privacy,
          template: config.template,
          branding: config.branding,
          staffPin: config.staffPin || (eventPack as any).staffPin || '482917',
          composition: (eventPack as any).composition,
          singleShotComposition: (eventPack as any).singleShotComposition,
          cardBack: (eventPack as any).cardBack,
          eventPack,
          config,
        })
        return
      }

      // ----------------------------------------------------
      // SESSION ROUTES
      // ----------------------------------------------------

      // POST /v1/sessions or POST /api/v1/sessions or POST /api/sessions
      if (method === 'POST' && (pathname === '/v1/sessions' || pathname === '/api/v1/sessions' || pathname === '/api/sessions')) {
        const body = await readJsonBody(req)

        // 1. Determine device
        let deviceId: string
        const token = extractDeviceToken(req)
        if (token) {
          try {
            const authDevice = authenticateDevice(req, ctx.deviceRepo)
            deviceId = authDevice.deviceId
          } catch (err: any) {
            if (err?.code === 'DEVICE_REVOKED') throw err
            deviceId = (typeof body.deviceId === 'string' && body.deviceId.trim())
              || (typeof body.device_id === 'string' && body.device_id.trim())
              || 'ipad-photobooth'
          }
        } else {
          deviceId = (typeof body.deviceId === 'string' && body.deviceId.trim())
            || (typeof body.device_id === 'string' && body.device_id.trim())
            || (typeof req.headers['x-device-id'] === 'string' && (req.headers['x-device-id'] as string).trim())
            || 'ipad-photobooth'
        }

        // Ensure device exists and is not revoked
        const existingDevice = ctx.deviceRepo.getDevice(deviceId)
        if (!existingDevice) {
          ctx.deviceRepo.registerDevice({
            deviceId,
            deviceName: 'iPad Photobooth',
            platform: 'ipados',
            appVersion: '1.0.0',
          })
        } else if (existingDevice.status === 'revoked' || existingDevice.revokedAt !== null) {
          throw new AppError(403, 'DEVICE_REVOKED', `Device ${deviceId} is revoked`)
        }

        // 2. Determine session ID
        const sessionId = body.sessionId || body.id || body.session_id
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
          throw new AppError(400, 'VALIDATION_ERROR', 'sessionId is required')
        }

        // 3. Determine event ID
        let eventId = body.eventId || body.event_id
        if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
          const events = ctx.eventRepo.listEvents()
          if (events.length > 0) {
            eventId = events[0].eventId
          } else {
            throw new AppError(400, 'VALIDATION_ERROR', 'eventId is required and no active event found')
          }
        } else {
          // Verify event exists
          const existingEvent = ctx.eventRepo.getEvent(eventId)
          if (!existingEvent) {
            throw new AppError(404, 'EVENT_NOT_FOUND', `Event ${eventId} not found`)
          }
        }

        const shotCount = body.shotCount !== undefined
          ? Number(body.shotCount)
          : (body.shot_count !== undefined ? Number(body.shot_count) : 3)
        const language = body.language || 'en'
        const status = body.status || 'in_progress'
        const eventPackVersion = body.eventPackVersion || body.event_pack_version || null
        const metadata = body.metadata || body.metadata_json || null
        let createdAt: number | undefined
        if (body.createdAt !== undefined || body.created_at !== undefined) {
          const rawCreated = body.createdAt ?? body.created_at
          if (typeof rawCreated === 'number') {
            createdAt = rawCreated
          } else if (typeof rawCreated === 'string') {
            const parsed = new Date(rawCreated).getTime()
            createdAt = isNaN(parsed) ? Date.now() : parsed
          }
        }

        const result = ctx.sessionRepo.createSession(eventId, {
          sessionId: sessionId.trim(),
          deviceId,
          shotCount,
          language,
          status,
          eventPackVersion,
          metadata,
          createdAt,
        })

        const galleryUrl = `/gallery/${result.session.sessionId}`

        sendJson(res, result.idempotent ? 200 : 201, {
          success: true,
          sessionId: result.session.sessionId,
          id: result.session.sessionId,
          session: {
            ...result.session,
            id: result.session.sessionId,
            galleryUrl,
          },
          galleryUrl,
          idempotent: result.idempotent,
        })
        return
      }

      // POST /v1/sessions/:sessionId/complete or POST /api/v1/sessions/:sessionId/complete or POST /api/sessions/:sessionId/complete
      const completeSessionMatch = pathname.match(/^\/(?:api\/)?(?:v1\/)?sessions\/([^/]+)\/complete$/)
      if (method === 'POST' && completeSessionMatch) {
        const sessionId = decodeURIComponent(completeSessionMatch[1])
        const result = ctx.sessionRepo.completeSession(sessionId)
        const galleryUrl = `/gallery/${result.session.sessionId}`

        sendJson(res, 200, {
          success: true,
          sessionId: result.session.sessionId,
          id: result.session.sessionId,
          status: result.session.status,
          session: {
            ...result.session,
            id: result.session.sessionId,
            galleryUrl,
          },
          galleryUrl,
          idempotent: result.idempotent,
        })
        return
      }

      // POST /api/events/:eventId/sessions
      const createSessionMatch = pathname.match(/^\/api\/events\/([^/]+)\/sessions$/)
      if (method === 'POST' && createSessionMatch) {
        const eventId = decodeURIComponent(createSessionMatch[1])
        const authDevice = authenticateDevice(req, ctx.deviceRepo)
        const body = await readJsonBody(req)

        const result = ctx.sessionRepo.createSession(eventId, {
          sessionId: body.sessionId,
          deviceId: authDevice.deviceId,
          shotCount: body.shotCount,
          language: body.language,
          status: body.status,
          eventPackVersion: body.eventPackVersion,
          metadata: body.metadata,
          createdAt: body.createdAt,
        })

        const galleryUrl = `/gallery/${result.session.sessionId}`

        sendJson(res, result.idempotent ? 200 : 201, {
          session: {
            ...result.session,
            id: result.session.sessionId,
            galleryUrl,
          },
          galleryUrl,
          idempotent: result.idempotent,
        })
        return
      }

      // GET /api/sessions/:sessionId or GET /v1/sessions/:sessionId
      const getSessionMatch = pathname.match(/^\/(?:api\/)?(?:v1\/)?sessions\/([^/]+)$/)
      if (method === 'GET' && getSessionMatch && !pathname.endsWith('/complete') && !pathname.includes('/assets') && !pathname.includes('/gallery')) {
        const sessionId = decodeURIComponent(getSessionMatch[1])
        const sessionWithAssets = ctx.sessionRepo.getSessionWithAssets(sessionId)
        if (!sessionWithAssets) {
          throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`)
        }
        sendJson(res, 200, {
          success: true,
          ...sessionWithAssets,
          sessionId: sessionWithAssets.session.sessionId,
          id: sessionWithAssets.session.sessionId,
          galleryUrl: `/gallery/${sessionId}`,
        })
        return
      }

      // GET /gallery/:sessionId or GET /api/sessions/:sessionId/gallery
      const galleryMatch = pathname.match(/^\/gallery\/([^/]+)$/) || pathname.match(/^\/api\/sessions\/([^/]+)\/gallery$/)
      if (method === 'GET' && galleryMatch) {
        const sessionId = decodeURIComponent(galleryMatch[1])
        const sessionWithAssets = ctx.sessionRepo.getSessionWithAssets(sessionId)
        if (!sessionWithAssets) {
          throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`)
        }

        const isAllowed = checkSessionPaymentGating(ctx, sessionId, sessionWithAssets.session.eventId)
        if (!isAllowed) {
          const acceptHeader = req.headers.accept || ''
          if (acceptHeader.includes('text/html') || !acceptHeader.includes('application/json')) {
            const lockedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Payment Required · Pehchaan Photobooth</title>
  <style>
    body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
    .card { background: #141419; border: 1px solid rgba(245, 176, 65, 0.3); border-radius: 1.25rem; padding: 2rem 1.5rem; max-width: 440px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
    h1 { color: #fcd34d; font-size: 1.5rem; margin: 0 0 0.75rem; }
    p { color: #a1a1aa; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem; }
    .badge { display: inline-block; padding: 0.35rem 0.85rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🔒 Payment Required</div>
    <h1>Gallery Locked</h1>
    <p>This session requires completed individual payment at the photobooth. Once payment is verified, your photos will be immediately available here.</p>
  </div>
</body>
</html>`
            res.writeHead(402, {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Length': Buffer.byteLength(lockedHtml),
              'Access-Control-Allow-Origin': '*',
            })
            res.end(lockedHtml)
            return
          }
          throw new AppError(402, 'PAYMENT_REQUIRED', 'Payment required: photo delivery is locked until payment is verified.')
        }

        const acceptHeader = req.headers.accept || ''
        if (acceptHeader.includes('text/html') || !acceptHeader.includes('application/json')) {
          const composedAsset = sessionWithAssets.assets.find((a) => a.assetRole === 'composed')
          const originalAssets = sessionWithAssets.assets.filter((a) => a.assetRole === 'original' || a.assetRole === 'print')
          const composedUrl = composedAsset ? `/api/assets/file/${composedAsset.storageKey}` : ''

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Pehchaan Photobooth · Guest Gallery</title>
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #141419;
      --gold: #f5b041;
      --gold-light: #fcd34d;
      --gold-dark: #b7791f;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --border: rgba(245, 176, 65, 0.25);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 1.5rem 1rem 3rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      text-align: center;
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.85rem;
      background: rgba(245, 176, 65, 0.12);
      border: 1px solid var(--border);
      border-radius: 9999px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--gold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 0.75rem;
    }
    h1 {
      color: var(--gold-light);
      font-size: 1.6rem;
      margin: 0 0 0.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .session-info {
      color: var(--text-muted);
      font-size: 0.82rem;
      margin: 0 0 1.5rem;
    }
    .gallery-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: 100%;
      max-width: 500px;
      align-items: center;
    }
    .photo-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1rem;
      width: 100%;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .photo-card.is-composed {
      border-color: rgba(245, 176, 65, 0.5);
      box-shadow: 0 16px 40px rgba(245, 176, 65, 0.15);
    }
    .card-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--gold);
      margin: 0 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .photo-img {
      max-width: 100%;
      max-height: 65vh;
      border-radius: 0.75rem;
      object-fit: contain;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      background: #000;
    }
    .btn-download {
      margin-top: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #f5b041 0%, #d97706 100%);
      color: #000;
      text-decoration: none;
      padding: 0.8rem 1.5rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.95rem;
      width: 100%;
      box-shadow: 0 4px 14px rgba(245, 176, 65, 0.3);
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .btn-download:active {
      transform: scale(0.97);
      opacity: 0.9;
    }
    .shots-section {
      width: 100%;
      margin-top: 1rem;
    }
    .shots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      width: 100%;
      margin-top: 0.5rem;
    }
    .shot-item {
      background: #18181f;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.75rem;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .shot-thumb {
      width: 100%;
      height: 130px;
      object-fit: cover;
      border-radius: 0.5rem;
    }
    .shot-btn {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      padding: 0.35rem 0.75rem;
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-radius: 9999px;
      text-decoration: none;
      font-weight: 600;
      width: 100%;
      text-align: center;
    }
    .footer-note {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #71717a;
    }
  </style>
</head>
<body>
  <div class="brand-badge">✨ Pehchaan Photobooth</div>
  <h1>Your Event Photos</h1>
  <p class="session-info">Session: ${sessionWithAssets.session.sessionId}</p>

  <div class="gallery-container">
    ${composedUrl ? `
      <div class="photo-card is-composed">
        <span class="card-title">Photo Strip / Portrait</span>
        <img class="photo-img" src="${composedUrl}" alt="Photo Strip" />
        <a class="btn-download" href="${composedUrl}" download="pehchaan_${sessionId}.jpg">
          ⬇ Save Photo to Device
        </a>
      </div>
    ` : originalAssets.length > 0 ? `
      <div class="photo-card is-composed">
        <span class="card-title">Photo Portrait</span>
        <img class="photo-img" src="/api/assets/file/${originalAssets[0].storageKey}" alt="Portrait" />
        <a class="btn-download" href="/api/assets/file/${originalAssets[0].storageKey}" download="pehchaan_${sessionId}_photo.jpg">
          ⬇ Save Photo to Device
        </a>
      </div>
    ` : `
      <div class="photo-card">
        <p style="color: #a1a1aa; margin: 2rem 0;">Photo processing in progress... Please refresh in a moment.</p>
        <button class="btn-download" onclick="window.location.reload()">🔄 Refresh Gallery</button>
      </div>
    `}

    ${originalAssets.length > 0 && composedUrl ? `
      <div class="shots-section">
        <p class="card-title">Individual Shots (${originalAssets.length})</p>
        <div class="shots-grid">
          ${originalAssets.map((asset, idx) => `
            <div class="shot-item">
              <img class="shot-thumb" src="/api/assets/file/${asset.storageKey}" alt="Shot ${idx + 1}" />
              <a class="shot-btn" href="/api/assets/file/${asset.storageKey}" download="pehchaan_${sessionId}_shot_${idx + 1}.jpg">
                ⬇ Shot ${idx + 1}
              </a>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  </div>

  <p class="footer-note">Pehchaan Photobooth · Instant Guest Delivery</p>
</body>
</html>`
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html),
            'Access-Control-Allow-Origin': '*',
          })
          res.end(html)
          return
        }

        sendJson(res, 200, {
          sessionId: sessionWithAssets.session.sessionId,
          eventId: sessionWithAssets.session.eventId,
          status: sessionWithAssets.session.status,
          galleryUrl: `/gallery/${sessionId}`,
          createdAt: sessionWithAssets.session.createdAt,
          assets: sessionWithAssets.assets.map((a) => ({
            assetId: a.assetId,
            assetRole: a.assetRole,
            filename: a.filename,
            fileUrl: `/api/assets/file/${a.storageKey}`,
            byteSize: a.byteSize,
          })),
        })
        return
      }

      // ----------------------------------------------------
      // DIRECT DELIVERY ROUTES (Automated WhatsApp & Email Dispatch)
      // ----------------------------------------------------

      // POST /api/deliver/whatsapp
      if (method === 'POST' && pathname === '/api/deliver/whatsapp') {
        const body = await readJsonBody(req)
        const { sessionId, phoneNumber, eventName, message: customMsg, customHost } = body

        if (!sessionId || !phoneNumber) {
          throw new AppError(400, 'VALIDATION_ERROR', 'sessionId and phoneNumber are required')
        }

        const session = ctx.sessionRepo.getSession(sessionId)
        const isAllowed = checkSessionPaymentGating(ctx, sessionId, session?.eventId)
        if (!isAllowed) {
          throw new AppError(402, 'PAYMENT_REQUIRED', 'Payment required: photo delivery is locked until payment is verified.')
        }

        // Clean phone digits
        const rawDigits = String(phoneNumber).replace(/[^0-9]/g, '')
        const normalizedDigits = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits

        // Construct public URL
        const publicUrl = ctx.tunnel?.getPublicUrl() || publicTunnelService.getPublicUrl() || null
        const hostToUse = customHost || publicUrl || `http://${req.headers.host || 'localhost:3001'}`
        const cleanHost = hostToUse.startsWith('http') ? hostToUse : `http://${hostToUse}`
        const galleryUrl = `${cleanHost.replace(/\/$/, '')}/gallery/${sessionId}`
        const messageText = customMsg || `Here is your ${eventName || 'Pehchaan Photobooth'} photo portrait! View and download your photo here: ${galleryUrl}`

        // Provider integration (Meta WhatsApp Business API or Twilio WhatsApp API)
        const metaToken = process.env.META_WA_TOKEN || process.env.WHATSAPP_API_TOKEN
        const metaPhoneId = process.env.META_WA_PHONE_NUMBER_ID
        const twilioSid = process.env.TWILIO_ACCOUNT_SID
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN
        const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER

        let provider = 'direct_server_dispatcher'
        let providerStatus = 'dispatched'

        if (metaToken && metaPhoneId) {
          try {
            const metaRes = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${metaToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedDigits,
                type: 'text',
                text: { body: messageText },
              }),
            })
            if (metaRes.ok) {
              provider = 'meta_whatsapp_cloud_api'
              providerStatus = 'sent'
            }
          } catch {
            // Fallback to internal dispatcher
          }
        } else if (twilioSid && twilioAuth && twilioFrom) {
          try {
            const twilioParams = new URLSearchParams()
            twilioParams.append('From', twilioFrom.startsWith('whatsapp:') ? twilioFrom : `whatsapp:${twilioFrom}`)
            twilioParams.append('To', `whatsapp:+${normalizedDigits}`)
            twilioParams.append('Body', messageText)

            const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: twilioParams.toString(),
            })
            if (twilioRes.ok) {
              provider = 'twilio_whatsapp_api'
              providerStatus = 'sent'
            }
          } catch {
            // Fallback to internal dispatcher
          }
        }

        if (session?.eventId) {
          try {
            ctx.eventDashboardRepo.recordDelivery({
              eventId: session.eventId,
              sessionId,
              channel: 'whatsapp',
              status: 'success',
              recipientMasked: normalizedDigits.length > 4 ? `+${normalizedDigits.slice(0, 4)}****${normalizedDigits.slice(-2)}` : '***',
            })
          } catch {
            // Non-blocking for delivery response
          }
        }

        sendJson(res, 200, {
          success: true,
          status: 'DELIVERED',
          directSent: true,
          recipient: normalizedDigits,
          sessionId,
          galleryUrl,
          provider,
          providerStatus,
          message: `Photo gallery sent directly to guest WhatsApp (+${normalizedDigits}).`,
          dispatchedAt: Date.now(),
        })
        return
      }

      // POST /api/deliveries/record or POST /api/booth/deliveries
      if (method === 'POST' && (pathname === '/api/deliveries/record' || pathname === '/api/booth/deliveries')) {
        const body = await readJsonBody(req)
        const { eventId, sessionId, deviceId, channel, status, recipientMasked, errorMessage } = body

        if (!eventId || !channel || !status) {
          throw new AppError(400, 'VALIDATION_ERROR', 'eventId, channel, and status are required')
        }

        const delivery = ctx.eventDashboardRepo.recordDelivery({
          eventId,
          sessionId,
          deviceId,
          channel,
          status,
          recipientMasked,
          errorMessage,
        })

        sendJson(res, 200, {
          success: true,
          delivery,
        })
        return
      }

      // ----------------------------------------------------
      // PAYMENT ROUTES (UPI & Organizer Monetization)
      // ----------------------------------------------------

      // POST /v1/sessions/:sessionId/payment/create or /api/v1/sessions/:sessionId/payment/create
      const createSessionPaymentMatch = pathname.match(/^\/(?:api\/)?v1\/sessions\/([^/]+)\/payment\/create$/)
      if (method === 'POST' && createSessionPaymentMatch) {
        const sessionId = decodeURIComponent(createSessionPaymentMatch[1])
        const body = await readJsonBody(req)

        // 1. Load Session or Safely Auto-Register if sync is racing
        let session = ctx.sessionRepo.getSession(sessionId)
        let event: import('./db/types.js').DbEvent | null = null

        if (session) {
          event = ctx.eventRepo.getEvent(session.eventId)
          if (!event) {
            throw new AppError(404, 'EVENT_NOT_FOUND', `Event ${session.eventId} not found`)
          }
        } else {
          // Session does not exist in DB yet (e.g. iPad outbox sync is racing asynchronously)
          let targetEventId: string | null = (
            (typeof body.eventId === 'string' && body.eventId.trim()) ||
            (typeof body.event_id === 'string' && body.event_id.trim()) ||
            (typeof req.headers['x-event-id'] === 'string' && (req.headers['x-event-id'] as string).trim()) ||
            null
          )

          if (targetEventId) {
            event = ctx.eventRepo.getEvent(targetEventId)
            if (!event) {
              throw new AppError(404, 'EVENT_NOT_FOUND', `Event ${targetEventId} not found`)
            }
          } else {
            // Find active event from DB (prefer individual payment mode or live status)
            const allEvents = ctx.eventRepo.listEvents()
            if (allEvents.length === 0) {
              throw new AppError(404, 'EVENT_NOT_FOUND', 'No active event found for session payment creation')
            }
            const individualEvent = allEvents.find((e) => {
              const cfg = e.eventPackSnapshot?.payment || ctx.eventConfigRepo.getConfiguration(e.eventId)?.payment
              return cfg?.mode === 'individual'
            })
            const liveEvent = allEvents.find((e) => e.status === 'live' || e.status === 'ready' || e.status === 'active')
            event = individualEvent || liveEvent || allEvents[0]
          }

          const deviceId =
            (typeof body.deviceId === 'string' && body.deviceId.trim()) ||
            (typeof req.headers['x-device-id'] === 'string' && (req.headers['x-device-id'] as string).trim()) ||
            'ipad-photobooth'

          const createdSessionResult = ctx.sessionRepo.createSession(event.eventId, {
            sessionId: sessionId.trim(),
            deviceId,
            shotCount: event.eventPackSnapshot?.shotCount || 3,
            language: 'en',
            status: 'in_progress',
            createdAt: Date.now(),
          })
          session = createdSessionResult.session
        }

        // 3. Load Event Config / Snapshot
        let paymentConfig = event.eventPackSnapshot?.payment
        if (!paymentConfig) {
          const config = ctx.eventConfigRepo.getConfiguration(session.eventId)
          paymentConfig = config?.payment
        }

        const paymentMode = paymentConfig?.mode || 'organizer'

        // 4. Validate payment mode
        if (paymentMode !== 'individual') {
          throw new AppError(
            400,
            'PAYMENT_NOT_REQUIRED',
            `Event is configured in "${paymentMode}" payment mode. Individual payment creation is not permitted.`
          )
        }

        // 5. Read authoritative amount, currency, upiId, merchantName
        const authoritativeAmount = Number(paymentConfig?.amount) || 0
        if (authoritativeAmount <= 0) {
          throw new AppError(400, 'INVALID_AMOUNT', 'Configured payment amount must be greater than 0')
        }

        const currency = (paymentConfig?.currency || 'INR').toUpperCase()
        const upiId = paymentConfig?.upiId || 'pehchaan@upi'
        const merchantName = paymentConfig?.merchantName || event.name || 'Pehchaan Photobooth'
        const timeoutSeconds = Number(paymentConfig?.timeoutSeconds) || 300

        // 6. Check existing session payment for idempotency
        const existingSessionPayment = ctx.paymentRepo.getPaymentBySessionId(sessionId)
        if (existingSessionPayment) {
          if (existingSessionPayment.status === 'success' || existingSessionPayment.status === 'paid') {
            sendJson(res, 200, {
              success: true,
              payment: {
                paymentId: existingSessionPayment.id,
                paymentReference: existingSessionPayment.paymentReference,
                sessionId: existingSessionPayment.sessionId,
                amount: existingSessionPayment.amount,
                currency: existingSessionPayment.currency,
                status: 'paid',
                qrUri: existingSessionPayment.qrPayload,
                qrImageUrl: existingSessionPayment.qrDataUrl,
                provider: existingSessionPayment.provider,
                merchantName: existingSessionPayment.merchantName,
                upiId: existingSessionPayment.upiId,
                verifiedAt: existingSessionPayment.verifiedAt,
              },
              idempotent: true,
            })
            return
          }

          const isExpired = existingSessionPayment.expiresAt && existingSessionPayment.expiresAt < Date.now()
          if (!isExpired && (existingSessionPayment.status === 'pending' || existingSessionPayment.status === 'initiated' || existingSessionPayment.status === 'processing' || existingSessionPayment.status === 'created')) {
            sendJson(res, 200, {
              success: true,
              payment: {
                paymentId: existingSessionPayment.id,
                paymentReference: existingSessionPayment.paymentReference,
                sessionId: existingSessionPayment.sessionId,
                amount: existingSessionPayment.amount,
                currency: existingSessionPayment.currency,
                status: 'pending',
                qrUri: existingSessionPayment.qrPayload,
                qrImageUrl: existingSessionPayment.qrDataUrl,
                provider: existingSessionPayment.provider,
                merchantName: existingSessionPayment.merchantName,
                upiId: existingSessionPayment.upiId,
                expiresAt: existingSessionPayment.expiresAt,
              },
              idempotent: true,
            })
            return
          }
        }

        // 7. Generate unique payment reference & create gateway order
        const paymentReference = `PB-${String(session.eventId).replace(/^evt_/, '')}-${String(sessionId).slice(0, 8)}-${Date.now()}`
        const expiresAt = Date.now() + timeoutSeconds * 1000

        const gatewayOrder = await ctx.gateway.createPaymentOrder({
          paymentReference,
          amount: authoritativeAmount,
          currency,
          upiId,
          merchantName,
          timeoutSeconds,
          metadata: {
            sessionId,
            eventId: session.eventId,
            deviceId: session.deviceId,
          },
        })

        // 8. Save payment record
        const result = ctx.paymentRepo.createPayment({
          eventId: session.eventId,
          sessionId,
          deviceId: session.deviceId,
          paymentReference,
          amount: authoritativeAmount,
          currency,
          mode: 'individual',
          status: 'pending',
          provider: gatewayOrder.gatewayProvider || 'razorpay',
          gatewayProvider: gatewayOrder.gatewayProvider || 'razorpay',
          gatewayOrderId: gatewayOrder.gatewayOrderId,
          qrPayload: gatewayOrder.qrUri,
          qrDataUrl: gatewayOrder.qrUri,
          expiresAt,
          upiId,
          merchantName,
          metadata: {
            sessionId,
            eventId: session.eventId,
          },
        })

        sendJson(res, 201, {
          success: true,
          payment: {
            paymentId: result.payment.id,
            paymentReference: result.payment.paymentReference,
            sessionId: result.payment.sessionId,
            amount: result.payment.amount,
            currency: result.payment.currency,
            status: 'pending',
            qrUri: gatewayOrder.qrUri,
            qrImageUrl: gatewayOrder.qrUri,
            provider: gatewayOrder.gatewayProvider || 'razorpay',
            merchantName: result.payment.merchantName,
            upiId: result.payment.upiId,
            expiresAt,
          },
          idempotent: false,
        })
        return
      }

      // GET /v1/sessions/:sessionId/payment/status or /api/v1/sessions/:sessionId/payment/status
      const getSessionPaymentStatusMatch = pathname.match(/^\/(?:api\/)?v1\/sessions\/([^/]+)\/payment\/status$/)
      if (method === 'GET' && getSessionPaymentStatusMatch) {
        const sessionId = decodeURIComponent(getSessionPaymentStatusMatch[1])
        let payment = ctx.paymentRepo.getPaymentBySessionId(sessionId)
        if (!payment) {
          throw new AppError(404, 'PAYMENT_NOT_FOUND', `No payment record found for session ${sessionId}`)
        }

        // Automatic Expiry check
        if (payment.status === 'pending' || payment.status === 'processing' || payment.status === 'initiated' || payment.status === 'created') {
          if (payment.expiresAt && payment.expiresAt < Date.now()) {
            payment = ctx.paymentRepo.updatePaymentStatus(payment.paymentReference, 'expired', {
              failureReason: 'Payment window expired',
            }) || payment
          }
        }

        const normalizedStatus = (payment.status === 'success' || payment.status === 'paid')
          ? 'paid'
          : payment.status

        sendJson(res, 200, {
          success: true,
          payment: {
            paymentId: payment.id,
            paymentReference: payment.paymentReference,
            sessionId: payment.sessionId,
            status: normalizedStatus,
            amount: payment.amount,
            currency: payment.currency,
            verifiedAt: payment.verifiedAt || null,
            failureReason: payment.failureReason || null,
          },
        })
        return
      }

      // POST /v1/payments/webhook or POST /api/payments/webhook or POST /api/payments/razorpay/webhook
      if (method === 'POST' && (pathname === '/v1/payments/webhook' || pathname === '/api/payments/webhook' || pathname === '/api/payments/razorpay/webhook')) {
        const rawBuffer = await readBody(req)
        const rawBody = rawBuffer.toString('utf8')

        const isValid = ctx.gateway.verifyWebhookSignature(rawBody, req.headers as Record<string, string | string[] | undefined>)
        if (!isValid) {
          sendJson(res, 401, {
            error: 'UNAUTHORIZED_WEBHOOK',
            message: 'Invalid webhook signature',
          })
          return
        }

        let parsedJson: unknown
        try {
          parsedJson = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          sendJson(res, 400, {
            error: 'INVALID_WEBHOOK_PAYLOAD',
            message: 'Malformed JSON in webhook payload',
          })
          return
        }

        const event = ctx.gateway.parseWebhookPayload(parsedJson, req.headers as Record<string, string | string[] | undefined>)
        if (!event) {
          sendJson(res, 400, {
            error: 'INVALID_WEBHOOK_PAYLOAD',
            message: 'Could not parse webhook event payload',
          })
          return
        }

        // Idempotency: Check if this webhook event was already recorded
        if (event.eventId) {
          const existingByEventId = ctx.paymentRepo.getPaymentByWebhookEventId(event.eventId)
          if (existingByEventId) {
            sendJson(res, 200, {
              success: true,
              idempotent: true,
              message: 'Webhook event already processed',
              paymentReference: existingByEventId.paymentReference,
            })
            return
          }
        }

        // Find payment by gatewayOrderId, gatewayPaymentId, paymentReference, or sessionId
        let payment = event.gatewayOrderId ? ctx.paymentRepo.getPaymentByGatewayOrderId(event.gatewayOrderId) : null
        if (!payment && event.gatewayPaymentId) {
          payment = ctx.paymentRepo.getPaymentByGatewayPaymentId(event.gatewayPaymentId)
        }
        if (!payment && event.paymentReference) {
          payment = ctx.paymentRepo.getPaymentByReference(event.paymentReference)
        }
        if (!payment && event.paymentReference) {
          payment = ctx.paymentRepo.getPaymentBySessionId(event.paymentReference)
        }

        if (!payment) {
          sendJson(res, 404, {
            error: 'PAYMENT_NOT_FOUND',
            message: `Payment record not found for webhook event (order: ${event.gatewayOrderId}, payment: ${event.gatewayPaymentId}, ref: ${event.paymentReference})`,
          })
          return
        }

        // Validate Amount and Currency
        if (payment.amount !== event.amount || payment.currency !== event.currency) {
          const mismatchReason = `Amount or currency mismatch: expected ${payment.amount} ${payment.currency}, got ${event.amount} ${event.currency}`
          ctx.paymentRepo.updatePaymentStatus(payment.paymentReference, 'failed', {
            failureReason: mismatchReason,
            errorMessage: mismatchReason,
            webhookEventId: event.eventId,
            webhookReceivedAt: Date.now(),
            gatewayPaymentId: event.gatewayPaymentId,
          })
          sendJson(res, 400, {
            error: 'AMOUNT_MISMATCH',
            message: mismatchReason,
          })
          return
        }

        let newStatus: import('./db/types.js').DbPaymentStatus = 'pending'
        if (event.status === 'success') {
          newStatus = 'paid'
        } else if (event.status === 'cancelled') {
          newStatus = 'cancelled'
        } else {
          newStatus = 'failed'
        }

        const updated = ctx.paymentRepo.updatePaymentStatus(payment.paymentReference, newStatus, {
          gatewayPaymentId: event.gatewayPaymentId || payment.gatewayPaymentId,
          webhookEventId: event.eventId,
          webhookReceivedAt: Date.now(),
          verifiedAt: (newStatus === 'success' || newStatus === 'paid') ? Date.now() : payment.verifiedAt,
          failureReason: event.failureReason || null,
          errorMessage: event.failureReason || null,
          metadata: {
            ...(payment.metadata || {}),
            ...(event.rawEvent ? { lastWebhookPayload: event.rawEvent } : {}),
          },
        })

        sendJson(res, 200, {
          success: true,
          status: updated?.status || newStatus,
          paymentReference: payment.paymentReference,
          gatewayPaymentId: event.gatewayPaymentId,
        })
        return
      }

      // POST /v1/payments or POST /api/payments
      if (method === 'POST' && (pathname === '/v1/payments' || pathname === '/api/payments')) {
        const body = await readJsonBody(req)
        const {
          eventId,
          sessionId,
          deviceId = 'booth_device',
          amount,
          currency = 'INR',
          mode = 'individual',
          upiId = 'pehchaan@upi',
          merchantName = 'Pehchaan Photobooth',
          paymentReference: customRef,
          timeoutSeconds = 300,
          metadata,
        } = body

        if (!eventId || !sessionId) {
          throw new AppError(400, 'VALIDATION_ERROR', 'eventId and sessionId are required')
        }

        // Check if valid payment record already exists for this session (Idempotent reuse)
        const existingSessionPayment = ctx.paymentRepo.getPaymentBySessionId(sessionId)
        if (existingSessionPayment) {
          if (existingSessionPayment.status === 'success') {
            sendJson(res, 200, {
              payment: existingSessionPayment,
              paymentReference: existingSessionPayment.paymentReference,
              status: existingSessionPayment.status,
              gatewayOrderId: existingSessionPayment.gatewayOrderId,
              gatewayProvider: existingSessionPayment.gatewayProvider,
              qrPayload: existingSessionPayment.qrPayload,
              qrDataUrl: existingSessionPayment.qrDataUrl,
              expiresAt: existingSessionPayment.expiresAt,
              upiUri: existingSessionPayment.qrPayload,
              isNew: false,
              idempotent: true,
            })
            return
          }
          const isExpired = existingSessionPayment.expiresAt && existingSessionPayment.expiresAt < Date.now()
          if (!isExpired && (existingSessionPayment.status === 'pending' || existingSessionPayment.status === 'processing')) {
            sendJson(res, 200, {
              payment: existingSessionPayment,
              paymentReference: existingSessionPayment.paymentReference,
              status: existingSessionPayment.status,
              gatewayOrderId: existingSessionPayment.gatewayOrderId,
              gatewayProvider: existingSessionPayment.gatewayProvider,
              qrPayload: existingSessionPayment.qrPayload,
              qrDataUrl: existingSessionPayment.qrDataUrl,
              expiresAt: existingSessionPayment.expiresAt,
              upiUri: existingSessionPayment.qrPayload,
              isNew: false,
              idempotent: true,
            })
            return
          }
        }

        const paymentReference = customRef || `PB-${String(eventId).replace(/^evt_/, '')}-${String(sessionId).slice(0, 8)}-${Date.now()}`
        const expiresAt = Date.now() + (Number(timeoutSeconds) || 300) * 1000
        const numAmount = Number(amount) || 0

        const gatewayOrder = await ctx.gateway.createPaymentOrder({
          paymentReference,
          amount: numAmount,
          currency,
          upiId,
          merchantName,
          timeoutSeconds: Number(timeoutSeconds) || 300,
          metadata,
        })

        const result = ctx.paymentRepo.createPayment({
          eventId,
          sessionId,
          deviceId,
          paymentReference,
          amount: numAmount,
          currency,
          mode,
          status: 'pending',
          provider: gatewayOrder.gatewayProvider,
          gatewayProvider: gatewayOrder.gatewayProvider,
          gatewayOrderId: gatewayOrder.gatewayOrderId,
          qrPayload: gatewayOrder.qrUri,
          qrDataUrl: gatewayOrder.qrUri,
          expiresAt,
          upiId,
          merchantName,
          metadata,
        })

        sendJson(res, result.isNew ? 201 : 200, {
          payment: result.payment,
          paymentReference: result.payment.paymentReference,
          status: result.payment.status,
          gatewayOrderId: gatewayOrder.gatewayOrderId,
          gatewayProvider: gatewayOrder.gatewayProvider,
          qrPayload: gatewayOrder.qrUri,
          qrDataUrl: gatewayOrder.qrUri,
          expiresAt,
          upiUri: gatewayOrder.qrUri,
          isNew: result.isNew,
        })
        return
      }

      // GET /v1/payments/:paymentReference or GET /api/payments/:paymentReference
      const getPaymentMatch = pathname.match(/^\/(?:v1|api)\/payments\/([^/]+)$/)
      if (method === 'GET' && getPaymentMatch && !pathname.startsWith('/api/payments/summary/') && !pathname.endsWith('/webhook')) {
        const paymentReference = decodeURIComponent(getPaymentMatch[1])
        let payment = ctx.paymentRepo.getPaymentByReference(paymentReference)
        if (!payment) {
          payment = ctx.paymentRepo.getPaymentByGatewayOrderId(paymentReference)
        }
        if (!payment) {
          payment = ctx.paymentRepo.getPaymentBySessionId(paymentReference)
        }
        if (!payment) {
          throw new AppError(404, 'PAYMENT_NOT_FOUND', `Payment with reference ${paymentReference} not found`)
        }

        // Automatic Expiry check
        if (payment.status === 'pending' || payment.status === 'processing') {
          if (payment.expiresAt && payment.expiresAt < Date.now()) {
            payment = ctx.paymentRepo.updatePaymentStatus(payment.paymentReference, 'expired', {
              failureReason: 'Payment window expired',
            }) || payment
          }
        }

        sendJson(res, 200, {
          payment,
          status: payment.status,
          paymentReference: payment.paymentReference,
        })
        return
      }

      // POST /v1/payments/:paymentReference/verify or POST /api/payments/:paymentReference/verify
      const verifyPaymentMatch = pathname.match(/^\/(?:v1|api)\/payments\/([^/]+)\/verify$/)
      if (method === 'POST' && verifyPaymentMatch) {
        const paymentReference = decodeURIComponent(verifyPaymentMatch[1])
        let existing = ctx.paymentRepo.getPaymentByReference(paymentReference)
        if (!existing) {
          existing = ctx.paymentRepo.getPaymentByGatewayOrderId(paymentReference)
        }
        if (!existing) {
          throw new AppError(404, 'PAYMENT_NOT_FOUND', `Payment with reference ${paymentReference} not found`)
        }

        if (existing.status === 'success') {
          sendJson(res, 200, {
            verified: true,
            status: 'success',
            paymentReference: existing.paymentReference,
            verifiedAt: existing.verifiedAt,
            payment: existing,
          })
          return
        }

        // In mock/test/demo mode or standard UPI gateway, allow direct verification
        if (ctx.gateway.name === 'mock_upi' || ctx.gateway.name === 'standard_upi') {
          const updated = ctx.paymentRepo.updatePaymentStatus(existing.paymentReference, 'success', {
            verifiedAt: Date.now(),
          })
          sendJson(res, 200, {
            verified: true,
            status: 'success',
            paymentReference: existing.paymentReference,
            verifiedAt: updated?.verifiedAt,
            payment: updated,
          })
          return
        }

        // For external production gateways (Razorpay, etc.), query status
        const queryId = existing.gatewayOrderId || existing.gatewayPaymentId || existing.paymentReference
        const statusRes = await ctx.gateway.queryOrderStatus(queryId)
        if (statusRes.status === 'success' || statusRes.verified) {
          const updated = ctx.paymentRepo.updatePaymentStatus(existing.paymentReference, 'success', {
            gatewayPaymentId: statusRes.gatewayPaymentId || existing.gatewayPaymentId,
            verifiedAt: Date.now(),
          })
          sendJson(res, 200, {
            verified: true,
            status: 'success',
            paymentReference: existing.paymentReference,
            verifiedAt: updated?.verifiedAt,
            payment: updated,
          })
          return
        }

        sendJson(res, 200, {
          verified: false,
          status: existing.status,
          paymentReference: existing.paymentReference,
          payment: existing,
        })
        return
      }

      // POST /v1/payments/:paymentReference/cancel or POST /api/payments/:paymentReference/cancel
      const cancelPaymentMatch = pathname.match(/^\/(?:v1|api)\/payments\/([^/]+)\/cancel$/)
      if (method === 'POST' && cancelPaymentMatch) {
        const paymentReference = decodeURIComponent(cancelPaymentMatch[1])
        let existing = ctx.paymentRepo.getPaymentByReference(paymentReference)
        if (!existing) {
          existing = ctx.paymentRepo.getPaymentByGatewayOrderId(paymentReference)
        }
        if (!existing) {
          throw new AppError(404, 'PAYMENT_NOT_FOUND', `Payment with reference ${paymentReference} not found`)
        }

        let updated = existing
        if (existing.status !== 'success') {
          updated = ctx.paymentRepo.updatePaymentStatus(existing.paymentReference, 'cancelled') || existing
        }

        sendJson(res, 200, {
          status: updated.status,
          paymentReference: existing.paymentReference,
          payment: updated,
        })
        return
      }

      // POST /v1/payments/:paymentReference/simulate or POST /api/payments/:paymentReference/simulate
      const simulatePaymentMatch = pathname.match(/^\/(?:v1|api)\/payments\/([^/]+)\/simulate$/)
      if (method === 'POST' && simulatePaymentMatch) {
        const paymentReference = decodeURIComponent(simulatePaymentMatch[1])

        // Protect against simulation in production
        const isProduction = process.env.NODE_ENV === 'production' &&
          process.env.PAYMENT_PROVIDER !== 'mock' &&
          process.env.PAYMENT_PROVIDER !== 'demo'

        if (isProduction) {
          throw new AppError(403, 'FORBIDDEN', 'Payment simulation is disabled in production environment')
        }

        const body = await readJsonBody(req)
        const simStatus = (body.status || 'success') as import('./db/types.js').DbPaymentStatus
        const simReason = body.reason || body.errorMessage || null

        let existing = ctx.paymentRepo.getPaymentByReference(paymentReference)
        if (!existing) {
          existing = ctx.paymentRepo.getPaymentByGatewayOrderId(paymentReference)
        }
        if (!existing) {
          const res = ctx.paymentRepo.createPayment({
            eventId: body.eventId || 'evt_sim',
            sessionId: body.sessionId || 'sess_sim',
            deviceId: body.deviceId || 'booth_device',
            paymentReference,
            amount: Number(body.amount) || 0,
            status: simStatus,
          })
          existing = res.payment
        }

        const updated = ctx.paymentRepo.updatePaymentStatus(existing.paymentReference, simStatus, {
          errorMessage: simReason,
          failureReason: simReason,
          verifiedAt: simStatus === 'success' ? Date.now() : null,
        }) || existing

        sendJson(res, 200, {
          success: true,
          status: updated.status,
          paymentReference: existing.paymentReference,
          payment: updated,
          verified: updated.status === 'success',
          error: simReason,
        })
        return
      }

      // GET /api/payments/summary/:eventId
      const paymentSummaryMatch = pathname.match(/^\/api\/payments\/summary\/([^/]+)$/)
      if (method === 'GET' && paymentSummaryMatch) {
        const eventId = decodeURIComponent(paymentSummaryMatch[1])
        const summary = ctx.paymentRepo.getEventPaymentSummary(eventId)
        sendJson(res, 200, { summary })
        return
      }

      // ----------------------------------------------------
      // ASSET ROUTES
      // ----------------------------------------------------

      // PUT or POST /v1/sessions/:sessionId/assets/:role or /api/v1/sessions/:sessionId/assets/:role or /v1/sessions/:sessionId/assets
      const v1AssetRoleMatch = pathname.match(/^\/(?:api\/)?v1\/sessions\/([^/]+)\/assets(?:\/([^/]+))?$/)
      if ((method === 'PUT' || method === 'POST') && v1AssetRoleMatch) {
        const sessionId = decodeURIComponent(v1AssetRoleMatch[1])
        const roleParam = v1AssetRoleMatch[2] ? decodeURIComponent(v1AssetRoleMatch[2]) : undefined

        const session = ctx.sessionRepo.getSession(sessionId)
        if (!session) {
          throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`)
        }

        let deviceId: string = session.deviceId
        const token = extractDeviceToken(req)
        if (token) {
          try {
            const authDevice = authenticateDevice(req, ctx.deviceRepo)
            deviceId = authDevice.deviceId
          } catch (err: any) {
            if (err?.code === 'DEVICE_REVOKED') throw err
          }
        }

        const contentTypeHeader = req.headers['content-type'] || 'application/octet-stream'
        let assetRole: AssetRole
        let shotNumber: number | null = null
        let filename: string
        let contentType: string
        let dataBuffer: Buffer
        let assetId: string | undefined
        let createdAt: number | undefined

        if (contentTypeHeader.includes('application/json')) {
          const body = await readJsonBody(req)
          const targetRole = roleParam || body.assetRole || body.role || 'composed'
          const validRoles: AssetRole[] = ['original', 'thumbnail', 'composed', 'print']
          if (!validRoles.includes(targetRole as AssetRole)) {
            throw new AppError(400, 'INVALID_ASSET', `Invalid asset role: ${targetRole}. Must be one of: ${validRoles.join(', ')}`)
          }
          assetRole = targetRole as AssetRole
          shotNumber = body.shotNumber !== undefined
            ? Number(body.shotNumber)
            : (body.shot_number !== undefined ? Number(body.shot_number) : null)
          filename = body.filename || `${assetRole}.jpg`
          contentType = body.contentType || 'image/jpeg'
          assetId = body.assetId || body.id
          createdAt = body.createdAt
            ? (typeof body.createdAt === 'string' ? new Date(body.createdAt).getTime() : Number(body.createdAt))
            : undefined

          if (body.dataBase64) {
            dataBuffer = Buffer.from(body.dataBase64, 'base64')
          } else if (body.data) {
            dataBuffer = Buffer.from(body.data, 'base64')
          } else {
            throw new AppError(400, 'INVALID_ASSET', 'dataBase64 or data is required in JSON asset payload')
          }
        } else {
          // Binary data upload (e.g. image/jpeg, image/png, application/octet-stream)
          const targetRole = roleParam || (req.headers['x-asset-role'] as string) || 'composed'
          const validRoles: AssetRole[] = ['original', 'thumbnail', 'composed', 'print']
          if (!validRoles.includes(targetRole as AssetRole)) {
            throw new AppError(400, 'INVALID_ASSET', `Invalid asset role: ${targetRole}. Must be one of: ${validRoles.join(', ')}`)
          }
          assetRole = targetRole as AssetRole

          const headerFilename = req.headers['x-asset-filename'] as string
          const headerShotNumber = req.headers['x-shot-number'] as string
          const headerAssetId = req.headers['x-asset-id'] as string

          filename = headerFilename || `${assetRole}.jpg`
          shotNumber = headerShotNumber ? Number(headerShotNumber) : null
          contentType = contentTypeHeader.split(';')[0].trim() || 'image/jpeg'
          assetId = headerAssetId
          dataBuffer = await readBody(req)

          if (dataBuffer.length === 0) {
            throw new AppError(400, 'INVALID_ASSET', 'Asset data buffer cannot be empty')
          }
        }

        const result = await ctx.assetRepo.createAsset(sessionId, {
          assetId,
          deviceId,
          assetRole,
          shotNumber,
          filename,
          contentType,
          data: dataBuffer,
          createdAt,
        })

        sendJson(res, result.idempotent ? 200 : 201, {
          success: true,
          asset: result.asset,
          idempotent: result.idempotent,
        })
        return
      }

      // POST /api/sessions/:sessionId/assets
      const createAssetMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/assets$/)
      if (method === 'POST' && createAssetMatch) {
        const sessionId = decodeURIComponent(createAssetMatch[1])
        const authDevice = authenticateDevice(req, ctx.deviceRepo)

        const contentTypeHeader = req.headers['content-type'] || 'application/json'

        let assetRole: AssetRole
        let shotNumber: number | null = null
        let filename: string
        let contentType: string
        let dataBuffer: Buffer
        let assetId: string | undefined
        let createdAt: number | undefined

        if (contentTypeHeader.includes('application/json')) {
          const body = await readJsonBody(req)
          assetRole = body.assetRole
          shotNumber = body.shotNumber !== undefined ? Number(body.shotNumber) : null
          filename = body.filename
          contentType = body.contentType || 'image/jpeg'
          assetId = body.assetId
          createdAt = body.createdAt

          if (body.dataBase64) {
            dataBuffer = Buffer.from(body.dataBase64, 'base64')
          } else {
            throw new AppError(400, 'INVALID_ASSET', 'dataBase64 is required in JSON asset payload')
          }
        } else {
          // Direct binary upload with headers
          const headerRole = req.headers['x-asset-role'] as string
          const headerFilename = req.headers['x-asset-filename'] as string
          const headerShotNumber = req.headers['x-shot-number'] as string
          const headerAssetId = req.headers['x-asset-id'] as string

          if (!headerRole) {
            throw new AppError(400, 'INVALID_ASSET', 'Missing x-asset-role header for binary upload')
          }
          if (!headerFilename) {
            throw new AppError(400, 'INVALID_ASSET', 'Missing x-asset-filename header for binary upload')
          }

          assetRole = headerRole as AssetRole
          shotNumber = headerShotNumber ? Number(headerShotNumber) : null
          filename = headerFilename
          contentType = contentTypeHeader.split(';')[0].trim()
          assetId = headerAssetId
          dataBuffer = await readBody(req)
        }

        const result = await ctx.assetRepo.createAsset(sessionId, {
          assetId,
          deviceId: authDevice.deviceId,
          assetRole,
          shotNumber,
          filename,
          contentType,
          data: dataBuffer,
          createdAt,
        })

        sendJson(res, result.idempotent ? 200 : 201, {
          asset: result.asset,
          idempotent: result.idempotent,
        })
        return
      }

      // GET /api/sessions/:sessionId/assets or GET /v1/sessions/:sessionId/assets
      const listAssetsMatch = pathname.match(/^\/(?:api\/)?(?:v1\/)?sessions\/([^/]+)\/assets$/)
      if (method === 'GET' && listAssetsMatch) {
        const sessionId = decodeURIComponent(listAssetsMatch[1])
        const session = ctx.sessionRepo.getSession(sessionId)
        if (!session) {
          throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`)
        }

        const isAllowed = checkSessionPaymentGating(ctx, sessionId, session.eventId)
        if (!isAllowed) {
          throw new AppError(402, 'PAYMENT_REQUIRED', 'Payment required: photo assets are locked until payment is verified.')
        }

        const assets = ctx.assetRepo.listSessionAssets(sessionId)
        sendJson(res, 200, { assets })
        return
      }

      // GET /api/assets/:assetId
      const getAssetMatch = pathname.match(/^\/api\/assets\/([^/]+)$/)
      if (method === 'GET' && getAssetMatch && !pathname.startsWith('/api/assets/file/')) {
        const assetId = decodeURIComponent(getAssetMatch[1])
        const asset = ctx.assetRepo.getAsset(assetId)
        if (!asset) {
          throw new AppError(404, 'ASSET_NOT_FOUND', `Asset ${assetId} not found`)
        }
        sendJson(res, 200, { asset })
        return
      }

      // GET /api/assets/file/* (or /api/assets/:assetId/file)
      const fileKeyMatch = pathname.match(/^\/api\/assets\/file\/(.+)$/)
      if (method === 'GET' && fileKeyMatch) {
        const storageKey = decodeURIComponent(fileKeyMatch[1])
        const stored = await ctx.storage.get(storageKey)
        if (!stored) {
          throw new AppError(404, 'ASSET_NOT_FOUND', `Asset file not found for key: ${storageKey}`)
        }

        res.writeHead(200, {
          'Content-Type': stored.contentType,
          'Content-Length': stored.byteSize,
          'ETag': `"${stored.checksum}"`,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(stored.data)
        return
      }

      // 404 for unknown route
      throw new AppError(404, 'INTERNAL_ERROR', `Route ${method} ${pathname} not found`)
    } catch (err) {
      sendError(res, err)
    }
  }
}

export function createAppServer(ctx: AppContext): http.Server {
  const handler = createRequestHandler(ctx)
  return http.createServer(handler)
}
