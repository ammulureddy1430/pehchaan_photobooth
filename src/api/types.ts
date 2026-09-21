export type DeviceStatus = 'active' | 'revoked'
export type EventStatus = 'live' | 'paused' | 'ended'
export type SessionStatus = 'completed' | 'in_progress' | 'abandoned'
export type AssetRole = 'original' | 'thumbnail' | 'composed' | 'print'

export interface ApiDeviceInfo {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  status: DeviceStatus
  registeredAt: number
  lastSeen: number
  lastHeartbeat: number | null
  revokedAt: number | null
  metadata?: Record<string, unknown> | null
}

export interface RegisterDeviceRequest {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  metadata?: Record<string, unknown>
}

export interface RegisterDeviceResponse {
  device: ApiDeviceInfo
  token: string
  isNew: boolean
}

export interface HeartbeatRequest {
  batteryLevel?: number
  appVersion?: string
  freeDiskBytes?: number
  status?: string
  metadata?: Record<string, unknown>
}

export interface HeartbeatResponse {
  ok: boolean
  deviceId: string
  serverTime: number
  status: DeviceStatus
  device: ApiDeviceInfo
}

export interface ApiEventInfo {
  eventId: string
  name: string
  status: EventStatus
  eventPackId: string | null
  eventPackVersion: string | null
  eventPackSnapshot: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface CreateEventRequest {
  eventId?: string
  name: string
  status?: EventStatus
  eventPackId?: string | null
  eventPackVersion?: string | null
  eventPackSnapshot?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export interface CreateEventResponse {
  event: ApiEventInfo
  isNew: boolean
}

export interface ApiSessionInfo {
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
  galleryUrl?: string
}

export interface CreateSessionRequest {
  sessionId: string
  shotCount?: number
  language?: string
  status?: SessionStatus
  eventPackVersion?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: number
}

export interface CreateSessionResponse {
  session: ApiSessionInfo
  idempotent: boolean
  galleryUrl?: string
}

export interface ApiAssetInfo {
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

export interface CreateAssetRequest {
  assetId?: string
  assetRole: AssetRole
  shotNumber?: number | null
  filename: string
  contentType?: string
  createdAt?: number
}

export interface CreateAssetResponse {
  asset: ApiAssetInfo
  idempotent: boolean
}

export interface SessionWithAssetsResponse {
  session: ApiSessionInfo
  assets: ApiAssetInfo[]
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    status: number
    details?: unknown
  }
}
