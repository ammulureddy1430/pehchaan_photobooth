const DEVICE_ID_KEY = 'pehchaan_device_id'
const DEVICE_TOKEN_KEY = 'pehchaan_device_token'

let memoryDeviceId: string | null = null
let memoryDeviceToken: string | null = null

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `gen-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function getOrCreateLocalDeviceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_ID_KEY)
      if (stored && stored.trim().length > 0) {
        return stored.trim()
      }

      const newId = `dev-chrome-${generateUuid()}`
      localStorage.setItem(DEVICE_ID_KEY, newId)
      return newId
    }
  } catch {
    // Fallback if localStorage access is restricted
  }

  if (!memoryDeviceId) {
    memoryDeviceId = `dev-chrome-${generateUuid()}`
  }
  return memoryDeviceId
}

export function setLocalDeviceId(deviceId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_ID_KEY, deviceId)
    }
  } catch {
    // Fallback
  }
  memoryDeviceId = deviceId
}

export function getLocalDeviceId(): string {
  return getOrCreateLocalDeviceId()
}

export function setLocalDeviceToken(token: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_TOKEN_KEY, token)
    }
  } catch {
    // Fallback
  }
  memoryDeviceToken = token
}

export function getLocalDeviceToken(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_TOKEN_KEY)
      if (stored && stored.trim().length > 0) {
        return stored.trim()
      }
    }
  } catch {
    // Fallback
  }
  return memoryDeviceToken
}

export function clearLocalDeviceToken(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DEVICE_TOKEN_KEY)
    }
  } catch {
    // Fallback
  }
  memoryDeviceToken = null
}
