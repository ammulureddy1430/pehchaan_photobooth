import type { CompletedSessionRecord } from '../sync/types'
import type { PhotoRecord } from '../types'

export const DEFAULT_RETENTION_HOURS = 72

export interface RetentionStatus {
  retentionHours: number
  hasExpiredPhotos: boolean
  expiredCount: number
  oldestAgeHours: number | null
  oldestTimestamp: number | null
  warningMessage: string | null
  eligibleForCleanupCount: number
  protectedUnsyncedCount: number
}

/**
 * Evaluates retention policy across photo records and completed sessions.
 *
 * Rules:
 * - Warning is triggered when records exceed retentionHours (default: 72 hours).
 * - Records that are unsynced or have only a local copy are NEVER marked eligible for auto-deletion.
 * - Only records that are uploaded (synced) or marked test/deleted can be cleaned up.
 */
export function evaluateRetentionStatus(
  photos: PhotoRecord[],
  completedSessions: CompletedSessionRecord[],
  retentionHours = DEFAULT_RETENTION_HOURS,
  now = Date.now()
): RetentionStatus {
  const maxAgeMs = retentionHours * 60 * 60 * 1000
  let oldestTimestamp: number | null = null
  let expiredCount = 0
  let eligibleForCleanupCount = 0
  let protectedUnsyncedCount = 0

  const syncedSessionIds = new Set(
    completedSessions.filter((s) => Boolean(s.syncedAt)).map((s) => s.id)
  )

  for (const photo of photos) {
    if (!photo.createdAt) continue

    if (oldestTimestamp === null || photo.createdAt < oldestTimestamp) {
      oldestTimestamp = photo.createdAt
    }

    const ageMs = now - photo.createdAt
    const isExpired = ageMs > maxAgeMs

    if (isExpired) {
      expiredCount++
      const isSynced = syncedSessionIds.has(photo.sessionId) || photo.uploadState === 'uploaded'
      const isTestOrDeleted = photo.sessionKind === 'test' || Boolean(photo.deletedAt)
      const isProtected = photo.uploadState === 'local_only' ||
                          photo.uploadState === 'queued' ||
                          photo.uploadState === 'failed_retryable'

      if ((isSynced || isTestOrDeleted) && !isProtected) {
        eligibleForCleanupCount++
      } else {
        protectedUnsyncedCount++
      }
    }
  }

  const oldestAgeHours = oldestTimestamp !== null
    ? Math.max(0, Math.round(((now - oldestTimestamp) / (60 * 60 * 1000)) * 10) / 10)
    : null

  const hasExpiredPhotos = expiredCount > 0
  let warningMessage: string | null = null

  if (hasExpiredPhotos) {
    warningMessage = `Retention Alert: ${expiredCount} photo(s) are older than the ${retentionHours}-hour policy.`
  }

  return {
    retentionHours,
    hasExpiredPhotos,
    expiredCount,
    oldestAgeHours,
    oldestTimestamp,
    warningMessage,
    eligibleForCleanupCount,
    protectedUnsyncedCount,
  }
}
