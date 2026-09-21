import type { EventStatus } from '../eventPack/types'
import type { StorageOperationalStatus } from './storageLimits'
import type { BoothMountConfig } from './orientationWizard'

export type BoothReadinessState =
  | 'READY'
  | 'MOUNT_UNCONFIRMED'
  | 'WRONG_ORIENTATION'
  | 'PAUSED'
  | 'ENDED'
  | 'STORAGE_FULL'
  | 'STORAGE_CRITICAL'
  | 'BATTERY_REST'
  | 'CAMERA_UNAVAILABLE'
  | 'PERMISSION_UNAVAILABLE'

export interface BoothReadiness {
  state: BoothReadinessState
  isReady: boolean
  guestMessage: string | null
  staffSummary: string
  details: {
    eventStatus: EventStatus
    isPortrait: boolean
    mountConfirmed: boolean
    storageLevel: StorageOperationalStatus['level']
    cameraReady: boolean
    cameraStatus: string
  }
}

export interface ReadinessOptions {
  eventStatus: EventStatus
  isPortrait: boolean
  storageStatus: StorageOperationalStatus
  mountConfig?: BoothMountConfig | null
  mountConfirmed?: boolean
  cameraStatus?: string
  operatorReady?: boolean
  boothReady?: boolean
  shouldRestForBattery?: boolean
}

export function computeBoothReadiness(options: ReadinessOptions): BoothReadiness {
  const {
    eventStatus,
    isPortrait,
    storageStatus,
    cameraStatus = 'ready',
    operatorReady = true,
    boothReady = true,
    shouldRestForBattery = false,
  } = options

  const mountConfirmed = typeof options.mountConfirmed === 'boolean'
    ? options.mountConfirmed
    : options.mountConfig ? options.mountConfig.confirmed : true

  if (eventStatus === 'ended') {
    return {
      state: 'ENDED',
      isReady: false,
      guestMessage: 'This event has ended.',
      staffSummary: 'Event Ended · Guest sessions closed',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (eventStatus === 'paused') {
    return {
      state: 'PAUSED',
      isReady: false,
      guestMessage: 'The booth is temporarily paused. Please wait for the next session.',
      staffSummary: 'Event Paused · Ready to resume',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (!mountConfirmed) {
    return {
      state: 'MOUNT_UNCONFIRMED',
      isReady: false,
      guestMessage: 'Booth mount calibration pending. Please notify booth staff.',
      staffSummary: 'Mount Unconfirmed · Complete Orientation Wizard before starting',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed: false,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (!isPortrait) {
    return {
      state: 'WRONG_ORIENTATION',
      isReady: false,
      guestMessage: 'Please rotate device to portrait mode.',
      staffSummary: 'Wrong Orientation · Device in Landscape (Portrait required)',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (storageStatus.isCritical) {
    return {
      state: 'STORAGE_CRITICAL',
      isReady: false,
      guestMessage: 'Photo storage is critically full. Attract hidden.',
      staffSummary: 'Storage Critical (< 500 MB free) · Attract hidden (Clean up storage)',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (storageStatus.isHardStop) {
    return {
      state: 'STORAGE_FULL',
      isReady: false,
      guestMessage: 'Photo storage is at capacity. Please speak to staff.',
      staffSummary: 'Storage Hard Stop · < 2 GB free (Capture disabled)',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (shouldRestForBattery) {
    return {
      state: 'BATTERY_REST',
      isReady: false,
      guestMessage: 'Booth is resting due to low battery (< 15%). Connect charger to resume.',
      staffSummary: 'Battery Critical (< 15%) · Connect power source',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: cameraStatus === 'ready',
        cameraStatus,
      },
    }
  }

  if (cameraStatus === 'denied') {
    return {
      state: 'PERMISSION_UNAVAILABLE',
      isReady: false,
      guestMessage: 'Camera permission is needed to take a photo.',
      staffSummary: 'Camera Permission Denied · Grant camera permission in browser',
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: false,
        cameraStatus,
      },
    }
  }

  if (cameraStatus === 'unavailable' || cameraStatus === 'error') {
    return {
      state: 'CAMERA_UNAVAILABLE',
      isReady: false,
      guestMessage: 'The camera is currently unavailable.',
      staffSummary: `Camera Unavailable (${cameraStatus}) · Check camera connection`,
      details: {
        eventStatus,
        isPortrait,
        mountConfirmed,
        storageLevel: storageStatus.level,
        cameraReady: false,
        cameraStatus,
      },
    }
  }

  const isReady = operatorReady && boothReady && isPortrait && mountConfirmed && eventStatus === 'live' && !storageStatus.isHardStop && !storageStatus.isCritical && !shouldRestForBattery
  return {
    state: 'READY',
    isReady,
    guestMessage: null,
    staffSummary: 'Ready for Guests · All systems operational',
    details: {
      eventStatus,
      isPortrait,
      mountConfirmed,
      storageLevel: storageStatus.level,
      cameraReady: true,
      cameraStatus,
    },
  }
}
