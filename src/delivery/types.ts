export type DeliveryChannel = 'whatsapp' | 'email' | 'qr' | 'export' | 'print'

export type DeliveryStatus =
  | 'NOT_AVAILABLE'
  | 'WAITING_FOR_SYNC'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'DISABLED'

export interface DeliveryRecord {
  id: string
  sessionId: string
  channel: DeliveryChannel
  status: DeliveryStatus
  target?: string | null
  galleryUrl?: string | null
  error?: string | null
  createdAt: number
  updatedAt: number
}

export interface WhatsAppDeliveryRequest {
  sessionId: string
  phoneNumber: string
  galleryUrl?: string | null
  eventName?: string
}

export interface WhatsAppDeliveryResult {
  success: boolean
  status: DeliveryStatus
  handoffUrl?: string
  directSent?: boolean
  message?: string
  error?: string
}

export interface EmailDeliveryRequest {
  sessionId: string
  email: string
  galleryUrl?: string | null
  eventName?: string
}

export interface EmailDeliveryResult {
  success: boolean
  status: DeliveryStatus
  mailtoUrl?: string
  error?: string
}

export interface CloudQrRequest {
  sessionId: string
  galleryUrl?: string | null
}

export interface CloudQrResult {
  success: boolean
  status: DeliveryStatus
  shareUrl?: string
  qrDataUrl?: string
  qrSvg?: string
  error?: string
}

export interface PhotosExportRequest {
  sessionId: string
  includeOriginals?: boolean
}

export interface PhotosExportResult {
  success: boolean
  status: DeliveryStatus
  exportedCount: number
  filenames: string[]
  error?: string
}

export interface PrintRequest {
  sessionId: string
  copies?: number
}

export interface PrintResult {
  success: boolean
  status: DeliveryStatus
  error?: string
}

export interface DeliverySessionSummary {
  sessionId: string
  createdAt: number
  syncedAt?: number | null
  isSynced: boolean
  galleryUrl?: string | null
  photoCount: number
  hasComposition: boolean
}

export interface DeliveryManagerStats {
  whatsappEnabled: boolean
  emailEnabled: boolean
  cloudQrEnabled: boolean
  printEnabled: boolean
  totalSessions: number
  syncedSessions: number
  pendingSyncSessions: number
  lastAction?: {
    channel: DeliveryChannel
    status: DeliveryStatus
    sessionId: string
    timestamp: number
    error?: string | null
  } | null
}
