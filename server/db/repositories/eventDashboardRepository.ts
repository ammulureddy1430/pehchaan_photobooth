import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type {
  DbDeliveryRecord,
  DbDeliveryChannel,
  DbDeliveryStatus,
  EventActivityRecord,
  ActivityType,
} from '../types.js'
import { AppError } from '../../errors/AppError.js'
import type { EventConfigurationRepository } from './eventConfigurationRepository.js'
import type { EventRepository } from './eventRepository.js'
import type { SchoolRepository } from './schoolRepository.js'

export interface RecordDeliveryParams {
  id?: string
  eventId: string
  sessionId?: string | null
  deviceId?: string | null
  channel: DbDeliveryChannel
  status: DbDeliveryStatus
  recipientMasked?: string | null
  errorMessage?: string | null
  createdAt?: number
}

export interface RecordActivityParams {
  id?: string
  eventId: string
  schoolId?: string | null
  deviceId?: string | null
  sessionId?: string | null
  activityType: ActivityType | string
  title: string
  description?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: number
}

export class EventDashboardRepository {
  constructor(
    private db: Database.Database,
    private eventRepo: EventRepository,
    private eventConfigRepo: EventConfigurationRepository,
    private schoolRepo: SchoolRepository
  ) {}

  public recordDelivery(params: RecordDeliveryParams): DbDeliveryRecord {
    const id = params.id || `del_${crypto.randomBytes(8).toString('hex')}`
    const now = Date.now()
    const createdAt = typeof params.createdAt === 'number' && params.createdAt > 0 ? params.createdAt : now
    const updatedAt = now

    this.db
      .prepare(
        `INSERT INTO deliveries (id, event_id, session_id, device_id, channel, status, recipient_masked, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.eventId,
        params.sessionId || null,
        params.deviceId || null,
        params.channel,
        params.status,
        params.recipientMasked || null,
        params.errorMessage || null,
        createdAt,
        updatedAt
      )

    // Also record an activity entry for this delivery
    const channelLabel = params.channel.toUpperCase()
    const isSuccess = params.status === 'success'
    this.recordActivity({
      eventId: params.eventId,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      activityType: isSuccess ? 'delivery_completed' : 'delivery_failed',
      title: isSuccess ? `Delivery Dispatched (${channelLabel})` : `Delivery Failed (${channelLabel})`,
      description: isSuccess
        ? `Successfully delivered photos via ${params.channel}${params.recipientMasked ? ` to ${params.recipientMasked}` : ''}.`
        : `Failed delivery attempt via ${params.channel}: ${params.errorMessage || 'Unknown error'}`,
      metadata: { channel: params.channel, status: params.status },
      createdAt,
    })

    return {
      id,
      eventId: params.eventId,
      sessionId: params.sessionId || null,
      deviceId: params.deviceId || null,
      channel: params.channel,
      status: params.status,
      recipientMasked: params.recipientMasked || null,
      errorMessage: params.errorMessage || null,
      createdAt,
      updatedAt,
    }
  }

  public recordActivity(params: RecordActivityParams): EventActivityRecord {
    const id = params.id || `act_${crypto.randomBytes(8).toString('hex')}`
    const now = Date.now()
    const createdAt = typeof params.createdAt === 'number' && params.createdAt > 0 ? params.createdAt : now
    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null

    this.db
      .prepare(
        `INSERT INTO event_activities (id, event_id, school_id, device_id, session_id, activity_type, title, description, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.eventId,
        params.schoolId || null,
        params.deviceId || null,
        params.sessionId || null,
        params.activityType,
        params.title,
        params.description || null,
        metadataJson,
        createdAt
      )

    return {
      id,
      eventId: params.eventId,
      schoolId: params.schoolId || null,
      deviceId: params.deviceId || null,
      sessionId: params.sessionId || null,
      activityType: params.activityType,
      title: params.title,
      description: params.description || null,
      metadata: params.metadata || null,
      createdAt,
    }
  }

  public getEventDashboard(eventId: string, schoolId?: string | null, isAdminRole: boolean = true) {
    const event = this.eventRepo.getEvent(eventId)
    if (!event) {
      throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
    }

    // Check school ownership
    if (!isAdminRole && schoolId && event.schoolId && schoolId !== event.schoolId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access dashboard for this event.')
    }

    const schoolProfile = this.schoolRepo.getProfile()
    const config = this.eventConfigRepo.getConfiguration(event.eventId)

    // 1. Session Metrics
    const totalSessionsRow = this.db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE event_id = ?')
      .get(event.eventId) as { count: number }
    const totalSessions = totalSessionsRow?.count || 0

    const completedSessionsRow = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE event_id = ? AND status = 'completed'")
      .get(event.eventId) as { count: number }
    const completedSessions = completedSessionsRow?.count || 0

    const inProgressSessionsRow = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE event_id = ? AND status = 'in_progress'")
      .get(event.eventId) as { count: number }
    const inProgressSessions = inProgressSessionsRow?.count || 0

    const failedSessionsRow = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE event_id = ? AND status = 'abandoned'")
      .get(event.eventId) as { count: number }
    const failedSessions = failedSessionsRow?.count || 0

    // 2. Photo Metrics
    const totalPhotosRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM assets a
         JOIN sessions s ON a.session_id = s.session_id
         WHERE s.event_id = ?`
      )
      .get(event.eventId) as { count: number }
    const totalPhotos = totalPhotosRow?.count || 0

    const processedPhotosRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM assets a
         JOIN sessions s ON a.session_id = s.session_id
         WHERE s.event_id = ? AND a.asset_role IN ('composed', 'thumbnail')`
      )
      .get(event.eventId) as { count: number }
    const processedPhotos = processedPhotosRow?.count || 0

    // Recent photos preview
    const recentPhotosRows = this.db
      .prepare(
        `SELECT a.* FROM assets a
         JOIN sessions s ON a.session_id = s.session_id
         WHERE s.event_id = ?
         ORDER BY a.created_at DESC LIMIT 16`
      )
      .all(event.eventId) as any[]

    const recentPhotos = recentPhotosRows.map((r) => ({
      assetId: r.asset_id,
      sessionId: r.session_id,
      assetRole: r.asset_role,
      shotNumber: r.shot_number,
      filename: r.filename,
      byteSize: Number(r.byte_size),
      createdAt: Number(r.created_at),
      url: `/api/assets/file/${r.storage_key}`,
    }))

    // 3. Delivery Metrics
    const totalDeliveriesRow = this.db
      .prepare('SELECT COUNT(*) as count FROM deliveries WHERE event_id = ?')
      .get(event.eventId) as { count: number }
    const totalDeliveriesCount = totalDeliveriesRow?.count || 0

    const successfulDeliveriesRow = this.db
      .prepare("SELECT COUNT(*) as count FROM deliveries WHERE event_id = ? AND status = 'success'")
      .get(event.eventId) as { count: number }
    const successfulDeliveries = successfulDeliveriesRow?.count || 0

    const pendingDeliveriesRow = this.db
      .prepare("SELECT COUNT(*) as count FROM deliveries WHERE event_id = ? AND status = 'pending'")
      .get(event.eventId) as { count: number }
    const pendingDeliveries = pendingDeliveriesRow?.count || 0

    const failedDeliveriesRow = this.db
      .prepare("SELECT COUNT(*) as count FROM deliveries WHERE event_id = ? AND status = 'failed'")
      .get(event.eventId) as { count: number }
    const failedDeliveries = failedDeliveriesRow?.count || 0

    // Channel breakdown
    const channels = ['print', 'qr', 'whatsapp', 'email'] as const
    const deliveryChannels: Record<string, { attempted: number; success: number; pending: number; failed: number; enabled: boolean; disabledBySchoolMode?: boolean }> = {}

    const isSchoolMode = Boolean(config?.privacy?.schoolMode)

    for (const ch of channels) {
      const chRows = this.db
        .prepare('SELECT status, COUNT(*) as count FROM deliveries WHERE event_id = ? AND channel = ? GROUP BY status')
        .all(event.eventId, ch) as Array<{ status: string; count: number }>

      const statusMap: Record<string, number> = {}
      for (const r of chRows) {
        statusMap[r.status] = r.count
      }

      let enabled = false
      let disabledBySchoolMode = false

      if (ch === 'print') enabled = Boolean(config?.delivery?.printEnabled)
      if (ch === 'qr') enabled = Boolean(config?.delivery?.cloudQrEnabled)
      if (ch === 'email') enabled = Boolean(config?.delivery?.emailEnabled)
      if (ch === 'whatsapp') {
        if (isSchoolMode) {
          enabled = false
          disabledBySchoolMode = true
        } else {
          enabled = Boolean(config?.delivery?.whatsappEnabled)
        }
      }

      const attempted = (statusMap['attempted'] || 0) + (statusMap['success'] || 0) + (statusMap['failed'] || 0) + (statusMap['pending'] || 0)
      deliveryChannels[ch] = {
        attempted,
        success: statusMap['success'] || 0,
        pending: statusMap['pending'] || 0,
        failed: statusMap['failed'] || 0,
        enabled,
        ...(disabledBySchoolMode ? { disabledBySchoolMode: true } : {}),
      }
    }

    // 4. Payment Metrics
    const paymentMode = config?.payment?.mode || 'organizer'
    const totalPaymentsRow = this.db
      .prepare('SELECT COUNT(*) as count FROM payments WHERE event_id = ?')
      .get(event.eventId) as { count: number }
    const totalPayments = totalPaymentsRow?.count || 0

    const successfulPaymentsRow = this.db
      .prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM payments WHERE event_id = ? AND status = 'success'")
      .get(event.eventId) as { count: number; total_amount: number }
    const successfulPayments = successfulPaymentsRow?.count || 0
    const totalPaymentAmount = Number(successfulPaymentsRow?.total_amount || 0)

    const pendingPaymentsRow = this.db
      .prepare("SELECT COUNT(*) as count FROM payments WHERE event_id = ? AND status IN ('pending', 'initiated', 'processing')")
      .get(event.eventId) as { count: number }
    const pendingPayments = pendingPaymentsRow?.count || 0

    const failedPaymentsRow = this.db
      .prepare("SELECT COUNT(*) as count FROM payments WHERE event_id = ? AND status IN ('failed', 'cancelled', 'expired')")
      .get(event.eventId) as { count: number }
    const failedPayments = failedPaymentsRow?.count || 0

    const recentPaymentsRows = this.db
      .prepare('SELECT * FROM payments WHERE event_id = ? ORDER BY created_at DESC LIMIT 10')
      .all(event.eventId) as any[]

    const recentPayments = recentPaymentsRows.map((p) => ({
      id: p.id,
      sessionId: p.session_id,
      deviceId: p.device_id,
      paymentReference: p.payment_reference,
      amount: Number(p.amount),
      currency: p.currency,
      mode: p.mode,
      status: p.status,
      provider: p.provider,
      upiId: p.upi_id ? `${p.upi_id.slice(0, 3)}***@${p.upi_id.split('@')[1] || 'upi'}` : null,
      merchantName: p.merchant_name,
      createdAt: Number(p.created_at),
      verifiedAt: p.verified_at ? Number(p.verified_at) : null,
      errorMessage: p.error_message,
    }))

    // 5. Device & Booth Metrics
    const activationRows = this.db
      .prepare(
        `SELECT d.*, MAX(a.activated_at) as activated_at, MAX(a.last_active_at) as last_active_at FROM devices d
         LEFT JOIN device_event_activations a ON d.device_id = a.device_id AND a.event_id = ?
         WHERE d.active_event_id = ? OR a.event_id = ?
         GROUP BY d.device_id
         ORDER BY COALESCE(MAX(a.last_active_at), d.last_seen) DESC`
      )
      .all(event.eventId, event.eventId, event.eventId) as any[]

    const now = Date.now()
    const devices = activationRows.map((d) => {
      const lastSeen = Number(d.last_seen || d.last_active_at || d.registered_at)
      const isOnline = d.status === 'active' && now - lastSeen < 15 * 60 * 1000 // 15 mins
      return {
        deviceId: d.device_id,
        deviceName: d.device_name,
        platform: d.platform,
        appVersion: d.app_version,
        status: d.status,
        registeredAt: Number(d.registered_at),
        lastSeen,
        lastHeartbeat: d.last_heartbeat ? Number(d.last_heartbeat) : null,
        activatedAt: d.activated_at ? Number(d.activated_at) : Number(d.registered_at),
        lastActiveAt: d.last_active_at ? Number(d.last_active_at) : lastSeen,
        activeEventId: d.active_event_id ?? null,
        isOnline,
        syncStatus: 'synced' as const,
        pendingOutboxCount: 0,
      }
    })

    const activeBooths = devices.filter((d) => d.status === 'active').length

    // 6. Detailed Session List (Non-sensitive)
    const sessionRows = this.db
      .prepare(
        `SELECT s.*, 
          (SELECT COUNT(*) FROM assets a WHERE a.session_id = s.session_id) as photo_count,
          (SELECT status FROM payments p WHERE p.session_id = s.session_id ORDER BY p.created_at DESC LIMIT 1) as payment_status,
          (SELECT status FROM deliveries del WHERE del.session_id = s.session_id ORDER BY del.created_at DESC LIMIT 1) as delivery_status
         FROM sessions s
         WHERE s.event_id = ?
         ORDER BY s.created_at DESC
         LIMIT 50`
      )
      .all(event.eventId) as any[]

    const sessions = sessionRows.map((s) => ({
      sessionId: s.session_id,
      eventId: s.event_id,
      deviceId: s.device_id,
      shotCount: Number(s.shot_count),
      language: s.language,
      status: s.status,
      photoCount: Number(s.photo_count || 0),
      deliveryStatus: s.delivery_status || (s.status === 'completed' ? 'success' : 'pending'),
      paymentStatus: paymentMode === 'organizer' ? 'not_required' : s.payment_status || (paymentMode === 'disabled' ? 'disabled' : 'pending'),
      syncStatus: 'synced',
      createdAt: Number(s.created_at),
      updatedAt: Number(s.updated_at),
    }))

    // 7. Recent Activity Timeline
    const rawActivities = this.db
      .prepare('SELECT * FROM event_activities WHERE event_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(event.eventId) as any[]

    let activities = rawActivities.map((a) => ({
      id: a.id,
      eventId: a.event_id,
      deviceId: a.device_id,
      sessionId: a.session_id,
      activityType: a.activity_type,
      title: a.title,
      description: a.description,
      metadata: a.metadata_json ? JSON.parse(a.metadata_json) : null,
      createdAt: Number(a.created_at),
    }))

    // If explicit activities table is empty, synthesize timeline from durable event milestones
    if (activities.length === 0) {
      const syntheticActivities: any[] = [
        {
          id: `act_created_${event.eventId}`,
          eventId: event.eventId,
          activityType: 'event_created',
          title: 'Event Created',
          description: `Event "${event.name}" was registered for ${event.eventDate || 'the school'}.`,
          createdAt: event.createdAt,
        },
      ]

      if (event.activationToken) {
        syntheticActivities.push({
          id: `act_ready_${event.eventId}`,
          eventId: event.eventId,
          activityType: 'event_activated',
          title: 'Activation QR Prepared',
          description: `Unique Event ID ${event.eventId} and activation credentials generated.`,
          createdAt: event.updatedAt || event.createdAt,
        })
      }

      for (const dev of devices) {
        syntheticActivities.push({
          id: `act_dev_${dev.deviceId}`,
          eventId: event.eventId,
          deviceId: dev.deviceId,
          activityType: 'booth_activated',
          title: `Booth Activated (${dev.deviceName})`,
          description: `Photobooth hardware ${dev.deviceName} (${dev.platform}) paired with this event.`,
          createdAt: dev.activatedAt,
        })
      }

      for (const sess of sessions.slice(0, 10)) {
        syntheticActivities.push({
          id: `act_sess_${sess.sessionId}`,
          eventId: event.eventId,
          sessionId: sess.sessionId,
          deviceId: sess.deviceId,
          activityType: 'session_created',
          title: `Photo Session Completed`,
          description: `Guest session captured with ${sess.photoCount} photo${sess.photoCount === 1 ? '' : 's'}.`,
          createdAt: sess.createdAt,
        })
      }

      for (const p of recentPayments.slice(0, 5)) {
        syntheticActivities.push({
          id: `act_pay_${p.id}`,
          eventId: event.eventId,
          sessionId: p.sessionId,
          activityType: p.status === 'success' ? 'payment_completed' : 'payment_failed',
          title: p.status === 'success' ? `Payment Received (₹${p.amount})` : `Payment ${p.status}`,
          description: `Payment of ₹${p.amount} recorded for session ${p.sessionId}.`,
          createdAt: p.createdAt,
        })
      }

      syntheticActivities.sort((a, b) => b.createdAt - a.createdAt)
      activities = syntheticActivities.slice(0, 25)
    }

    // 8. Performance KPIs
    const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : null
    const avgPhotosPerSession = totalSessions > 0 ? Number((totalPhotos / totalSessions).toFixed(1)) : null
    const totalDeliveryAttempts = successfulDeliveries + failedDeliveries + pendingDeliveries
    const deliverySuccessRate = totalDeliveryAttempts > 0 ? Math.round((successfulDeliveries / totalDeliveryAttempts) * 100) : null
    const totalPaymentAttempts = successfulPayments + failedPayments + pendingPayments
    const paymentSuccessRate = paymentMode === 'individual' && totalPaymentAttempts > 0 ? Math.round((successfulPayments / totalPaymentAttempts) * 100) : null

    // 9. Sync Health
    const lastSyncRow = this.db
      .prepare('SELECT MAX(created_at) as last_sync FROM sessions WHERE event_id = ?')
      .get(event.eventId) as { last_sync: number | null }
    const lastSyncAt = lastSyncRow?.last_sync ? Number(lastSyncRow.last_sync) : null

    return {
      event: {
        eventId: event.eventId,
        name: event.name,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue || 'School Campus',
        status: event.status,
        schoolId: event.schoolId,
        schoolName: schoolProfile?.schoolName || 'Pehchaan Model School',
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
      summary: {
        totalSessions,
        completedSessions,
        inProgressSessions,
        failedSessions,
        totalPhotos,
        processedPhotos,
        totalDeliveries: totalDeliveriesCount,
        successfulDeliveries,
        pendingDeliveries,
        failedDeliveries,
        totalPayments,
        successfulPayments,
        pendingPayments,
        failedPayments,
        totalPaymentAmount,
        paymentMode,
        activeBooths,
        pendingSync: 0,
      },
      sessions,
      photos: {
        totalCaptured: totalPhotos,
        processedPhotos,
        pendingSyncPhotos: 0,
        recentPhotos,
      },
      deliveries: {
        totalAttempted: totalDeliveryAttempts,
        successful: successfulDeliveries,
        pending: pendingDeliveries,
        failed: failedDeliveries,
        channels: deliveryChannels,
        schoolMode: isSchoolMode,
      },
      payments: {
        mode: paymentMode,
        currency: config?.payment?.currency || 'INR',
        amount: config?.payment?.amount || 0,
        totalAttempts: totalPaymentAttempts,
        successful: successfulPayments,
        pending: pendingPayments,
        failed: failedPayments,
        totalRevenue: totalPaymentAmount,
        recentPayments,
      },
      devices,
      sync: {
        status: 'healthy' as const,
        totalSyncedItems: totalSessions + totalPhotos,
        pendingItems: 0,
        failedItems: 0,
        lastSyncAt,
        devicesWithPendingSync: 0,
      },
      recentActivity: activities,
      performance: {
        completionRate,
        avgPhotosPerSession,
        deliverySuccessRate,
        paymentSuccessRate,
        syncSuccessRate: 100,
      },
    }
  }

  public getSchoolDashboardStats(schoolId?: string | null) {
    const profile = this.schoolRepo.getProfile()
    const effectiveSchoolId = schoolId || profile?.id || 'sch_default'
    const events = this.eventRepo.listEventsBySchool(effectiveSchoolId)

    const totalEvents = events.length
    const activeEvents = events.filter((e) => e.status === 'live').length
    const completedEvents = events.filter((e) => e.status === 'ended').length

    let totalSessions = 0
    let totalPhotos = 0
    let totalDeliveries = 0

    const recentEvents = events.slice(0, 8).map((e) => {
      const sessRow = this.db
        .prepare('SELECT COUNT(*) as count FROM sessions WHERE event_id = ?')
        .get(e.eventId) as { count: number }
      const photoRow = this.db
        .prepare(
          `SELECT COUNT(*) as count FROM assets a
           JOIN sessions s ON a.session_id = s.session_id
           WHERE s.event_id = ?`
        )
        .get(e.eventId) as { count: number }
      const delRow = this.db
        .prepare("SELECT COUNT(*) as count FROM deliveries WHERE event_id = ? AND status = 'success'")
        .get(e.eventId) as { count: number }

      const sessCount = sessRow?.count || 0
      const photoCount = photoRow?.count || 0
      const delCount = delRow?.count || 0

      totalSessions += sessCount
      totalPhotos += photoCount
      totalDeliveries += delCount

      const config = this.eventConfigRepo.getConfiguration(e.eventId)

      return {
        eventId: e.eventId,
        name: e.name,
        status: e.status,
        eventDate: e.eventDate,
        venue: e.venue || 'School Campus',
        sessionCount: sessCount,
        photoCount,
        paymentMode: config?.payment?.mode || 'organizer',
        createdAt: e.createdAt,
      }
    })

    return {
      totalEvents,
      activeEvents,
      completedEvents,
      totalSessions,
      totalPhotos,
      totalDeliveries,
      recentEvents,
      school: profile,
    }
  }
}
