import { getMetaValue, putMetaValue } from './photoStore'

export const BOOTH_MOUNT_CONFIG_KEY = 'pehchaan_booth_mount_config'

/**
 * Persistent mount configuration for the kiosk.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, orientation confirmation is performed via the interactive
 * Orientation Wizard (camera test shot + upright confirmation).
 * In the final native iPadOS app, this maps to hardware orientation locking and UIDeviceOrientation sensors.
 */
export interface BoothMountConfig {
  confirmed: boolean
  orientation: 'portrait' | 'landscape'
  confirmedAt: number | null
  testShotPreview?: string | null
  deviceAngle?: number
}

export const DEFAULT_MOUNT_CONFIG: BoothMountConfig = {
  confirmed: true,
  orientation: 'portrait',
  confirmedAt: null,
  testShotPreview: null,
  deviceAngle: 0,
}

export async function getBoothMountConfig(): Promise<BoothMountConfig> {
  try {
    const stored = await getMetaValue<BoothMountConfig>(BOOTH_MOUNT_CONFIG_KEY)
    if (stored && typeof stored.confirmed === 'boolean') {
      return stored
    }
  } catch {
    // Return default if storage error
  }
  return { ...DEFAULT_MOUNT_CONFIG }
}

export async function saveBoothMountConfig(config: BoothMountConfig): Promise<void> {
  await putMetaValue(BOOTH_MOUNT_CONFIG_KEY, config)
}

export async function confirmMount(testShotPreview?: string | null): Promise<BoothMountConfig> {
  const config: BoothMountConfig = {
    confirmed: true,
    orientation: 'portrait',
    confirmedAt: Date.now(),
    testShotPreview: testShotPreview || null,
    deviceAngle: 0,
  }
  await saveBoothMountConfig(config)
  return config
}

export async function resetMountConfirmation(): Promise<void> {
  await saveBoothMountConfig({ ...DEFAULT_MOUNT_CONFIG, confirmed: false })
}

export function isMountConfirmed(config?: BoothMountConfig | null): boolean {
  return Boolean(config && config.confirmed === true)
}
