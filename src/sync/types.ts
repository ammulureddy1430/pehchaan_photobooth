import type { AssetRole } from '../api/types'

export type OutboxOpType = 'SESSION_CREATE' | 'ASSET_UPLOAD'
export type OutboxStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'RETRY_WAIT' | 'FAILED'

export interface OutboxItem {
  id: string
  op: OutboxOpType
  status: OutboxStatus
  sessionId: string
  eventId: string
  deviceId: string
  assetId?: string
  assetRole?: AssetRole
  shotNumber?: number | null
  filename?: string
  contentType?: string
  localPhotoId?: string
  localDerivedId?: string
  retryCount: number
  nextRetryAt: number
  createdAt: number
  updatedAt: number
  lastError?: string | null
  permanentFailure?: boolean
  sessionPayload?: {
    shotCount: number
    language: string
    status: string
    eventPackVersion?: string | null
    metadata?: Record<string, unknown> | null
  }
}

export interface SyncStats {
  pendingCount: number
  syncingCount: number
  syncedCount: number
  failedCount: number
  totalCount: number
  lastSyncTime: number | null
  lastError: string | null
  isSyncing: boolean
  isOnline: boolean
  isRevoked: boolean
}

export interface CompletedSessionRecord {
  id: string
  mode: number
  photoIds: string[]
  kind: 'guest' | 'test'
  packId: string
  packVersion: string
  language: string
  createdAt: number
  syncedAt?: number | null
  galleryUrl?: string | null
  paymentRequired?: boolean
  paymentMode?: import('../eventPack/types').PaymentMode
  paymentStatus?: import('../types').PaymentStatus
  paymentReference?: string | null
  paymentAmount?: number | null
}
