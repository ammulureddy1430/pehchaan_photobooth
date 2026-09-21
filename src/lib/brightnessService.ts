/**
 * Brightness service abstraction.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In desktop/Chrome browsers, web pages cannot manipulate physical hardware screen brightness.
 * This service models the exact operational state and preflight lifecycle required by the Build Guide.
 *
 * Native iPadOS Mapping:
 * UIScreen.main.brightness = 1.0 (on event start)
 * UIScreen.main.brightness = overrideLevel (on staff manual adjustment)
 */

export interface BrightnessState {
  level: number // 0.0 to 1.0 (1.0 = 100%)
  isAutoMaximized: boolean
  isStaffOverridden: boolean
  lastUpdated: number
}

let currentBrightnessState: BrightnessState = {
  level: 1.0,
  isAutoMaximized: true,
  isStaffOverridden: false,
  lastUpdated: Date.now(),
}

export function getBrightnessState(): BrightnessState {
  return { ...currentBrightnessState }
}

export function applyStartEventBrightness(): BrightnessState {
  currentBrightnessState = {
    level: 1.0,
    isAutoMaximized: true,
    isStaffOverridden: false,
    lastUpdated: Date.now(),
  }
  return { ...currentBrightnessState }
}

export function setStaffBrightnessOverride(level: number): BrightnessState {
  const clamped = Math.max(0.1, Math.min(1.0, level))
  currentBrightnessState = {
    level: clamped,
    isAutoMaximized: false,
    isStaffOverridden: true,
    lastUpdated: Date.now(),
  }
  return { ...currentBrightnessState }
}
