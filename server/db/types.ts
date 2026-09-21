export type DeviceStatus = 'active' | 'revoked'

export interface DeviceRecord {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  status: DeviceStatus
  registeredAt: number
  lastSeen: number
  lastHeartbeat: number | null
  revokedAt: number | null
  metadata: Record<string, unknown> | null
}

export type SafeDeviceInfo = Omit<DeviceRecord, 'metadata'> & {
  metadata?: Record<string, unknown> | null
}

export type EventStatus = 'draft' | 'live' | 'paused' | 'ended' | 'cancelled'

export interface EventRecord {
  eventId: string
  schoolId?: string | null
  name: string
  description?: string | null
  eventDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue?: string | null
  status: EventStatus
  eventPackId: string | null
  eventPackVersion: string | null
  eventPackSnapshot: Record<string, unknown> | null
  activationToken?: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export type SessionStatus = 'completed' | 'in_progress' | 'abandoned'

export interface SessionRecord {
  sessionId: string
  eventId: string
  deviceId: string
  shotCount: number
  language: string
  status: SessionStatus
  eventPackVersion: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export type AssetRole = 'original' | 'thumbnail' | 'composed' | 'print'

export interface AssetRecord {
  assetId: string
  sessionId: string
  deviceId: string
  assetRole: AssetRole
  shotNumber: number | null
  filename: string
  contentType: string
  byteSize: number
  checksum: string
  storageKey: string
  createdAt: number
}

export type DbPaymentStatus =
  | 'not_required'
  | 'created'
  | 'pending'
  | 'initiated'
  | 'processing'
  | 'paid'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'verification_required'

export interface DbPaymentRecord {
  id: string
  eventId: string
  sessionId: string
  deviceId: string
  paymentReference: string
  amount: number
  currency: string
  mode: string
  status: DbPaymentStatus
  provider: string
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
  createdAt: number
  updatedAt: number
  verifiedAt?: number | null
  errorMessage?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CreatePaymentParams {
  paymentId?: string
  eventId: string
  sessionId: string
  deviceId?: string
  paymentReference?: string
  amount: number
  currency?: string
  mode?: string
  status?: DbPaymentStatus
  provider?: string
  upiId?: string
  merchantName?: string
  gatewayProvider?: string
  gatewayOrderId?: string
  gatewayPaymentId?: string
  webhookEventId?: string
  webhookReceivedAt?: number
  expiresAt?: number
  failureReason?: string
  qrPayload?: string
  qrDataUrl?: string
  metadata?: Record<string, unknown>
  createdAt?: number
}

export interface AdminRecord {
  id: string
  email: string
  passwordHash: string
  salt: string
  name: string
  role: 'admin' | 'superadmin' | string
  schoolId?: string | null
  createdAt: number
  updatedAt: number
}

export type SafeAdminRecord = Omit<AdminRecord, 'passwordHash' | 'salt'>

export interface SchoolProfileRecord {
  id: string
  schoolName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  logoUrl: string | null
  createdAt: number
  updatedAt: number
}

export type DbDeliveryChannel = 'print' | 'qr' | 'whatsapp' | 'email' | 'export'
export type DbDeliveryStatus = 'success' | 'pending' | 'failed' | 'attempted'

export interface DbDeliveryRecord {
  id: string
  eventId: string
  sessionId?: string | null
  deviceId?: string | null
  channel: DbDeliveryChannel
  status: DbDeliveryStatus
  recipientMasked?: string | null
  errorMessage?: string | null
  createdAt: number
  updatedAt: number
}

export type ActivityType =
  | 'event_created'
  | 'event_updated'
  | 'event_activated'
  | 'booth_activated'
  | 'session_created'
  | 'photos_captured'
  | 'delivery_completed'
  | 'delivery_failed'
  | 'payment_completed'
  | 'payment_failed'
  | 'sync_completed'
  | 'event_paused'
  | 'event_resumed'
  | 'event_ended'
  | 'event_cancelled'

export interface EventActivityRecord {
  id: string
  eventId: string
  schoolId?: string | null
  deviceId?: string | null
  sessionId?: string | null
  activityType: ActivityType | string
  title: string
  description?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: number
}
