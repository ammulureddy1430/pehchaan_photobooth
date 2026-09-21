/**
 * Network diagnostic service for Staff operations.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * Uses browser navigator.onLine and lightweight backend ping/heartbeat checks.
 *
 * Native iPadOS Mapping:
 * NWPathMonitor (Network framework) for continuous path monitoring.
 */

export interface NetworkDiagnosticStatus {
  isOnline: boolean
  backendReachable: boolean
  diagnosticMessage: string
  lastChecked: number
}

let cachedStatus: NetworkDiagnosticStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  backendReachable: true,
  diagnosticMessage: 'Online (Backend Reachable)',
  lastChecked: Date.now(),
}

export function evaluateNetworkStatus(isOnline: boolean, backendReachable: boolean): NetworkDiagnosticStatus {
  let diagnosticMessage = 'Online (Backend Reachable)'
  if (!isOnline) {
    diagnosticMessage = 'Offline (Sync Queued Locally in Outbox)'
  } else if (!backendReachable) {
    diagnosticMessage = 'Online (Backend Unreachable — Safe Local Fallback)'
  }

  return {
    isOnline,
    backendReachable,
    diagnosticMessage,
    lastChecked: Date.now(),
  }
}

export async function checkNetworkStatus(backendUrl?: string): Promise<NetworkDiagnosticStatus> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  let backendReachable = false

  if (isOnline) {
    try {
      const url = backendUrl ? `${backendUrl}/api/heartbeat` : '/api/heartbeat'
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timeoutId)
      // Any response from server (even 404/200) means backend host is reachable
      backendReachable = response !== null
    } catch {
      backendReachable = false
    }
  }

  cachedStatus = evaluateNetworkStatus(isOnline, backendReachable)
  return cachedStatus
}

export function getCachedNetworkStatus(): NetworkDiagnosticStatus {
  return { ...cachedStatus }
}
