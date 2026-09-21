import type Database from 'better-sqlite3'
import type { DbPaymentRecord, DbPaymentStatus } from '../types.js'
import { AppError } from '../../errors/AppError.js'

export interface CreateDbPaymentParams {
  id?: string
  eventId: string
  sessionId: string
  deviceId?: string
  paymentReference: string
  amount: number
  currency?: string
  mode?: string
  status?: DbPaymentStatus
  provider?: string
  upiId?: string | null
  merchantName?: string | null
  gatewayProvider?: string | null
  gatewayOrderId?: string | null
  gatewayPaymentId?: string | null
  webhookEventId?: string | null
  webhookReceivedAt?: number | null
  expiresAt?: number | null
  failureReason?: string | null
  qrPayload?: string | null
  qrDataUrl?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: number
}

export interface PaymentSummaryDto {
  eventId: string
  successfulCount: number
  pendingCount: number
  failedCount: number
  cancelledCount: number
  totalCollected: number
  currency: string
}

export class PaymentRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  private mapRow(row: any): DbPaymentRecord {
    let metadata: Record<string, unknown> | null = null
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json)
      } catch {
        metadata = null
      }
    }

    return {
      id: row.id,
      eventId: row.event_id,
      sessionId: row.session_id,
      deviceId: row.device_id,
      paymentReference: row.payment_reference,
      amount: row.amount,
      currency: row.currency,
      mode: row.mode,
      status: row.status as DbPaymentStatus,
      provider: row.provider,
      upiId: row.upi_id,
      merchantName: row.merchant_name,
      gatewayProvider: row.gateway_provider || null,
      gatewayOrderId: row.gateway_order_id || null,
      gatewayPaymentId: row.gateway_payment_id || null,
      webhookEventId: row.webhook_event_id || null,
      webhookReceivedAt: row.webhook_received_at || null,
      expiresAt: row.expires_at || null,
      failureReason: row.failure_reason || null,
      qrPayload: metadata?.qrPayload ? String(metadata.qrPayload) : null,
      qrDataUrl: metadata?.qrDataUrl ? String(metadata.qrDataUrl) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      verifiedAt: row.verified_at,
      errorMessage: row.error_message,
      metadata,
    }
  }

  public createPayment(params: CreateDbPaymentParams): { payment: DbPaymentRecord; isNew: boolean } {
    const existing = this.getPaymentByReference(params.paymentReference)
    if (existing) {
      return { payment: existing, isNew: false }
    }

    const deviceId = params.deviceId || 'booth_device'

    // Verify session exists or check if event exists
    const eventRow = this.db.prepare('SELECT event_id FROM events WHERE event_id = ?').get(params.eventId)
    if (!eventRow) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO events (event_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(params.eventId, 'Photobooth Event', 'live', Date.now(), Date.now())
    }

    const deviceRow = this.db.prepare('SELECT device_id FROM devices WHERE device_id = ?').get(deviceId)
    if (!deviceRow) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO devices (device_id, device_name, platform, app_version, status, registered_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(deviceId, 'Booth Device', 'web-chrome', '1.0.0', 'active', Date.now(), Date.now())
    }

    const sessionRow = this.db.prepare('SELECT session_id FROM sessions WHERE session_id = ?').get(params.sessionId)
    if (!sessionRow) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO sessions (session_id, event_id, device_id, shot_count, language, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(params.sessionId, params.eventId, deviceId, 3, 'en', 'completed', Date.now(), Date.now())
    }

    const id = params.id || `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const now = Date.now()
    const currency = params.currency || 'INR'
    const mode = params.mode || 'individual'
    const status = params.status || 'pending'
    const provider = params.provider || 'mock_upi'
    const finalMetadata = {
      ...(params.metadata || {}),
      ...(params.qrPayload ? { qrPayload: params.qrPayload } : {}),
      ...(params.qrDataUrl ? { qrDataUrl: params.qrDataUrl } : {}),
    }
    const metadataJson = Object.keys(finalMetadata).length > 0 ? JSON.stringify(finalMetadata) : null

    const stmt = this.db.prepare(`
      INSERT INTO payments (
        id, event_id, session_id, device_id, payment_reference,
        amount, currency, mode, status, provider,
        upi_id, merchant_name, gateway_provider, gateway_order_id, gateway_payment_id,
        webhook_event_id, webhook_received_at, expires_at, failure_reason,
        created_at, updated_at, metadata_json
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `)

    stmt.run(
      id,
      params.eventId,
      params.sessionId,
      params.deviceId,
      params.paymentReference,
      params.amount,
      currency,
      mode,
      status,
      provider,
      params.upiId || null,
      params.merchantName || null,
      params.gatewayProvider || null,
      params.gatewayOrderId || null,
      params.gatewayPaymentId || null,
      params.webhookEventId || null,
      params.webhookReceivedAt || null,
      params.expiresAt || null,
      params.failureReason || null,
      params.createdAt || now,
      now,
      metadataJson
    )

    const payment = this.getPaymentByReference(params.paymentReference)
    if (!payment) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to retrieve inserted payment')
    }

    return { payment, isNew: true }
  }

  public getPaymentByReference(paymentReference: string): DbPaymentRecord | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference)
    return row ? this.mapRow(row) : null
  }

  public getPaymentByGatewayOrderId(gatewayOrderId: string): DbPaymentRecord | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE gateway_order_id = ?').get(gatewayOrderId)
    return row ? this.mapRow(row) : null
  }

  public getPaymentByGatewayPaymentId(gatewayPaymentId: string): DbPaymentRecord | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE gateway_payment_id = ?').get(gatewayPaymentId)
    return row ? this.mapRow(row) : null
  }

  public getPaymentByWebhookEventId(webhookEventId: string): DbPaymentRecord | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE webhook_event_id = ?').get(webhookEventId)
    return row ? this.mapRow(row) : null
  }

  public getPaymentBySessionId(sessionId: string): DbPaymentRecord | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId)
    return row ? this.mapRow(row) : null
  }

  public updatePaymentStatus(
    paymentReference: string,
    status: DbPaymentStatus,
    options: {
      verifiedAt?: number | null
      errorMessage?: string | null
      failureReason?: string | null
      gatewayPaymentId?: string | null
      gatewayOrderId?: string | null
      webhookEventId?: string | null
      webhookReceivedAt?: number | null
      expiresAt?: number | null
      metadata?: Record<string, unknown> | null
    } = {}
  ): DbPaymentRecord | null {
    const existing = this.getPaymentByReference(paymentReference)
    if (!existing) return null

    const now = Date.now()
    const verifiedAt = options.verifiedAt !== undefined ? options.verifiedAt : ((status === 'success' || status === 'paid') ? (existing.verifiedAt || now) : existing.verifiedAt)
    const errorMsg = options.errorMessage !== undefined ? options.errorMessage : existing.errorMessage
    const failureReason = options.failureReason !== undefined ? options.failureReason : existing.failureReason
    const gatewayPaymentId = options.gatewayPaymentId !== undefined ? options.gatewayPaymentId : existing.gatewayPaymentId
    const gatewayOrderId = options.gatewayOrderId !== undefined ? options.gatewayOrderId : existing.gatewayOrderId
    const webhookEventId = options.webhookEventId !== undefined ? options.webhookEventId : existing.webhookEventId
    const webhookReceivedAt = options.webhookReceivedAt !== undefined ? options.webhookReceivedAt : existing.webhookReceivedAt
    const expiresAt = options.expiresAt !== undefined ? options.expiresAt : existing.expiresAt
    const metadataJson = options.metadata ? JSON.stringify(options.metadata) : existing.metadata ? JSON.stringify(existing.metadata) : null

    this.db
      .prepare(`
        UPDATE payments
        SET status = ?, verified_at = ?, error_message = ?, failure_reason = ?,
            gateway_payment_id = ?, gateway_order_id = ?, webhook_event_id = ?,
            webhook_received_at = ?, expires_at = ?, metadata_json = ?, updated_at = ?
        WHERE payment_reference = ?
      `)
      .run(
        status,
        verifiedAt,
        errorMsg,
        failureReason,
        gatewayPaymentId,
        gatewayOrderId,
        webhookEventId,
        webhookReceivedAt,
        expiresAt,
        metadataJson,
        now,
        paymentReference
      )

    return this.getPaymentByReference(paymentReference)
  }

  public getEventPaymentSummary(eventId: string): PaymentSummaryDto {
    const rows = this.db.prepare('SELECT * FROM payments WHERE event_id = ?').all(eventId) as any[]
    let successfulCount = 0
    let pendingCount = 0
    let failedCount = 0
    let cancelledCount = 0
    let totalCollected = 0
    let currency = 'INR'

    for (const r of rows) {
      if (r.mode === 'individual') {
        currency = r.currency || 'INR'
        if (r.status === 'success' || r.status === 'paid') {
          successfulCount++
          totalCollected += Number(r.amount) || 0
        } else if (r.status === 'pending' || r.status === 'initiated' || r.status === 'processing' || r.status === 'created') {
          pendingCount++
        } else if (r.status === 'failed' || r.status === 'expired') {
          failedCount++
        } else if (r.status === 'cancelled') {
          cancelledCount++
        }
      }
    }

    return {
      eventId,
      successfulCount,
      pendingCount,
      failedCount,
      cancelledCount,
      totalCollected,
      currency,
    }
  }

  public listPayments(eventId?: string): DbPaymentRecord[] {
    const rows = eventId
      ? this.db.prepare('SELECT * FROM payments WHERE event_id = ? ORDER BY created_at DESC').all(eventId)
      : this.db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all()
    return rows.map((r) => this.mapRow(r))
  }
}

