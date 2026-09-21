import type { EventPack } from '../eventPack/types'
import type { StorageOperationalStatus } from './storageLimits'
import type { BoothMountConfig } from './orientationWizard'
import type { NetworkDiagnosticStatus } from './networkService'
import type { PrinterAvailabilityState } from './printerService'

export interface PreflightItem {
  id: string
  name: string
  category: 'hardware' | 'config' | 'environment'
  isWaivable: boolean
  isPassed: boolean
  isWaived: boolean
  remediationMessage: string
}

export interface PreflightContext {
  cameraReady: boolean
  pack: EventPack | null
  packError: string | null
  mountConfig: BoothMountConfig | null
  storageStatus: StorageOperationalStatus
  pinConfigured: boolean
  printerStatus: PrinterAvailabilityState
  networkStatus: NetworkDiagnosticStatus
  guidedAccessActive: boolean
}

export interface PreflightEvaluation {
  canStart: boolean
  hasNonWaivableFailure: boolean
  items: PreflightItem[]
  nonWaivableFailedCount: number
  waivableFailedCount: number
  waivedCount: number
}

export function evaluatePreflight(
  ctx: PreflightContext,
  waivedItemIds: Set<string> = new Set()
): PreflightEvaluation {
  const items: PreflightItem[] = []

  // 1. NON-WAIVABLE: Camera
  items.push({
    id: 'camera',
    name: 'Camera Ready',
    category: 'hardware',
    isWaivable: false,
    isPassed: ctx.cameraReady,
    isWaived: false,
    remediationMessage: 'Ensure camera access is granted in browser permissions.',
  })

  // 2. NON-WAIVABLE: Event Pack
  const packValid = Boolean(ctx.pack && !ctx.packError)
  items.push({
    id: 'event_pack',
    name: 'Event Pack Loaded',
    category: 'config',
    isWaivable: false,
    isPassed: packValid,
    isWaived: false,
    remediationMessage: ctx.packError || 'Select and validate a valid Event Pack JSON.',
  })

  // 3. NON-WAIVABLE: Mount Confirmation
  const mountConfirmed = Boolean(ctx.mountConfig && ctx.mountConfig.confirmed)
  items.push({
    id: 'mount_confirmation',
    name: 'Mount Alignment Confirmed',
    category: 'hardware',
    isWaivable: false,
    isPassed: mountConfirmed,
    isWaived: false,
    remediationMessage: 'Run the Orientation Wizard and confirm portrait kiosk alignment.',
  })

  // 4. NON-WAIVABLE: Storage
  const storageValid = !ctx.storageStatus.isHardStop && !ctx.storageStatus.isCritical
  items.push({
    id: 'storage',
    name: 'Sufficient Storage (>= 2 GB Free)',
    category: 'environment',
    isWaivable: false,
    isPassed: storageValid,
    isWaived: false,
    remediationMessage: `Storage hard stop: ${ctx.storageStatus.formattedFreeBytes} free. Run cleanup to free up space.`,
  })

  // 5. NON-WAIVABLE: Staff PIN
  items.push({
    id: 'staff_pin',
    name: 'Staff PIN Configured',
    category: 'config',
    isWaivable: false,
    isPassed: ctx.pinConfigured,
    isWaived: false,
    remediationMessage: 'Configure a valid 4-digit Staff PIN in settings.',
  })

  // 6. WAIVABLE: Printer
  const printerPassed = ctx.printerStatus === 'available'
  const isPrinterWaived = !printerPassed && waivedItemIds.has('printer')
  items.push({
    id: 'printer',
    name: 'Printer Operational',
    category: 'hardware',
    isWaivable: true,
    isPassed: printerPassed,
    isWaived: isPrinterWaived,
    remediationMessage: 'Connect kiosk printer or waive to run in digital-only mode.',
  })

  // 7. WAIVABLE: Network
  const networkPassed = ctx.networkStatus.isOnline && ctx.networkStatus.backendReachable
  const isNetworkWaived = !networkPassed && waivedItemIds.has('network')
  items.push({
    id: 'network',
    name: 'Network & Backend Reachable',
    category: 'environment',
    isWaivable: true,
    isPassed: networkPassed,
    isWaived: isNetworkWaived,
    remediationMessage: 'Booth will operate offline and queue photos in local outbox if waived.',
  })

  // 8. WAIVABLE: Guided Access
  const guidedPassed = ctx.guidedAccessActive
  const isGuidedWaived = !guidedPassed && waivedItemIds.has('guided_access')
  items.push({
    id: 'guided_access',
    name: 'Guided Access / Kiosk Lock',
    category: 'environment',
    isWaivable: true,
    isPassed: guidedPassed,
    isWaived: isGuidedWaived,
    remediationMessage: 'Enable iPad Guided Access (Triple-click top button) or waive for prototype testing.',
  })

  let nonWaivableFailedCount = 0
  let waivableFailedCount = 0
  let waivedCount = 0

  for (const item of items) {
    if (!item.isPassed) {
      if (!item.isWaivable) {
        nonWaivableFailedCount++
      } else if (item.isWaived) {
        waivedCount++
      } else {
        waivableFailedCount++
      }
    }
  }

  const hasNonWaivableFailure = nonWaivableFailedCount > 0
  const canStart = !hasNonWaivableFailure && waivableFailedCount === 0

  return {
    canStart,
    hasNonWaivableFailure,
    items,
    nonWaivableFailedCount,
    waivableFailedCount,
    waivedCount,
  }
}
