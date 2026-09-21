/**
 * Battery service operational abstraction.
 *
 * Thresholds:
 * - > 30% free: Normal (guest flow continues)
 * - 15% - 30%: Warning (guest flow continues, warning shown)
 * - < 15%: Critical Rest (Attract replaced with Rest state, no new sessions)
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * Modern desktop browsers do not expose battery status or mark it unavailable.
 * When unavailable, we report "Battery status unavailable" without fabricating values.
 *
 * Native iPadOS Mapping:
 * UIDevice.current.isBatteryMonitoringEnabled = true
 * UIDevice.current.batteryLevel (0.0 to 1.0)
 * UIDevice.current.batteryState (.unplugged, .charging, .full)
 */

export type BatteryOperationalLevel = 'normal' | 'warning' | 'critical_rest' | 'unavailable'

export interface BatteryStatus {
  isAvailable: boolean
  levelPercent: number | null // e.g. 85 for 85%
  isCharging: boolean | null
  operationalLevel: BatteryOperationalLevel
  displayStatus: string
  shouldRestBooth: boolean
}

export function evaluateBatteryLevel(percent: number | null, isCharging: boolean | null = null): BatteryStatus {
  if (percent === null || typeof percent !== 'number') {
    return {
      isAvailable: false,
      levelPercent: null,
      isCharging: null,
      operationalLevel: 'unavailable',
      displayStatus: 'Battery status unavailable',
      shouldRestBooth: false,
    }
  }

  const p = Math.max(0, Math.min(100, Math.round(percent)))
  let operationalLevel: BatteryOperationalLevel = 'normal'
  let shouldRestBooth = false

  if (p < 15 && !isCharging) {
    operationalLevel = 'critical_rest'
    shouldRestBooth = true
  } else if (p <= 30 && !isCharging) {
    operationalLevel = 'warning'
  }

  const chargingText = isCharging ? ' (Charging)' : ''
  const displayStatus = `${p}%${chargingText}`

  return {
    isAvailable: true,
    levelPercent: p,
    isCharging,
    operationalLevel,
    displayStatus,
    shouldRestBooth,
  }
}

export async function queryCurrentBattery(): Promise<BatteryStatus> {
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const battery = await (navigator as any).getBattery()
      if (battery && typeof battery.level === 'number') {
        return evaluateBatteryLevel(battery.level * 100, battery.charging)
      }
    } catch {
      // Ignore if browser restricts battery API
    }
  }

  return evaluateBatteryLevel(null)
}
