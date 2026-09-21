import type { StorageStats } from '../types'
import { formatBytes } from './format'

export const GB = 1024 * 1024 * 1024
export const MB = 1024 * 1024

// Exact thresholds aligned with Pehchaan Photobooth Build Guide:
// >= 8 GB free -> Normal / Green
// < 8 GB free  -> Warning / Amber
// < 2 GB free  -> HARD STOP / Red (Capture Disabled)
// < 500 MB free -> Critical / Red (Attract Hidden, Booth Rest)
export const STORAGE_NORMAL_MIN_FREE_BYTES = 8 * GB
export const STORAGE_WARNING_THRESHOLD_FREE_BYTES = 8 * GB
export const STORAGE_HARD_STOP_THRESHOLD_FREE_BYTES = 2 * GB
export const STORAGE_CRITICAL_THRESHOLD_FREE_BYTES = 500 * MB

// Simulated default baseline device capacity if total space is not reported by browser
export const DEFAULT_DEVICE_STORAGE_BYTES = 64 * GB

export const STORAGE_WARNING_COUNT = 500
export const STORAGE_HARD_STOP_COUNT = 1000

export type StorageLevel = 'normal' | 'warning' | 'hard_stop' | 'critical'

export interface StorageOperationalStatus {
  level: StorageLevel
  isNormal: boolean
  isWarning: boolean
  isHardStop: boolean
  isCritical: boolean
  hideAttract: boolean
  photoCount: number
  bytesUsed: number
  freeBytes: number
  percentUsed: number
  formattedBytes: string
  formattedFreeBytes: string
  statusMessage: string
  guestMessage: string | null
  warningThresholdText: string
  hardStopThresholdText: string
  criticalThresholdText: string
}

export function evaluateStorageStatus(stats: StorageStats & { freeBytes?: number; totalBytes?: number }): StorageOperationalStatus {
  const count = stats.count || 0
  const bytesUsed = stats.bytes || 0
  const totalBytes = stats.totalBytes || DEFAULT_DEVICE_STORAGE_BYTES

  // If freeBytes is explicitly provided, use it; otherwise compute from total - used
  const freeBytes = typeof stats.freeBytes === 'number'
    ? stats.freeBytes
    : Math.max(0, totalBytes - bytesUsed)

  const isCritical = freeBytes < STORAGE_CRITICAL_THRESHOLD_FREE_BYTES
  const isHardStop = isCritical || freeBytes < STORAGE_HARD_STOP_THRESHOLD_FREE_BYTES
  const isWarning = isHardStop || freeBytes < STORAGE_WARNING_THRESHOLD_FREE_BYTES

  let level: StorageLevel = 'normal'
  if (isCritical) {
    level = 'critical'
  } else if (isHardStop) {
    level = 'hard_stop'
  } else if (isWarning) {
    level = 'warning'
  }

  const percentUsed = Math.min(100, Math.round((bytesUsed / totalBytes) * 100))

  let statusMessage = 'Storage Normal (>= 8 GB free)'
  let guestMessage: string | null = null

  if (isCritical) {
    statusMessage = 'Storage Critical: < 500 MB free (Attract Hidden)'
    guestMessage = 'Photo storage is critically low. Please notify booth staff.'
  } else if (isHardStop) {
    statusMessage = 'Storage Hard Stop: < 2 GB free (Capture Disabled)'
    guestMessage = 'Photo storage is at capacity. Please notify booth staff.'
  } else if (isWarning) {
    statusMessage = 'Storage Warning: < 8 GB free'
  }

  return {
    level,
    isNormal: level === 'normal',
    isWarning: level === 'warning' || isHardStop || isCritical,
    isHardStop,
    isCritical,
    hideAttract: isCritical,
    photoCount: count,
    bytesUsed,
    freeBytes,
    percentUsed,
    formattedBytes: formatBytes(bytesUsed),
    formattedFreeBytes: formatBytes(freeBytes),
    statusMessage,
    guestMessage,
    warningThresholdText: `< ${formatBytes(STORAGE_WARNING_THRESHOLD_FREE_BYTES)} free`,
    hardStopThresholdText: `< ${formatBytes(STORAGE_HARD_STOP_THRESHOLD_FREE_BYTES)} free`,
    criticalThresholdText: `< ${formatBytes(STORAGE_CRITICAL_THRESHOLD_FREE_BYTES)} free`,
  }
}

export function isCaptureAllowed(stats: StorageStats & { freeBytes?: number; totalBytes?: number }): boolean {
  const status = evaluateStorageStatus(stats)
  return !status.isHardStop && !status.isCritical
}
