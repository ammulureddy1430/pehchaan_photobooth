export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'superadmin'
  createdAt?: number
  updatedAt?: number
}

export interface SchoolProfile {
  id: string
  schoolName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  logoUrl: string | null
  createdAt?: number
  updatedAt?: number
}

export interface AdminEvent {
  eventId: string
  schoolId?: string | null
  schoolName?: string
  name: string
  description?: string | null
  eventDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue: string
  status: 'draft' | 'live' | 'paused' | 'ended' | 'cancelled' | 'active' | 'completed'
  eventPackId?: string | null
  eventPackVersion?: string | null
  sessionCount: number
  photoCount?: number
  deliveryCount?: number
  paymentMode?: 'organizer' | 'individual' | 'disabled'
  createdAt: number
  updatedAt: number
}

export interface CreateEventInput {
  name: string
  eventDate: string
  startTime: string
  endTime: string
  venue: string
  description?: string
}

export interface UpdateEventInput {
  name?: string
  eventDate?: string
  startTime?: string
  endTime?: string
  venue?: string
  description?: string
  status?: 'draft' | 'live' | 'paused' | 'ended' | 'cancelled'
}

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
  countdownSeconds?: number
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
  requireConsent?: boolean
  allowGuestShare?: boolean
}

export interface EventConfiguration {
  id: string
  eventId: string
  schoolId?: string | null
  branding: EventBrandingConfig
  photoSettings: EventPhotoConfig
  template: EventTemplateConfig
  delivery: EventDeliveryConfig
  payment: EventPaymentConfig
  privacy: EventPrivacyConfig
  staffPin?: string
  eventPack?: Record<string, unknown>
  status: 'incomplete' | 'complete'
  version: number
  createdAt: number
  updatedAt: number
}

export interface SaveEventConfigInput {
  branding: Partial<EventBrandingConfig>
  photoSettings: Partial<EventPhotoConfig>
  template: Partial<EventTemplateConfig>
  delivery: Partial<EventDeliveryConfig>
  payment: Partial<EventPaymentConfig>
  privacy: Partial<EventPrivacyConfig>
  staffPin?: string
}

export interface DashboardStats {
  totalEvents: number
  activeEvents: number
  completedEvents: number
  totalSessions: number
  totalPhotos?: number
  totalDeliveries?: number
  recentEvents: Array<{
    eventId: string
    name: string
    status: string
    eventDate?: string | null
    venue?: string
    sessionCount?: number
    photoCount?: number
    paymentMode?: 'organizer' | 'individual' | 'disabled'
    createdAt: number
  }>
}

export interface ActivationCheckItem {
  key: string
  label: string
  passed: boolean
}

export interface EventActivationData {
  eventId: string
  eventName: string
  schoolName: string
  eventDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue?: string | null
  eventStatus: string
  configurationStatus: 'incomplete' | 'complete'
  activationStatus: 'not_ready' | 'ready' | 'active_on_booth'
  activeDeviceCount: number
  activationToken: string
  qrPayload: string
  qrSvg: string
  qrDataUrl: string
  staffPin?: string
  readiness: {
    isReady: boolean
    checks: ActivationCheckItem[]
    errors?: string[]
  }
}

export type EventActivationDetails = EventActivationData

export interface BoothActivationResult {
  success: boolean
  event: AdminEvent
  config: EventConfiguration
  eventPack: Record<string, unknown>
  staffPin?: string
}

// ----------------------------------------------------
// STEP 5: EVENT DASHBOARD TYPES
// ----------------------------------------------------

export interface EventSummaryStats {
  totalSessions: number
  completedSessions: number
  inProgressSessions: number
  failedSessions: number
  totalPhotos: number
  processedPhotos: number
  totalDeliveries: number
  successfulDeliveries: number
  pendingDeliveries: number
  failedDeliveries: number
  totalPayments: number
  successfulPayments: number
  pendingPayments: number
  failedPayments: number
  totalPaymentAmount: number
  paymentMode: 'organizer' | 'individual' | 'disabled'
  activeBooths: number
  pendingSync: number
}

export interface DashboardSessionItem {
  sessionId: string
  eventId: string
  deviceId: string
  shotCount: number
  language: string
  status: 'completed' | 'in_progress' | 'abandoned' | string
  photoCount: number
  deliveryStatus: 'success' | 'pending' | 'failed' | string
  paymentStatus: 'not_required' | 'success' | 'pending' | 'failed' | 'disabled' | string
  syncStatus: string
  createdAt: number
  updatedAt: number
}

export interface DashboardPhotoItem {
  assetId: string
  sessionId: string
  assetRole: string
  shotNumber: number | null
  filename: string
  byteSize: number
  createdAt: number
  url: string
}

export interface DashboardDeliveryChannelInfo {
  attempted: number
  success: number
  pending: number
  failed: number
  enabled: boolean
  disabledBySchoolMode?: boolean
}

export interface DashboardDeliveryStats {
  totalAttempted: number
  successful: number
  pending: number
  failed: number
  channels: Record<'print' | 'qr' | 'whatsapp' | 'email' | string, DashboardDeliveryChannelInfo>
  schoolMode: boolean
}

export interface DashboardPaymentItem {
  id: string
  sessionId: string
  deviceId?: string
  paymentReference: string
  amount: number
  currency: string
  mode: string
  status: string
  provider: string
  upiId?: string | null
  merchantName?: string | null
  createdAt: number
  verifiedAt?: number | null
  errorMessage?: string | null
}

export interface DashboardPaymentStats {
  mode: 'organizer' | 'individual' | 'disabled'
  currency: string
  amount: number
  totalAttempts: number
  successful: number
  pending: number
  failed: number
  totalRevenue: number
  recentPayments: DashboardPaymentItem[]
}

export interface DashboardDeviceItem {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  status: 'active' | 'revoked'
  registeredAt: number
  lastSeen: number
  lastHeartbeat: number | null
  activatedAt: number
  lastActiveAt: number
  isOnline: boolean
  syncStatus: 'synced' | 'pending' | 'syncing'
  pendingOutboxCount: number
}

export interface DashboardSyncStats {
  status: 'healthy' | 'warning' | 'critical'
  totalSyncedItems: number
  pendingItems: number
  failedItems: number
  lastSyncAt: number | null
  devicesWithPendingSync: number
}

export interface DashboardActivityItem {
  id: string
  eventId: string
  deviceId?: string | null
  sessionId?: string | null
  activityType: string
  title: string
  description?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: number
}

export interface DashboardPerformanceStats {
  completionRate: number | null
  avgPhotosPerSession: number | null
  deliverySuccessRate: number | null
  paymentSuccessRate: number | null
  syncSuccessRate: number | null
}

export interface EventDashboardData {
  event: {
    eventId: string
    name: string
    description?: string | null
    eventDate?: string | null
    startTime?: string | null
    endTime?: string | null
    venue: string
    status: 'draft' | 'live' | 'paused' | 'ended' | 'cancelled'
    schoolId?: string | null
    schoolName: string
    createdAt: number
    updatedAt: number
  }
  summary: EventSummaryStats
  sessions: DashboardSessionItem[]
  photos: {
    totalCaptured: number
    processedPhotos: number
    pendingSyncPhotos: number
    recentPhotos: DashboardPhotoItem[]
  }
  deliveries: DashboardDeliveryStats
  payments: DashboardPaymentStats
  devices: DashboardDeviceItem[]
  sync: DashboardSyncStats
  recentActivity: DashboardActivityItem[]
  performance: DashboardPerformanceStats
}

export type InquiryStatus = 'new' | 'contacted' | 'quoted' | 'confirmed' | 'archived'

export interface InquiryItem {
  id: string
  organisation: string
  contactName: string
  whatsappNumber: string
  email: string | null
  city: string
  eventDateText: string | null
  audienceBand: string
  setting: string
  requirements: string | null
  customWishes: string | null
  status: InquiryStatus
  notes: string | null
  metadata?: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface InquiryStats {
  total: number
  new: number
  contacted: number
  quoted: number
  confirmed: number
  archived: number
}

export type AdminRoute =
  | '/admin/login'
  | '/admin/dashboard'
  | '/admin/events'
  | '/admin/profile'
  | string
