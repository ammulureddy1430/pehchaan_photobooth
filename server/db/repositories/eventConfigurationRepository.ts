import type Database from 'better-sqlite3'
import { AppError } from '../../errors/AppError.js'
import type { EventRecord } from '../types.js'

export interface EventBrandingConfig {
  schoolLogoUrl: string | null
  schoolName: string
  eventTitle: string
  eventSubtitle: string
  useDefaultSchoolLogo: boolean
  accentColor: string
}

export interface EventPhotoConfig {
  shotCount: 1 | 2 | 3
  orientation: 'portrait_strip' | 'single_hero' | 'duo_grid'
  mirrorOutput: boolean
  blackAndWhiteEnabled: boolean
  sepiaEnabled: boolean
  betweenShotPauseMs: number
  retentionHours: number
}

export interface EventTemplateConfig {
  templateId: 'school-classic' | 'fest-edition' | 'little-keepsake' | 'brand-canvas' | 'classic-strip' | 'single-portrait' | 'minimal-duo' | string
  background: string
  overlayEnabled: boolean
  frameEdge?: 'fine' | 'bold' | 'double' | 'rounded' | 'none'
  printedDate?: string
  customTitle?: string
  customSubtitle?: string
  cardBackEnabled?: boolean
  cardBackHeadline?: string
  cardBackMessage?: string
  cardBackShowQr?: boolean
  cardBackBgColor?: string
  cardBackTextColor?: string
  cardBackStyle?: 'note_lines' | 'clean_message' | 'qr_focus'
  cardBackShowLines?: boolean
}

export interface EventDeliveryConfig {
  printEnabled: boolean
  cloudQrEnabled: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
}

export interface EventPaymentConfig {
  mode: 'organizer' | 'individual' | 'disabled'
  amount: number
  currency: string
  upiId?: string
  merchantName?: string
  timeoutSeconds?: number
}

export interface EventPrivacyConfig {
  schoolMode: boolean
  consentMode: 'none' | 'notice' | 'explicit' | 'explicitShare'
  privacyNoticeText: string
  retentionHours: number
  publicGalleryEnabled: boolean
}

export interface EventConfigurationRecord {
  id: string
  eventId: string
  schoolId: string | null
  branding: EventBrandingConfig
  photoSettings: EventPhotoConfig
  template: EventTemplateConfig
  delivery: EventDeliveryConfig
  payment: EventPaymentConfig
  privacy: EventPrivacyConfig
  staffPin?: string
  eventPack: Record<string, unknown>
  status: 'incomplete' | 'complete'
  version: number
  createdAt: number
  updatedAt: number
}

export interface SaveEventConfigParams {
  branding: Partial<EventBrandingConfig>
  photoSettings: Partial<EventPhotoConfig>
  template: Partial<EventTemplateConfig>
  delivery: Partial<EventDeliveryConfig>
  payment: Partial<EventPaymentConfig>
  privacy: Partial<EventPrivacyConfig>
  staffPin?: string
}

export function getDefaultConfiguration(
  event: EventRecord,
  schoolProfile?: { schoolName: string; logoUrl?: string | null } | null
): Omit<EventConfigurationRecord, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
  const schoolName = schoolProfile?.schoolName || 'Pehchaan Model Academy'
  const schoolLogoUrl = schoolProfile?.logoUrl || null

  const branding: EventBrandingConfig = {
    schoolLogoUrl,
    schoolName,
    eventTitle: event.name,
    eventSubtitle: event.venue || 'Annual Photobooth Experience',
    useDefaultSchoolLogo: true,
    accentColor: '#c6a15b',
  }

  const photoSettings: EventPhotoConfig = {
    shotCount: 3,
    orientation: 'portrait_strip',
    mirrorOutput: true,
    blackAndWhiteEnabled: true,
    sepiaEnabled: true,
    betweenShotPauseMs: 0,
    retentionHours: 72,
  }

  const template: EventTemplateConfig = {
    templateId: 'school-classic',
    background: '#ffffff',
    overlayEnabled: true,
    frameEdge: 'fine',
    printedDate: '',
    customTitle: event.name,
    customSubtitle: schoolName,
    cardBackEnabled: true,
    cardBackHeadline: 'Thank you for coming',
    cardBackMessage: 'A special keepsake from your unforgettable day.',
    cardBackShowQr: true,
    cardBackBgColor: '#ffffff',
    cardBackTextColor: '#0f172a',
    cardBackStyle: 'note_lines',
    cardBackShowLines: true,
  }

  const delivery: EventDeliveryConfig = {
    printEnabled: true,
    cloudQrEnabled: true,
    whatsappEnabled: false, // OFF by default for privacy
    emailEnabled: false,
  }

  const payment: EventPaymentConfig = {
    mode: 'organizer', // Organizer sponsored by default
    amount: 0,
    currency: 'INR',
    upiId: '',
    merchantName: schoolName,
    timeoutSeconds: 300,
  }

  const privacy: EventPrivacyConfig = {
    schoolMode: true, // School mode ON by default for safety
    consentMode: 'notice',
    privacyNoticeText:
      'Privacy Notice: Photos taken during this session are saved privately and never published without consent.',
    retentionHours: 72,
    publicGalleryEnabled: false,
  }

  const staffPin = schoolProfile && (schoolProfile as any).staffPin ? (schoolProfile as any).staffPin : '482917'

  const eventPack = generateEventPack(event, {
    branding,
    photoSettings,
    template,
    delivery,
    payment,
    privacy,
    staffPin,
  })

  return {
    eventId: event.eventId,
    schoolId: event.schoolId || 'sch_default',
    branding,
    photoSettings,
    template,
    delivery,
    payment,
    privacy,
    staffPin,
    eventPack,
    status: 'complete',
  }
}

export function generateEventPack(
  event: EventRecord,
  config: {
    branding: EventBrandingConfig
    photoSettings: EventPhotoConfig
    template: EventTemplateConfig
    delivery: EventDeliveryConfig
    payment: EventPaymentConfig
    privacy: EventPrivacyConfig
    staffPin?: string
  }
): Record<string, unknown> {
  const { branding, photoSettings, template, delivery, payment, privacy, staffPin } = config
  const shotCount = photoSettings.shotCount || 3
  const isSingle = shotCount === 1

  let slots: any[] = []
  if (shotCount === 1) {
    slots = [
      {
        id: 'slot-1',
        shotNumber: 1,
        x: 78,
        y: 86,
        width: 664,
        height: 742,
        fit: 'cover',
        effect: 'none',
      },
    ]
  } else if (shotCount === 2) {
    slots = [
      {
        id: 'slot-1',
        shotNumber: 1,
        x: 24,
        y: 40,
        width: 352,
        height: 440,
        fit: 'cover',
        effect: 'none',
      },
      {
        id: 'slot-2',
        shotNumber: 2,
        x: 24,
        y: 500,
        width: 352,
        height: 440,
        fit: 'cover',
        effect: photoSettings.blackAndWhiteEnabled ? 'black-and-white' : 'none',
      },
    ]
  } else {
    const left = 24
    const width = 400 - left * 2
    const top = 24
    const gap = 8
    const height = Math.floor((936 - gap * 2) / 3)
    slots = [1, 2, 3].map((shotNumber, index) => ({
      id: `slot-${shotNumber}`,
      shotNumber,
      x: left,
      y: top + index * (height + gap),
      width,
      height,
      fit: 'cover',
      effect:
        index === 1 && photoSettings.sepiaEnabled
          ? 'sepia'
          : index === 2 && photoSettings.blackAndWhiteEnabled
            ? 'black-and-white'
            : 'none',
    }))
  }

  const compositionWidth = isSingle ? 820 : 400
  const compositionHeight = isSingle ? 1180 : 1200

  const packComposition = {
    id: `comp-${template.templateId || 'classic'}`,
    name: template.customTitle || branding.eventTitle || event.name,
    width: compositionWidth,
    height: compositionHeight,
    background: template.background || '#0b0a09',
    overlayEnabled: Boolean(template.overlayEnabled),
    slots,
    texts: [
      {
        id: 'branding-title',
        text: (branding.eventTitle || event.name || 'PEHCHAAN').toUpperCase(),
        x: compositionWidth / 2,
        y: isSingle ? 920 : 1040,
        font: '600 36px "Cormorant Garamond", serif',
        color: branding.accentColor || '#e8d5a3',
        align: 'center',
        baseline: 'middle',
      },
      {
        id: 'branding-sub',
        text: (branding.eventSubtitle || branding.schoolName || 'PHOTOBOOTH').toUpperCase(),
        x: compositionWidth / 2,
        y: isSingle ? 970 : 1090,
        font: '500 16px Outfit, system-ui, sans-serif',
        color: '#c6a15b',
        align: 'center',
        baseline: 'middle',
      },
    ],
  }

  const actualConsentMode = privacy.schoolMode && privacy.consentMode === 'none' ? 'notice' : privacy.consentMode

  return {
    id: `pack_${event.eventId}`,
    version: '1.0.0',
    eventName: branding.eventTitle || event.name,
    language: 'en',
    shotCount,
    betweenShotPauseMs: photoSettings.betweenShotPauseMs || 0,
    mirrorOutput: Boolean(photoSettings.mirrorOutput),
    blackAndWhiteEnabled: Boolean(photoSettings.blackAndWhiteEnabled),
    sepiaEnabled: Boolean(photoSettings.sepiaEnabled),
    whatsappEnabled: privacy.schoolMode ? false : Boolean(delivery.whatsappEnabled),
    emailEnabled: Boolean(delivery.emailEnabled),
    cloudQrEnabled: Boolean(delivery.cloudQrEnabled),
    printEnabled: Boolean(delivery.printEnabled),
    schoolMode: Boolean(privacy.schoolMode),
    consentMode: actualConsentMode || 'none',
    privacyNoticeText:
      privacy.privacyNoticeText ||
      'Privacy Notice: Photos taken during this session are saved privately and never published without consent.',
    retentionHours: privacy.retentionHours || 72,
    publicGalleryEnabled: privacy.schoolMode ? false : Boolean(privacy.publicGalleryEnabled),
    payment: {
      enabled: payment.mode !== 'disabled',
      mode: payment.mode || 'organizer',
      amount: payment.mode === 'individual' ? payment.amount || 0 : 0,
      currency: payment.currency || 'INR',
      upiId: payment.upiId || '',
      merchantName: payment.merchantName || branding.schoolName || '',
      timeoutSeconds: payment.timeoutSeconds || 300,
    },
    schoolName: branding.schoolName || '',
    schoolLogoUrl: branding.schoolLogoUrl || null,
    accentColor: branding.accentColor || '#c6a15b',
    primaryColor: branding.accentColor || '#c6a15b',
    secondaryColor: '#1c1b18',
    backgroundColor: template.background || '#0b0a09',
    eventSubtitle: branding.eventSubtitle || '',
    countdownSeconds: (photoSettings as any).countdownSeconds || 3,
    staffPin: staffPin && /^\d{6}$/.test(staffPin.trim()) ? staffPin.trim() : '482917',
    composition: packComposition,
    singleShotComposition: isSingle ? packComposition : undefined,
    cardBack: {
      enabled: template.cardBackEnabled !== false,
      headline: template.cardBackHeadline || 'Thank you for coming',
      message: template.cardBackMessage || 'A special keepsake from your unforgettable day.',
      showQr: template.cardBackShowQr !== false,
      bgColor: template.cardBackBgColor || '#ffffff',
      textColor: template.cardBackTextColor || '#0f172a',
      style: template.cardBackStyle || 'note_lines',
      showLines: template.cardBackShowLines !== false,
    },
  }
}

export class EventConfigurationRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): EventConfigurationRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      schoolId: row.school_id ?? null,
      branding: row.branding_json ? JSON.parse(row.branding_json) : ({} as any),
      photoSettings: row.photo_settings_json ? JSON.parse(row.photo_settings_json) : ({} as any),
      template: {
        templateId: row.template_id || 'school-classic',
        background: '#ffffff',
        overlayEnabled: true,
        frameEdge: 'fine',
        printedDate: '',
        customTitle: '',
        customSubtitle: '',
        cardBackEnabled: true,
        cardBackHeadline: 'Thank you for coming',
        cardBackMessage: 'A special keepsake from your unforgettable day.',
        cardBackShowQr: true,
        cardBackBgColor: '#ffffff',
        cardBackTextColor: '#0f172a',
        cardBackStyle: 'note_lines',
        cardBackShowLines: true,
        ...(row.template_customization_json ? JSON.parse(row.template_customization_json) : {}),
      },
      delivery: row.delivery_json ? JSON.parse(row.delivery_json) : ({} as any),
      payment: row.payment_json ? JSON.parse(row.payment_json) : ({} as any),
      privacy: row.privacy_json ? JSON.parse(row.privacy_json) : ({} as any),
      staffPin: row.staff_pin || '482917',
      eventPack: row.event_pack_json ? JSON.parse(row.event_pack_json) : ({} as any),
      status: row.status as 'incomplete' | 'complete',
      version: Number(row.version || 1),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  getConfiguration(eventId: string): EventConfigurationRecord | null {
    const row = this.db.prepare('SELECT * FROM event_configurations WHERE event_id = ?').get(eventId)
    if (!row) return null
    return this.mapRow(row)
  }

  saveConfiguration(
    event: EventRecord,
    params: SaveEventConfigParams,
    schoolProfile?: { schoolName: string; logoUrl?: string | null; staffPin?: string | null } | null
  ): EventConfigurationRecord {
    const existing = this.getConfiguration(event.eventId)
    const defaults = getDefaultConfiguration(event, schoolProfile)

    const branding: EventBrandingConfig = {
      ...defaults.branding,
      ...(existing ? existing.branding : {}),
      ...(params.branding || {}),
    }

    const photoSettings: EventPhotoConfig = {
      ...defaults.photoSettings,
      ...(existing ? existing.photoSettings : {}),
      ...(params.photoSettings || {}),
    }

    const template: EventTemplateConfig = {
      ...defaults.template,
      ...(existing ? existing.template : {}),
      ...(params.template || {}),
    }

    const delivery: EventDeliveryConfig = {
      ...defaults.delivery,
      ...(existing ? existing.delivery : {}),
      ...(params.delivery || {}),
    }

    const payment: EventPaymentConfig = {
      ...defaults.payment,
      ...(existing ? existing.payment : {}),
      ...(params.payment || {}),
    }

    const privacy: EventPrivacyConfig = {
      ...defaults.privacy,
      ...(existing ? existing.privacy : {}),
      ...(params.privacy || {}),
    }

    const staffPin = params.staffPin || (existing ? existing.staffPin : defaults.staffPin) || '482917'

    // Validation
    if (!branding.eventTitle?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Event Title in Branding is required.')
    }

    if (payment.mode === 'individual') {
      if (!payment.amount || payment.amount <= 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Individual Payment mode requires a positive amount.')
      }
      if (!payment.upiId || !payment.upiId.includes('@')) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Individual Payment requires a valid UPI ID (e.g. school@bank).')
      }
    }

    // School mode safety
    if (privacy.schoolMode) {
      privacy.publicGalleryEnabled = false
      delivery.whatsappEnabled = false
      if (privacy.consentMode === 'none') {
        privacy.consentMode = 'notice'
      }
    }

    const eventPack = generateEventPack(event, {
      branding,
      photoSettings,
      template,
      delivery,
      payment,
      privacy,
      staffPin,
    })

    const configId = existing ? existing.id : `cfg_${event.eventId}`
    const now = Date.now()
    const nextVersion = existing ? existing.version + 1 : 1
    const status: 'complete' | 'incomplete' = 'complete'

    const templateCustomization = {
      background: template.background,
      overlayEnabled: template.overlayEnabled,
      customTitle: template.customTitle,
      customSubtitle: template.customSubtitle,
      frameEdge: template.frameEdge || 'fine',
      printedDate: template.printedDate || '',
      cardBackEnabled: template.cardBackEnabled !== false,
      cardBackHeadline: template.cardBackHeadline || 'Thank you for coming',
      cardBackMessage: template.cardBackMessage || 'A special keepsake from your unforgettable day.',
      cardBackShowQr: template.cardBackShowQr !== false,
      cardBackBgColor: template.cardBackBgColor || '#ffffff',
      cardBackTextColor: template.cardBackTextColor || '#0f172a',
      cardBackStyle: template.cardBackStyle || 'note_lines',
      cardBackShowLines: template.cardBackShowLines !== false,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO event_configurations (
            id, event_id, school_id, branding_json, photo_settings_json, template_id,
            template_customization_json, delivery_json, payment_json, privacy_json,
            staff_pin, event_pack_json, status, version, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_id) DO UPDATE SET
            branding_json = excluded.branding_json,
            photo_settings_json = excluded.photo_settings_json,
            template_id = excluded.template_id,
            template_customization_json = excluded.template_customization_json,
            delivery_json = excluded.delivery_json,
            payment_json = excluded.payment_json,
            privacy_json = excluded.privacy_json,
            staff_pin = excluded.staff_pin,
            event_pack_json = excluded.event_pack_json,
            status = excluded.status,
            version = excluded.version,
            updated_at = excluded.updated_at`
        )
        .run(
          configId,
          event.eventId,
          event.schoolId || 'sch_default',
          JSON.stringify(branding),
          JSON.stringify(photoSettings),
          template.templateId || 'classic-strip',
          JSON.stringify(templateCustomization),
          JSON.stringify(delivery),
          JSON.stringify(payment),
          JSON.stringify(privacy),
          staffPin,
          JSON.stringify(eventPack),
          status,
          nextVersion,
          existing ? existing.createdAt : now,
          now
        )

      // Also update events table pack snapshot & version
      this.db
        .prepare(
          `UPDATE events
           SET event_pack_id = ?, event_pack_version = ?, event_pack_snapshot_json = ?, updated_at = ?
           WHERE event_id = ?`
        )
        .run(
          `pack_${event.eventId}`,
          '1.0.0',
          JSON.stringify(eventPack),
          now,
          event.eventId
        )
    })

    tx()

    return this.getConfiguration(event.eventId)!
  }
}

export function validateServerEventPack(pack: any): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!pack || typeof pack !== 'object') {
    return { ok: false, errors: ['Event Pack must be a JSON object.'] }
  }

  if (!pack.id || typeof pack.id !== 'string') errors.push('Event Pack id is required.')
  if (!pack.eventName || typeof pack.eventName !== 'string') errors.push('Event Pack eventName is required.')
  if (!pack.version || typeof pack.version !== 'string') errors.push('Event Pack version is required.')
  if (![1, 2, 3].includes(pack.shotCount)) errors.push('Event Pack shotCount must be 1, 2, or 3.')
  if (!pack.composition || typeof pack.composition !== 'object') {
    errors.push('Event Pack composition is required.')
  } else {
    if (!pack.composition.width || !pack.composition.height) errors.push('Composition dimensions invalid.')
    if (!Array.isArray(pack.composition.slots) || pack.composition.slots.length !== pack.shotCount) {
      errors.push(`Composition slots (${pack.composition.slots?.length}) must match shot count (${pack.shotCount}).`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}
