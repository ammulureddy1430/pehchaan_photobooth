import type { OutboxItem, SyncStats } from './types'
import {
  listOutboxItems,
  putOutboxItem,
  getPhoto,
  getDerived,
  getCompletedSession,
  saveCompletedSession,
} from '../lib/photoStore'
import { apiClient, ApiClientError, PehchaanApiClient } from '../api/client'
import { getLocalDeviceId, getLocalDeviceToken } from '../api/deviceIdentity'

export type SyncListener = (stats: SyncStats) => void

export class SyncWorker {
  private isProcessing = false
  private client: PehchaanApiClient
  private listeners = new Set<SyncListener>()
  private isRevoked = false
  private lastSyncTime: number | null = null
  private lastError: string | null = null
  private initialized = false
  private unbindNetworkListeners?: () => void

  constructor(client: PehchaanApiClient = apiClient) {
    this.client = client
  }

  public init(): void {
    if (this.initialized) return
    this.initialized = true

    // 1. Crash recovery: reset any stuck SYNCING items to PENDING
    void this.recoverStuckItems()

    // 2. Network listeners
    if (typeof window !== 'undefined') {
      const handleOnline = () => {
        void this.process()
      }
      window.addEventListener('online', handleOnline)
      this.unbindNetworkListeners = () => {
        window.removeEventListener('online', handleOnline)
      }
    }
  }

  public destroy(): void {
    if (this.unbindNetworkListeners) {
      this.unbindNetworkListeners()
      this.unbindNetworkListeners = undefined
    }
    this.listeners.clear()
    this.initialized = false
  }

  public resetRevocation(): void {
    this.isRevoked = false
    this.lastError = null
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    void this.notifyListeners()
    return () => this.listeners.delete(listener)
  }

  public async getStats(): Promise<SyncStats> {
    const items = await listOutboxItems()
    let pendingCount = 0
    let syncingCount = 0
    let syncedCount = 0
    let failedCount = 0

    for (const item of items) {
      if (item.status === 'SYNCED') {
        syncedCount++
      } else if (item.status === 'FAILED' || item.permanentFailure) {
        failedCount++
      } else if (item.status === 'SYNCING') {
        syncingCount++
      } else {
        pendingCount++
      }
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    return {
      pendingCount,
      syncingCount,
      syncedCount,
      failedCount,
      totalCount: items.length,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      isSyncing: this.isProcessing,
      isOnline,
      isRevoked: this.isRevoked,
    }
  }

  private async notifyListeners(): Promise<void> {
    const stats = await this.getStats()
    for (const listener of this.listeners) {
      try {
        listener(stats)
      } catch (err) {
        console.error('[SyncWorker] Error in listener:', err)
      }
    }
  }

  public async recoverStuckItems(): Promise<void> {
    try {
      const items = await listOutboxItems()
      for (const item of items) {
        if (item.status === 'SYNCING') {
          item.status = 'PENDING'
          item.updatedAt = Date.now()
          await putOutboxItem(item)
        }
      }
    } catch (err) {
      console.error('[SyncWorker] Error recovering stuck items:', err)
    }
  }

  private async ensureDeviceRegistered(): Promise<boolean> {
    if (this.isRevoked) return false
    const token = getLocalDeviceToken()
    if (token) return true

    const deviceId = getLocalDeviceId()
    try {
      await this.client.registerDevice({
        deviceId,
        deviceName: 'Photobooth Booth 1',
        platform: 'chrome-prototype',
        appVersion: '0.1.0',
      })
      return true
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'DEVICE_REVOKED') {
        this.isRevoked = true
        this.lastError = 'Device is revoked'
        return false
      }
      // Transient registration failure
      this.lastError = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  private async ensureEventExists(eventId: string, packVersion?: string | null): Promise<boolean> {
    try {
      await this.client.createEvent({
        eventId,
        name: `Event ${eventId}`,
        status: 'live',
        eventPackId: eventId.replace(/^evt_/, ''),
        eventPackVersion: packVersion || '1.0.0',
      })
      return true
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === 'DEVICE_REVOKED' || err.status === 401 || err.status === 403)) {
        this.isRevoked = true
        this.lastError = 'Device authentication is revoked or unauthorized'
        return false
      }
      return false
    }
  }

  public async forceSync(): Promise<{ processed: number; errors: number }> {
    // Reset nextRetryAt on all RETRY_WAIT items so they are processed immediately
    const items = await listOutboxItems()
    const now = Date.now()
    for (const item of items) {
      if (item.status === 'RETRY_WAIT' && !item.permanentFailure) {
        item.status = 'PENDING'
        item.nextRetryAt = now
        item.updatedAt = now
        await putOutboxItem(item)
      }
    }

    return this.process()
  }

  public async process(): Promise<{ processed: number; errors: number }> {
    if (this.isProcessing || this.isRevoked) {
      return { processed: 0, errors: 0 }
    }

    this.isProcessing = true
    void this.notifyListeners()

    let processedCount = 0
    let errorCount = 0

    try {
      const isRegistered = await this.ensureDeviceRegistered()
      if (!isRegistered) {
        return { processed: 0, errors: 1 }
      }

      const allItems = await listOutboxItems()
      const now = Date.now()

      // Filter eligible items
      const pendingItems = allItems.filter((item) => {
        if (item.permanentFailure) return false
        if (item.status === 'PENDING') return true
        if (item.status === 'RETRY_WAIT' && now >= item.nextRetryAt) return true
        return false
      })

      if (pendingItems.length === 0) {
        return { processed: 0, errors: 0 }
      }

      // Group by sessionId
      const sessionMap = new Map<string, { sessionItem?: OutboxItem; assetItems: OutboxItem[] }>()
      for (const item of allItems) {
        if (!sessionMap.has(item.sessionId)) {
          sessionMap.set(item.sessionId, { assetItems: [] })
        }
        const group = sessionMap.get(item.sessionId)!
        if (item.op === 'SESSION_CREATE') {
          group.sessionItem = item
        } else if (item.op === 'ASSET_UPLOAD') {
          group.assetItems.push(item)
        }
      }

      // Process each session in order: SESSION_CREATE first, then ASSET_UPLOAD
      for (const [sessionId, group] of sessionMap.entries()) {
        if (this.isRevoked) break

        const sessionItem = group.sessionItem

        // 1. Handle SESSION_CREATE if present and not yet SYNCED
        if (sessionItem && sessionItem.status !== 'SYNCED' && !sessionItem.permanentFailure) {
          if (sessionItem.status === 'PENDING' || (sessionItem.status === 'RETRY_WAIT' && now >= sessionItem.nextRetryAt)) {
            sessionItem.status = 'SYNCING'
            sessionItem.updatedAt = Date.now()
            await putOutboxItem(sessionItem)

            await this.ensureEventExists(sessionItem.eventId, sessionItem.sessionPayload?.eventPackVersion)

            try {
              const sessionRes = await this.client.createSession(sessionItem.eventId, {
                sessionId: sessionItem.sessionId,
                shotCount: sessionItem.sessionPayload?.shotCount || 3,
                language: sessionItem.sessionPayload?.language || 'en',
                status: (sessionItem.sessionPayload?.status as any) || 'completed',
                eventPackVersion: sessionItem.sessionPayload?.eventPackVersion,
                metadata: sessionItem.sessionPayload?.metadata,
              })

              const galleryPath = sessionRes.galleryUrl || sessionRes.session?.galleryUrl || `/gallery/${sessionItem.sessionId}`
              const fullGalleryUrl = galleryPath.startsWith('http') ? galleryPath : `${this.client.getBaseUrl()}${galleryPath}`

              // Update local completed session record with cloud sync status and gallery URL
              try {
                const completedRecord = await getCompletedSession(sessionItem.sessionId)
                if (completedRecord) {
                  completedRecord.syncedAt = Date.now()
                  completedRecord.galleryUrl = fullGalleryUrl
                  await saveCompletedSession(completedRecord)
                }
              } catch (recErr) {
                console.warn('[SyncWorker] Could not update completed session metadata:', recErr)
              }

              sessionItem.status = 'SYNCED'
              sessionItem.updatedAt = Date.now()
              sessionItem.lastError = null
              await putOutboxItem(sessionItem)
              processedCount++
              this.lastSyncTime = Date.now()
            } catch (err) {
              errorCount++
              this.handleItemError(sessionItem, err)
              await putOutboxItem(sessionItem)
              // If session creation failed, do not proceed with assets for this session
              continue
            }
          } else {
            // Session is waiting for retry delay
            continue
          }
        }

        // If session item is still not SYNCED, skip its assets (Strict Order Guarantee)
        if (sessionItem && sessionItem.status !== 'SYNCED') {
          continue
        }

        // 2. Handle ASSET_UPLOAD items for this session
        for (const assetItem of group.assetItems) {
          if (this.isRevoked) break
          if (assetItem.status === 'SYNCED' || assetItem.permanentFailure) continue
          if (assetItem.status === 'RETRY_WAIT' && now < assetItem.nextRetryAt) continue

          assetItem.status = 'SYNCING'
          assetItem.updatedAt = Date.now()
          await putOutboxItem(assetItem)

          try {
            let blob: Blob | null = null

            if (assetItem.localPhotoId) {
              const photo = await getPhoto(assetItem.localPhotoId)
              if (photo) {
                blob = assetItem.assetRole === 'thumbnail' && photo.thumbnail ? photo.thumbnail : photo.original
              }
            } else if (assetItem.localDerivedId) {
              const derived = await getDerived(assetItem.localDerivedId)
              if (derived) {
                blob = derived.blob
              }
            }

            if (!blob) {
              // Local blob not found
              assetItem.status = 'FAILED'
              assetItem.permanentFailure = true
              assetItem.lastError = `Local media file not found for ${assetItem.id}`
              assetItem.updatedAt = Date.now()
              await putOutboxItem(assetItem)
              errorCount++
              continue
            }

            await this.client.createAsset(
              sessionId,
              {
                assetId: assetItem.assetId,
                assetRole: assetItem.assetRole || 'original',
                shotNumber: assetItem.shotNumber,
                filename: assetItem.filename || 'photo.jpg',
                contentType: assetItem.contentType || 'image/jpeg',
              },
              blob
            )

            assetItem.status = 'SYNCED'
            assetItem.updatedAt = Date.now()
            assetItem.lastError = null
            await putOutboxItem(assetItem)
            processedCount++
            this.lastSyncTime = Date.now()
          } catch (err) {
            errorCount++
            this.handleItemError(assetItem, err)
            await putOutboxItem(assetItem)
          }
        }
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      errorCount++
    } finally {
      this.isProcessing = false
      void this.notifyListeners()
    }

    return { processed: processedCount, errors: errorCount }
  }

  private handleItemError(item: OutboxItem, err: unknown): void {
    const errorMsg = err instanceof Error ? err.message : String(err)
    this.lastError = errorMsg
    item.lastError = errorMsg
    item.updatedAt = Date.now()

    if (err instanceof ApiClientError) {
      if (err.code === 'DEVICE_REVOKED' || err.status === 403 || err.status === 401) {
        this.isRevoked = true
        item.status = 'FAILED'
        item.permanentFailure = true
        return
      }

      // Permanent client errors (400 validation, 404 missing resource)
      if (err.status === 400 || err.status === 404) {
        item.status = 'FAILED'
        item.permanentFailure = true
        return
      }
    }

    // Transient errors: 5xx, NetworkError, TypeError, timeout -> Exponential Backoff
    item.retryCount = (item.retryCount || 0) + 1
    const delayMs = Math.min(60000, 1000 * Math.pow(2, Math.min(item.retryCount - 1, 6)))
    item.nextRetryAt = Date.now() + delayMs
    item.status = 'RETRY_WAIT'
  }
}

export const syncWorker = new SyncWorker()
