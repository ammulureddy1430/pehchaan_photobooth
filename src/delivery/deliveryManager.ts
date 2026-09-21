import {
  listCompletedSessions,
  getCompletedSession,
  getDerived,
  compositionDerivedId,
  listOutboxItems,
  saveCompletedSession,
  listAllPhotos,
} from '../lib/photoStore'
import type { CompletedSessionRecord } from '../sync/types'
import { photosExportService } from './photosExport'
import { printService } from './print'
import { whatsAppDeliveryService } from './whatsapp'
import { emailDeliveryService } from './email'
import { cloudQrService } from './qr'
import type { EventPack } from '../eventPack/types'
import type {
  DeliveryChannel,
  DeliveryStatus,
  DeliveryRecord,
  DeliverySessionSummary,
  DeliveryManagerStats,
  PhotosExportResult,
  PrintResult,
  CloudQrResult,
  WhatsAppDeliveryResult,
  EmailDeliveryResult,
} from './types'

export class DeliveryManager {
  private deliveryHistory: DeliveryRecord[] = []
  private lastAction: {
    channel: DeliveryChannel
    status: DeliveryStatus
    sessionId: string
    timestamp: number
    error?: string | null
  } | null = null

  public recordAction(
    channel: DeliveryChannel,
    sessionId: string,
    status: DeliveryStatus,
    target?: string | null,
    error?: string | null
  ): DeliveryRecord {
    const record: DeliveryRecord = {
      id: `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      channel,
      status,
      target: target ?? null,
      error: error ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.deliveryHistory.push(record)
    this.lastAction = {
      channel,
      status,
      sessionId,
      timestamp: Date.now(),
      error: error ?? null,
    }
    return record
  }

  public async getCompletedSessionsList(): Promise<DeliverySessionSummary[]> {
    const records = await listCompletedSessions()
    const recordMap = new Map<string, CompletedSessionRecord>()
    for (const r of records) {
      recordMap.set(r.id, r)
    }

    // Reconcile any sessions present in outbox not yet stored in completed_sessions
    try {
      const outboxItems = await listOutboxItems()
      for (const item of outboxItems) {
        if (item.op === 'SESSION_CREATE' && !recordMap.has(item.sessionId)) {
          const hasAssets = outboxItems.some(
            (a) => a.sessionId === item.sessionId && a.op === 'ASSET_UPLOAD'
          )
          if (hasAssets) {
            const synth: CompletedSessionRecord = {
              id: item.sessionId,
              mode: item.sessionPayload?.shotCount || 3,
              photoIds: [],
              kind: 'guest',
              packId: item.eventId.replace(/^evt_/, ''),
              packVersion: item.sessionPayload?.eventPackVersion || '1.0.0',
              language: item.sessionPayload?.language || 'en',
              createdAt: item.createdAt,
              syncedAt: item.status === 'SYNCED' ? item.updatedAt : null,
            }
            recordMap.set(item.sessionId, synth)
            void saveCompletedSession(synth)
          }
        }
      }
    } catch {
      // Ignore outbox read errors
    }

    const allPhotos = await listAllPhotos().catch(() => [])
    const photoCountBySession = new Map<string, number>()
    for (const p of allPhotos) {
      photoCountBySession.set(p.sessionId, (photoCountBySession.get(p.sessionId) || 0) + 1)
    }

    const summaries: DeliverySessionSummary[] = []
    for (const rec of recordMap.values()) {
      const compDerived = await getDerived(compositionDerivedId(rec.id)).catch(() => undefined)
      const localPhotoCount = photoCountBySession.get(rec.id) || 0
      const recPhotoCount = (rec.photoIds && Array.isArray(rec.photoIds)) ? rec.photoIds.filter(Boolean).length : 0
      const actualPhotos = Math.max(localPhotoCount, recPhotoCount)
      const hasComp = Boolean(compDerived?.blob)

      // Only display sessions that actually have captured/saved photo assets, composition, or a valid synced galleryUrl
      if (actualPhotos === 0 && !hasComp && !rec.galleryUrl) {
        continue
      }

      summaries.push({
        sessionId: rec.id,
        createdAt: rec.createdAt,
        syncedAt: rec.syncedAt ?? null,
        isSynced: Boolean(rec.syncedAt && rec.galleryUrl),
        galleryUrl: rec.galleryUrl ?? null,
        photoCount: actualPhotos || (hasComp ? 1 : 0),
        hasComposition: hasComp,
      })
    }

    // Sort descending by creation time
    return summaries.sort((a, b) => b.createdAt - a.createdAt)
  }

  private isPaymentUnlocked(session: CompletedSessionRecord | null | undefined, pack: EventPack): boolean {
    if (!pack.payment || pack.payment.mode !== 'individual' || pack.payment.enabled === false) {
      return true
    }
    return session?.paymentStatus === 'success'
  }

  public async exportPhotos(sessionId: string, includeOriginals = false): Promise<PhotosExportResult> {
    const result = await photosExportService.exportSessionMedia({ sessionId, includeOriginals })
    this.recordAction('export', sessionId, result.status, null, result.error)
    return result
  }

  public async printSession(sessionId: string, pack: EventPack): Promise<PrintResult> {
    const enabled = pack.printEnabled !== false
    const session = await getCompletedSession(sessionId)

    if (!this.isPaymentUnlocked(session, pack)) {
      const result: PrintResult = {
        success: false,
        status: 'FAILED',
        error: 'Payment required: photo printing is locked until payment is verified.',
      }
      this.recordAction('print', sessionId, result.status, null, result.error)
      return result
    }

    const result = await printService.printSession({ sessionId }, enabled)
    this.recordAction('print', sessionId, result.status, null, result.error)
    return result
  }

  public async getCloudQr(sessionId: string, pack: EventPack, customHost?: string): Promise<CloudQrResult> {
    const enabled = pack.cloudQrEnabled !== false
    const session = await getCompletedSession(sessionId)

    if (session && !this.isPaymentUnlocked(session, pack)) {
      const result: CloudQrResult = {
        success: false,
        status: 'FAILED',
        error: 'Payment required: cloud QR access is locked until payment is verified.',
      }
      this.recordAction('qr', sessionId, result.status, null, result.error)
      return result
    }

    let galleryUrl = session?.galleryUrl ?? null

    if (customHost) {
      const cleanCustom = customHost.trim()
      const base = cleanCustom.endsWith('/') ? cleanCustom.slice(0, -1) : cleanCustom
      const fullBase = base.startsWith('http') ? base : `http://${base}`
      galleryUrl = `${fullBase}/gallery/${sessionId}`
    }

    const result = cloudQrService.generateCloudQr({ sessionId, galleryUrl }, enabled)
    this.recordAction('qr', sessionId, result.status, galleryUrl, result.error)
    return result
  }

  public async sendWhatsApp(
    sessionId: string,
    phoneNumber: string,
    pack: EventPack,
    customHost?: string
  ): Promise<WhatsAppDeliveryResult> {
    if (pack.schoolMode) {
      const result: WhatsAppDeliveryResult = {
        success: false,
        status: 'DISABLED',
        error: 'SchoolMode: WhatsApp delivery is disabled for school events.',
      }
      this.recordAction('whatsapp', sessionId, result.status, phoneNumber, result.error)
      return result
    }

    const enabled = pack.whatsappEnabled !== false
    const session = await getCompletedSession(sessionId)

    if (session && !this.isPaymentUnlocked(session, pack)) {
      const result: WhatsAppDeliveryResult = {
        success: false,
        status: 'FAILED',
        error: 'Payment required: WhatsApp delivery is locked until payment is verified.',
      }
      this.recordAction('whatsapp', sessionId, result.status, phoneNumber, result.error)
      return result
    }

    let galleryUrl = session?.galleryUrl ?? null

    if (customHost) {
      const cleanCustom = customHost.trim()
      const base = cleanCustom.endsWith('/') ? cleanCustom.slice(0, -1) : cleanCustom
      const fullBase = base.startsWith('http') ? base : `http://${base}`
      galleryUrl = `${fullBase}/gallery/${sessionId}`
    }

    const result = whatsAppDeliveryService.prepareWhatsAppDelivery(
      {
        sessionId,
        phoneNumber,
        galleryUrl,
        eventName: pack.eventName,
      },
      enabled
    )

    if (result.success) {
      // Execute direct server dispatch to guest phone number
      try {
        const directRes = await whatsAppDeliveryService.sendDirectWhatsApp({
          sessionId,
          phoneNumber,
          galleryUrl,
          eventName: pack.eventName,
        }, customHost)
        if (directRes.success) {
          result.directSent = true
          result.message = directRes.message
        }
      } catch {
        // Safe fallback
      }
    }

    this.recordAction('whatsapp', sessionId, result.status, phoneNumber, result.error)
    return result
  }

  public async sendEmail(
    sessionId: string,
    email: string,
    pack: EventPack,
    customHost?: string
  ): Promise<EmailDeliveryResult> {
    const enabled = pack.emailEnabled !== false
    const session = await getCompletedSession(sessionId)

    if (session && !this.isPaymentUnlocked(session, pack)) {
      const result: EmailDeliveryResult = {
        success: false,
        status: 'FAILED',
        error: 'Payment required: email delivery is locked until payment is verified.',
      }
      this.recordAction('email', sessionId, result.status, email, result.error)
      return result
    }

    let galleryUrl = session?.galleryUrl ?? null

    if (customHost) {
      const cleanCustom = customHost.trim()
      const base = cleanCustom.endsWith('/') ? cleanCustom.slice(0, -1) : cleanCustom
      const fullBase = base.startsWith('http') ? base : `http://${base}`
      galleryUrl = `${fullBase}/gallery/${sessionId}`
    }

    const result = emailDeliveryService.prepareEmailDelivery(
      {
        sessionId,
        email,
        galleryUrl,
        eventName: pack.eventName,
      },
      enabled
    )

    this.recordAction('email', sessionId, result.status, email, result.error)
    if (result.success && result.mailtoUrl) {
      emailDeliveryService.launchHandoff(result.mailtoUrl)
    }

    return result
  }

  public async getStats(pack: EventPack): Promise<DeliveryManagerStats> {
    const sessions = await listCompletedSessions()
    let synced = 0
    let pending = 0

    for (const s of sessions) {
      if (s.syncedAt && s.galleryUrl) {
        synced++
      } else {
        pending++
      }
    }

    return {
      whatsappEnabled: Boolean(pack.whatsappEnabled),
      emailEnabled: Boolean(pack.emailEnabled),
      cloudQrEnabled: Boolean(pack.cloudQrEnabled),
      printEnabled: Boolean(pack.printEnabled),
      totalSessions: sessions.length,
      syncedSessions: synced,
      pendingSyncSessions: pending,
      lastAction: this.lastAction,
    }
  }

  public getHistory(): DeliveryRecord[] {
    return [...this.deliveryHistory]
  }

  public clearHistory(): void {
    this.deliveryHistory = []
    this.lastAction = null
  }
}

export const deliveryManager = new DeliveryManager()
