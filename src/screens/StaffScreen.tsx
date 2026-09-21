import { useEffect, useRef, useState } from 'react'
import type { EventPack, EventPackPaymentConfig, EventStatus, PackFeatureFlag, PackLanguage, PaymentMode } from '../eventPack/types'
import { formatBytes } from '../lib/format'
import type { StorageStats } from '../types'
import { evaluateStorageStatus } from '../lib/storageLimits'
import { getBoothMountConfig, isMountConfirmed, type BoothMountConfig } from '../lib/orientationWizard'
import { OrientationWizard } from '../components/OrientationWizard'
import { evaluatePreflight, type PreflightEvaluation } from '../lib/preflight'
import { printerService, type SelectedPrinter } from '../lib/printerService'
import { getCachedNetworkStatus, checkNetworkStatus, type NetworkDiagnosticStatus } from '../lib/networkService'
import { getBrightnessState, applyStartEventBrightness, setStaffBrightnessOverride } from '../lib/brightnessService'
import { queryCurrentBattery, type BatteryStatus } from '../lib/batteryService'
import { triggerStaffExportDownload } from '../lib/exportService'
import { performSafeOperationalCleanup, performSafeEventWipe, listAllPhotos, listCompletedSessions, listPendingOutboxItems, getDerived, compositionDerivedId, type EventWipeReport } from '../lib/photoStore'
import { evaluateRetentionStatus, DEFAULT_RETENTION_HOURS, type RetentionStatus } from '../lib/retentionPolicy'
import type { SyncStats } from '../sync/types'
import { deliveryManager } from '../delivery/deliveryManager'
import type { DeliverySessionSummary } from '../delivery/types'
import { paymentManager, type PaymentSummary } from '../payment'
import { apiClient } from '../api/client'
import type { ActiveEventDetails } from '../hooks/useOperator'
import { boothActivateEvent } from '../admin/services/adminApi'
import type { BoothActivationResult } from '../admin/types'
import './StaffScreen.css'

type StaffTab = 'all' | 'controls' | 'layout' | 'payment' | 'photos' | 'system'

type StaffScreenProps = {
  pack: EventPack
  usingFallback: boolean
  eventStatus: EventStatus
  packError: string | null
  language: PackLanguage
  stats: StorageStats
  syncStats?: SyncStats
  busy: boolean
  activeEventDetails?: ActiveEventDetails | null
  onActivateEvent?: (pack: EventPack, details: ActiveEventDetails) => Promise<boolean | void>
  onCancelReset: () => void
  resetArmed: boolean
  onLanguageChange: (language: PackLanguage) => void
  onStartEvent: () => void
  onPauseEvent: () => void
  onEndEvent: () => void
  onLoadPack: (text: string) => void
  onFallbackPack: () => void
  onToggleFlag: (flag: PackFeatureFlag, enabled: boolean) => void
  onUpdatePaymentConfig?: (config: EventPackPaymentConfig) => void
  onTestShot: () => void
  onResetData: () => void
  onForceSync?: () => Promise<{ processed: number; errors: number }>
  onExit: () => void
}

function actionClass(active: boolean): string {
  return active ? 'staff-btn is-primary' : 'staff-btn'
}

export function StaffScreen({
  pack,
  usingFallback,
  eventStatus,
  packError,
  language: _language,
  stats,
  syncStats,
  resetArmed,
  busy,
  activeEventDetails,
  onActivateEvent,
  onCancelReset,
  onLanguageChange: _onLanguageChange,
  onStartEvent,
  onPauseEvent,
  onEndEvent,
  onLoadPack,
  onFallbackPack,
  onToggleFlag,
  onUpdatePaymentConfig,
  onTestShot,
  onResetData,
  onForceSync,
  onExit,
}: StaffScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<StaffTab>('all')

  const [mountConfig, setMountConfig] = useState<BoothMountConfig | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [preflightModalOpen, setPreflightModalOpen] = useState(false)
  const [waivedChecks, setWaivedChecks] = useState<Set<string>>(new Set(['guided_access']))
  const [preflightEval, setPreflightEval] = useState<PreflightEvaluation | null>(null)

  const [printer, setPrinter] = useState<SelectedPrinter | null>(() => printerService.getSelectedPrinter())
  const [printerFeedback, setPrinterFeedback] = useState<string | null>(null)
  const [networkInfo, setNetworkInfo] = useState<NetworkDiagnosticStatus>(getCachedNetworkStatus)
  const [batteryInfo, setBatteryInfo] = useState<BatteryStatus | null>(null)
  const [brightness, setBrightness] = useState<number>(() => getBrightnessState().level)

  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const [completedSessions, setCompletedSessions] = useState<DeliverySessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [sessionPreviews, setSessionPreviews] = useState<Record<string, string>>({})
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<{
    isOpen: boolean
    sessionId: string
    shareUrl: string
    qrSvg: string
    activeHost?: string
  } | null>(null)
  const [serverLanIp, setServerLanIp] = useState<string>('')
  const [serverPort, setServerPort] = useState<string>('3001')
  const [serverLanIps, setServerLanIps] = useState<string[]>([])
  const [publicTunnelUrl, setPublicTunnelUrl] = useState<string | null>(null)
  const [customHostInput, setCustomHostInput] = useState<string>('')
  const [isStartingTunnel, setIsStartingTunnel] = useState<boolean>(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [whatsAppModal, setWhatsAppModal] = useState<{
    isOpen: boolean
    sessionId: string
    phoneNumber: string
    previewUrl: string
    previewMessage: string
    handoffUrl?: string
    error?: string | null
    status?: string | null
  } | null>(null)
  const [actionInputType, setActionInputType] = useState<'whatsapp' | 'email' | null>(null)
  const [actionInputValue, setActionInputValue] = useState<string>('')

  // Retention & Safe Wipe state
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatus | null>(null)
  const [wipeModalOpen, setWipeModalOpen] = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState('')
  const [wipeReport, setWipeReport] = useState<EventWipeReport | null>(null)
  const [wipeError, setWipeError] = useState<string | null>(null)
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0)

  // Payment Settings state
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null)
  const [paymentModeInput, setPaymentModeInput] = useState<PaymentMode>(() => pack.payment?.mode || 'organizer')
  const [paymentUpiId, setPaymentUpiId] = useState<string>(() => pack.payment?.upiId || '')
  const [paymentMerchantName, setPaymentMerchantName] = useState<string>(() => pack.payment?.merchantName || pack.eventName || 'Pehchaan Photobooth')
  const [paymentAmount, setPaymentAmount] = useState<string>(() => String(pack.payment?.amount || 99))
  const [paymentCurrency, setPaymentCurrency] = useState<string>(() => pack.payment?.currency || 'INR')
  const [paymentTimeout, setPaymentTimeout] = useState<string>(() => String(pack.payment?.timeoutSeconds || 300))
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSaveMsg, setPaymentSaveMsg] = useState<string | null>(null)

  // Booth Event Activation state
  const [activationModalOpen, setActivationModalOpen] = useState(false)
  const [activationInput, setActivationInput] = useState('')
  const [activationLoading, setActivationLoading] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [activationResult, setActivationResult] = useState<BoothActivationResult | null>(null)
  const [activationSuccessMsg, setActivationSuccessMsg] = useState<string | null>(null)

  const handleValidateEvent = async () => {
    const raw = activationInput.trim()
    if (!raw) {
      setActivationError('Please enter a valid Event ID (e.g. PEH-ABC123).')
      return
    }

    setActivationError(null)
    setActivationLoading(true)
    setActivationResult(null)

    try {
      let eventId = raw
      let token: string | undefined = undefined

      if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed.eventId) {
            eventId = parsed.eventId
            token = parsed.token
          }
        } catch {
          // Ignore parse error and treat as plain eventId
        }
      }

      const res = await boothActivateEvent(eventId, token)
      setActivationResult(res)
    } catch (err: any) {
      setActivationError(err.message || 'Failed to activate event. Please check Event ID and try again.')
    } finally {
      setActivationLoading(false)
    }
  }

  const handleConfirmLoadEvent = async () => {
    if (!activationResult || !onActivateEvent) return
    setActivationLoading(true)
    try {
      await onActivateEvent(activationResult.eventPack as EventPack, {
        eventId: activationResult.event.eventId,
        eventName: activationResult.event.name,
        eventDate: activationResult.event.eventDate,
        venue: activationResult.event.venue,
        schoolName: (activationResult.event as any).schoolName || 'Pehchaan Model School',
        activatedAt: new Date().toISOString(),
        configVersion: (activationResult.eventPack as any).version || '1.0.0',
      })

      setActivationSuccessMsg(`✓ Event "${activationResult.event.name}" loaded and ready!`)
      setActivationModalOpen(false)
      setActivationResult(null)
      setActivationInput('')
      setTimeout(() => setActivationSuccessMsg(null), 5000)
    } catch (err: any) {
      setActivationError(err.message || 'Failed to load event configuration.')
    } finally {
      setActivationLoading(false)
    }
  }

  const [isSyncingConfig, setIsSyncingConfig] = useState(false)

  const handleRefreshEventConfig = async () => {
    if (!activeEventDetails?.eventId || !onActivateEvent) return
    setIsSyncingConfig(true)
    try {
      const res = await boothActivateEvent(activeEventDetails.eventId)
      await onActivateEvent(res.eventPack as EventPack, {
        ...activeEventDetails,
        eventName: res.event.name,
        eventDate: res.event.eventDate,
        venue: res.event.venue,
        schoolName: (res.event as any).schoolName || activeEventDetails.schoolName || 'Pehchaan Model School',
        configVersion: (res.eventPack as any).version || activeEventDetails.configVersion || '1.0.0',
      })
      setActivationSuccessMsg(`✓ Synced latest event settings from cloud!`)
      setTimeout(() => setActivationSuccessMsg(null), 4000)
    } catch (err: any) {
      setActivationError(err.message || 'Failed to sync with cloud. Check internet connection.')
    } finally {
      setIsSyncingConfig(false)
    }
  }

  const refreshPaymentSummary = async () => {
    try {
      const summary = await paymentManager.getEventSummary(pack.id)
      setPaymentSummary(summary)
    } catch {
      // Ignore
    }
  }

  const refreshRetentionAndWipeState = async () => {
    try {
      const photos = await listAllPhotos()
      const sessions = await listCompletedSessions()
      const pendingOutbox = await listPendingOutboxItems()
      setPendingOutboxCount(pendingOutbox.length)
      const status = evaluateRetentionStatus(
        photos,
        sessions,
        pack.retentionHours || DEFAULT_RETENTION_HOURS
      )
      setRetentionStatus(status)
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    void getBoothMountConfig().then(setMountConfig)
    void queryCurrentBattery().then(setBatteryInfo)
    void checkNetworkStatus().then(setNetworkInfo)
    void refreshRetentionAndWipeState()
    void refreshPaymentSummary()

    // Query backend for local LAN IP and Live Public Internet Tunnel
    void apiClient.getServerInfo().then((info) => {
      if (info?.primaryLanIp) {
        setServerLanIp(info.primaryLanIp)
        if (info.port) setServerPort(info.port)
        if (info.lanIps) setServerLanIps(info.lanIps)
      }
      if (info?.publicUrl) {
        setPublicTunnelUrl(info.publicUrl)
      }
    }).catch(() => {
      // Ignore if offline
    })
  }, [pack.retentionHours, stats.count, pack.id])

  useEffect(() => {
    if (pack.payment) {
      setPaymentModeInput(pack.payment.mode || 'organizer')
      setPaymentUpiId(pack.payment.upiId || '')
      setPaymentMerchantName(pack.payment.merchantName || pack.eventName || 'Pehchaan Photobooth')
      setPaymentAmount(String(pack.payment.amount || 99))
      setPaymentCurrency(pack.payment.currency || 'INR')
      setPaymentTimeout(String(pack.payment.timeoutSeconds || 300))
    }
  }, [pack.payment, pack.eventName, pack.id])


  const loadPreviews = async (list: DeliverySessionSummary[]) => {
    try {
      const allPhotos = await listAllPhotos()
      const previews: Record<string, string> = {}
      for (const s of list) {
        try {
          const comp = await getDerived(compositionDerivedId(s.sessionId))
          if (comp?.blob instanceof Blob) {
            previews[s.sessionId] = URL.createObjectURL(comp.blob)
          } else {
            const matching = allPhotos.filter((p) => p.sessionId === s.sessionId)
            if (matching.length > 0) {
              const first = matching[0]
              if (first.thumbnail instanceof Blob) {
                previews[s.sessionId] = URL.createObjectURL(first.thumbnail)
              } else if (first.original instanceof Blob) {
                previews[s.sessionId] = URL.createObjectURL(first.original)
              }
            }
          }
        } catch {
          // Ignore individual preview errors
        }
      }
      setSessionPreviews(previews)
    } catch {
      // Ignore
    }
  }


  const refreshSessions = async () => {
    try {
      const list = await deliveryManager.getCompletedSessionsList()
      setCompletedSessions(list)
      void loadPreviews(list)
      if (list.length > 0) {
        setSelectedSessionId((prev) => {
          if (!prev || !list.some((s) => s.sessionId === prev)) {
            return list[0].sessionId
          }
          return prev
        })
      } else {
        setSelectedSessionId('')
      }
      void refreshRetentionAndWipeState()
    } catch {
      // Ignore
    }
  }


  useEffect(() => {
    void refreshSessions()
  }, [
    syncStats?.syncedCount,
    syncStats?.pendingCount,
    syncStats?.syncingCount,
    syncStats?.totalCount,
    stats.count,
  ])

  const storageOperational = evaluateStorageStatus(stats)
  const isMountOk = isMountConfirmed(mountConfig)

  const [fileError, setFileError] = useState<string | null>(null)
  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setFileError(null)
      const text = await file.text()
      onLoadPack(text)
    } catch {
      setFileError('Could not read file. Please select a valid Event Pack JSON.')
    }
  }

  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const handleForceSync = async () => {
    if (!onForceSync) return
    try {
      setSyncMessage(null)
      const res = await onForceSync()
      if (res.processed > 0) {
        setSyncMessage(`Uploaded ${res.processed} photo(s) to cloud.`)
        void refreshSessions()
      } else if (res.errors > 0) {
        setSyncMessage('Upload pending. Photos remain safe on this iPad until internet connects.')
      } else {
        setSyncMessage('All photos are synced and up to date.')
      }
    } catch {
      setSyncMessage('Could not sync right now. Photos remain safe on iPad.')
    }
  }

  const handleStartEventClick = () => {
    const evaluation = evaluatePreflight(
      {
        cameraReady: true,
        pack,
        packError,
        mountConfig,
        storageStatus: storageOperational,
        pinConfigured: true,
        printerStatus: printerService.getPrinterAvailability(),
        networkStatus: networkInfo,
        guidedAccessActive: false,
      },
      waivedChecks
    )

    setPreflightEval(evaluation)

    if (evaluation.canStart) {
      applyStartEventBrightness()
      setBrightness(1.0)
      onStartEvent()
    } else {
      setPreflightModalOpen(true)
    }
  }

  const handleConfirmPreflightAndStart = () => {
    setPreflightModalOpen(false)
    applyStartEventBrightness()
    setBrightness(1.0)
    onStartEvent()
  }

  const handleToggleWaiveCheck = (checkId: string) => {
    setWaivedChecks((prev) => {
      const next = new Set(prev)
      if (next.has(checkId)) next.delete(checkId)
      else next.add(checkId)

      const evaluation = evaluatePreflight(
        {
          cameraReady: true,
          pack,
          packError,
          mountConfig,
          storageStatus: storageOperational,
          pinConfigured: true,
          printerStatus: printerService.getPrinterAvailability(),
          networkStatus: networkInfo,
          guidedAccessActive: false,
        },
        next
      )
      setPreflightEval(evaluation)
      return next
    })
  }

  const handleRunCleanup = async () => {
    try {
      setCleanupMessage(null)
      const report = await performSafeOperationalCleanup()
      setCleanupMessage(
        `Cleanup done: ${report.uploadedPhotosDeleted} uploaded photo(s) cleared. ${report.guestPhotosPreserved} guest photo(s) kept safe.`
      )
    } catch (err) {
      setCleanupMessage(`Cleanup error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExportAllZip = async () => {
    try {
      setExportMessage('Creating ZIP file download...')
      const res = await triggerStaffExportDownload({ eventId: pack.id })
      if (res.success) {
        setExportMessage(`Saved ${res.totalSessionsExported} session(s) (${res.totalPhotosExported} photos) to ZIP.`)
      } else {
        setExportMessage(res.error || 'Download failed.')
      }
    } catch (err) {
      setExportMessage(`Download error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleTestPrint = async () => {
    try {
      setPrinterFeedback('Printing test strip...')
      const res = await printerService.testPrint()
      if (res.success) {
        setPrinterFeedback(res.message)
      } else {
        setPrinterFeedback(res.error || 'Printer error.')
      }
    } catch (err) {
      setPrinterFeedback(`Printer error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExport = async (sessionId: string) => {
    setDeliveryMessage(null)
    const res = await deliveryManager.exportPhotos(sessionId, true)
    if (res.success) {
      setDeliveryMessage(`Downloaded ${res.exportedCount} photo(s) for session ${sessionId}.`)
    } else {
      setDeliveryMessage(res.error || 'Download failed.')
    }
  }

  const handlePrint = async (sessionId: string) => {
    setDeliveryMessage(null)
    const res = await deliveryManager.printSession(sessionId, pack)
    if (res.success) {
      setDeliveryMessage(`Sent to printer (${res.status}).`)
    } else {
      setDeliveryMessage(res.error || 'Print failed.')
    }
  }

  const handleViewQr = async (sessionId: string, customHost?: string) => {
    setDeliveryMessage(null)
    setCopiedLink(false)

    // Determine best reachable host for guest phones (Public Tunnel > LAN IP > Localhost)
    let hostToUse = customHost
    if (!hostToUse) {
      if (publicTunnelUrl) {
        hostToUse = publicTunnelUrl
      } else if (serverLanIp && serverLanIp !== '127.0.0.1' && serverLanIp !== 'localhost') {
        hostToUse = `${serverLanIp}:${serverPort}`
      } else if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        hostToUse = `${window.location.hostname}:3001`
      }
    }

    const res = await deliveryManager.getCloudQr(sessionId, pack, hostToUse)
    if (res.success && res.qrSvg && res.shareUrl) {
      setQrModal({
        isOpen: true,
        sessionId,
        shareUrl: res.shareUrl,
        qrSvg: res.qrSvg,
        activeHost: hostToUse || publicTunnelUrl || `${serverLanIp || 'localhost'}:${serverPort}`,
      })
    } else {
      setDeliveryMessage(res.error || 'Cloud link not ready yet. Please ensure cloud sync is finished.')
    }
  }

  const handleStartOrRefreshTunnel = async () => {
    try {
      setIsStartingTunnel(true)
      const res = await apiClient.startTunnel()
      if (res?.publicUrl) {
        setPublicTunnelUrl(res.publicUrl)
        if (qrModal?.sessionId) {
          void handleViewQr(qrModal.sessionId, res.publicUrl)
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsStartingTunnel(false)
    }
  }

  const handleChangeQrHost = (newHost: string) => {
    if (!qrModal?.sessionId) return
    if (newHost === 'custom') {
      return
    }
    void handleViewQr(qrModal.sessionId, newHost)
  }

  const handleApplyCustomHost = () => {
    if (!qrModal?.sessionId || !customHostInput.trim()) return
    void handleViewQr(qrModal.sessionId, customHostInput.trim())
  }

  const handleCopyQrLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2200)
    } catch {
      // Fallback
    }
  }

  const handleOpenWhatsAppModal = (sessionId: string) => {
    const defaultHost = customHostInput.trim() || publicTunnelUrl || (serverLanIp && serverLanIp !== '127.0.0.1' ? `${serverLanIp}:${serverPort}` : 'localhost:3001')
    const cleanHost = defaultHost.startsWith('http') ? defaultHost : `http://${defaultHost}`
    const galleryUrl = `${cleanHost.replace(/\/$/, '')}/gallery/${sessionId}`
    const message = `Here is your ${pack.eventName || 'Pehchaan Photobooth'} photo portrait! View and download your photo here: ${galleryUrl}`

    setWhatsAppModal({
      isOpen: true,
      sessionId,
      phoneNumber: '',
      previewUrl: galleryUrl,
      previewMessage: message,
      error: null,
      status: null,
    })
  }

  const handleSendWhatsAppFromModal = async () => {
    if (!whatsAppModal) return
    const phone = whatsAppModal.phoneNumber.trim()
    if (!phone) {
      setWhatsAppModal((prev) => prev ? { ...prev, error: 'Please enter a mobile phone number.' } : null)
      return
    }

    const hostToUse = customHostInput.trim() || publicTunnelUrl || (serverLanIp && serverLanIp !== '127.0.0.1' ? `${serverLanIp}:${serverPort}` : undefined)
    const res = await deliveryManager.sendWhatsApp(whatsAppModal.sessionId, phone, pack, hostToUse)
    if (res.success && res.handoffUrl) {
      const cleanDigits = phone.replace(/[^0-9]/g, '')
      try {
        window.open(res.handoffUrl, '_blank')
      } catch {
        // Fallback if blocked
      }
      setWhatsAppModal((prev) => prev ? {
        ...prev,
        handoffUrl: res.handoffUrl,
        error: null,
        status: `WhatsApp chat opened for +${cleanDigits}! Tap Send in WhatsApp to deliver the photo.`
      } : null)
    } else {
      setWhatsAppModal((prev) => prev ? {
        ...prev,
        error: res.error || 'Could not prepare WhatsApp delivery. Please check phone number format.',
        status: null,
      } : null)
    }
  }

  const handleSendSmsFromModal = () => {
    if (!whatsAppModal) return
    const phone = whatsAppModal.phoneNumber.trim()
    if (!phone) {
      setWhatsAppModal((prev) => prev ? { ...prev, error: 'Please enter a mobile phone number.' } : null)
      return
    }
    const cleanDigits = phone.replace(/[^0-9]/g, '')
    const smsUrl = `sms:+${cleanDigits}?&body=${encodeURIComponent(whatsAppModal.previewMessage)}`
    try {
      window.open(smsUrl, '_self')
    } catch {
      // Fallback
    }
    setWhatsAppModal((prev) => prev ? {
      ...prev,
      error: null,
      status: `SMS opened for +${cleanDigits}! Tap Send in Messages.`
    } : null)
  }

  const handleSubmitWhatsApp = async (sessionId: string) => {
    if (!actionInputValue.trim()) return
    setDeliveryMessage(null)
    const hostToUse = customHostInput.trim() || publicTunnelUrl || (serverLanIp && serverLanIp !== '127.0.0.1' ? `${serverLanIp}:${serverPort}` : undefined)
    const res = await deliveryManager.sendWhatsApp(sessionId, actionInputValue, pack, hostToUse)
    if (res.success) {
      const cleanDigits = actionInputValue.replace(/[^0-9]/g, '')
      setDeliveryMessage(`✓ Photo link sent directly to +${cleanDigits} (No login required).`)
      setActionInputType(null)
      setActionInputValue('')
    } else {
      setDeliveryMessage(res.error || 'Could not send WhatsApp.')
    }
  }

  const handleSubmitEmail = async (sessionId: string) => {
    if (!actionInputValue.trim()) return
    setDeliveryMessage(null)
    const res = await deliveryManager.sendEmail(sessionId, actionInputValue, pack)
    if (res.success) {
      setDeliveryMessage('Email opened.')
      setActionInputType(null)
      setActionInputValue('')
    } else {
      setDeliveryMessage(res.error || 'Could not send email.')
    }
  }

  const handleOpenWipeModal = async () => {
    setWipeError(null)
    setWipeReport(null)
    setWipeConfirmText('')
    await refreshRetentionAndWipeState()
    setWipeModalOpen(true)
  }

  const handlePerformWipe = async (force: boolean) => {
    try {
      setWipeError(null)
      const report = await performSafeEventWipe({ force })
      setWipeReport(report)
      if (!report.success) {
        setWipeError(report.message)
      } else {
        await refreshRetentionAndWipeState()
        void refreshSessions()
      }
    } catch (err) {
      setWipeError(`Wipe error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSelectPaymentMode = (mode: PaymentMode) => {
    setPaymentError(null)
    setPaymentSaveMsg(null)
    setPaymentModeInput(mode)

    if (mode === 'organizer') {
      onUpdatePaymentConfig?.({
        enabled: true,
        mode: 'organizer',
        amount: 0,
        currency: 'INR',
        timeoutSeconds: 300,
      })
      setPaymentSaveMsg('✓ Payment mode set to Organizer Sponsored (Free / Sponsored by Event).')
      void refreshPaymentSummary()
    } else if (mode === 'disabled') {
      onUpdatePaymentConfig?.({
        enabled: false,
        mode: 'disabled',
        amount: 0,
        currency: 'INR',
        timeoutSeconds: 300,
      })
      setPaymentSaveMsg('✓ Payment disabled.')
      void refreshPaymentSummary()
    } else if (mode === 'individual') {
      // Validate configuration before activating Individual mode
      const upi = paymentUpiId.trim()
      const merchant = paymentMerchantName.trim()
      const amt = Number(paymentAmount)

      if (!upi || !upi.includes('@') || !merchant || isNaN(amt) || amt <= 0) {
        setPaymentError('Payment configuration incomplete. Please enter a valid UPI ID, Merchant Name, and Amount before activating Individual UPI.')
        return
      }

      onUpdatePaymentConfig?.({
        enabled: true,
        mode: 'individual',
        upiId: upi,
        merchantName: merchant,
        amount: amt,
        currency: paymentCurrency.trim().toUpperCase() || 'INR',
        timeoutSeconds: Number(paymentTimeout) || 300,
      })
      setPaymentSaveMsg(`✓ Individual UPI Payment activated (${paymentCurrency} ${amt} per session).`)
      void refreshPaymentSummary()
    }
  }

  const handleSaveIndividualConfig = () => {
    setPaymentError(null)
    setPaymentSaveMsg(null)
    const upi = paymentUpiId.trim()
    const merchant = paymentMerchantName.trim()
    const amt = Number(paymentAmount)

    if (!upi || !upi.includes('@')) {
      setPaymentError('Payment configuration incomplete: A valid UPI ID containing "@" is required.')
      return
    }
    if (!merchant) {
      setPaymentError('Payment configuration incomplete: Merchant Name is required.')
      return
    }
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Payment configuration incomplete: Amount must be greater than 0.')
      return
    }

    onUpdatePaymentConfig?.({
      enabled: true,
      mode: 'individual',
      upiId: upi,
      merchantName: merchant,
      amount: amt,
      currency: paymentCurrency.trim().toUpperCase() || 'INR',
      timeoutSeconds: Number(paymentTimeout) || 300,
    })
    setPaymentModeInput('individual')
    setPaymentSaveMsg(`✓ Saved payment configuration (${paymentCurrency} ${amt} per session).`)
    void refreshPaymentSummary()
  }

  const showControls = activeTab === 'all' || activeTab === 'controls'
  const showLayout = activeTab === 'all' || activeTab === 'layout'
  const showPayment = activeTab === 'all' || activeTab === 'payment'
  const showPhotos = activeTab === 'all' || activeTab === 'photos'
  const showSystem = activeTab === 'all' || activeTab === 'system'

  return (
    <section className="screen staff">
      <div className="gold-frame staff-frame" />

      {/* HEADER */}
      <header className="staff-head">
        <div className="staff-head-copy">
          <p>Pehchaan Photobooth · Staff Settings</p>
          <h1>Booth controls</h1>
        </div>
        <button
          className="staff-exit"
          type="button"
          aria-label="Exit Staff Mode"
          disabled={busy}
          onClick={onExit}
        >
          Back to booth
        </button>
      </header>

      {/* LIVE QUICK STATUS BAR */}
      <div className="staff-status-bar">
        <div className={`staff-pill is-${eventStatus}`}>
          <span className="staff-pill-dot" />
          <span className="staff-live is-status">{eventStatus}</span>
        </div>
        <div className={`staff-pill is-${storageOperational.level}`}>
          <span className="staff-pill-icon">💾</span>
          <span>{storageOperational.formattedFreeBytes} Free Space</span>
        </div>
        <div className={`staff-pill ${syncStats?.isOnline ? 'is-ready' : 'is-warning'}`}>
          <span className="staff-pill-icon">☁️</span>
          <span>{syncStats?.pendingCount ? `${syncStats.pendingCount} Waiting to Upload` : 'All Synced to Cloud ✓'}</span>
        </div>
        <div className={`staff-pill ${isMountOk ? 'is-ready' : 'is-warning'}`}>
          <span className="staff-pill-icon">📐</span>
          <span>{isMountOk ? 'Camera Straight ✓' : 'Check Camera Angle ⚠'}</span>
        </div>
      </div>

      {/* ACTIVATION SUCCESS TOAST */}
      {activationSuccessMsg && (
        <div className="staff-alert" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981', color: '#6ee7b7', margin: '0.4rem 0' }}>
          <span>{activationSuccessMsg}</span>
        </div>
      )}

      {/* ACTIVE EVENT IDENTITY CARD */}
      <div className="staff-active-event-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
          <div className="staff-active-event-icon">
            🏫
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#c6a15b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ACTIVE PHOTOBOOTH EVENT
            </div>
            <h2 style={{ margin: '2px 0 4px', fontSize: '1.2rem', color: '#fff' }}>
              {activeEventDetails?.eventName || pack.eventName || 'Fallback / Standalone Mode'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', color: '#94a3b8', flexWrap: 'wrap' }}>
              <span>Event ID: <strong style={{ color: '#c6a15b', fontFamily: 'monospace' }}>{activeEventDetails?.eventId || (usingFallback ? 'STANDALONE' : pack.id)}</strong></span>
              <span>•</span>
              <span>{activeEventDetails?.schoolName || 'Campus'}</span>
              <span>•</span>
              <span>{activeEventDetails?.venue || 'Local Kiosk'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {activeEventDetails && (
            <button
              type="button"
              className="staff-btn"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              disabled={isSyncingConfig}
              onClick={handleRefreshEventConfig}
            >
              {isSyncingConfig ? '⏳ Syncing...' : '🔄 Sync Settings'}
            </button>
          )}
          <button
            type="button"
            className="staff-btn is-primary"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            onClick={() => {
              setActivationError(null)
              setActivationResult(null)
              setActivationInput('')
              setActivationModalOpen(true)
            }}
          >
            📲 {activeEventDetails ? 'Switch Event' : 'Activate Event'}
          </button>
          {activeEventDetails && (
            <button
              type="button"
              className="staff-btn"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
              onClick={onFallbackPack}
            >
              Reset to Standalone
            </button>
          )}
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <nav className="staff-tabs" aria-label="Staff Categories">
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          📋 All Settings
        </button>
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'controls' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('controls')}
        >
          🎪 Booth Control
        </button>
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'layout' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('layout')}
        >
          🎨 Design &amp; Sharing
        </button>
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'payment' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payment')}
        >
          💳 Payment &amp; Pricing
        </button>
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'photos' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          📸 Photos &amp; Reprints ({completedSessions.length})
        </button>
        <button
          type="button"
          className={`staff-tab-btn ${activeTab === 'system' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          ⚙️ iPad &amp; Storage
        </button>
      </nav>

      <fieldset className="staff-body" disabled={busy}>
        {/* 1. BOOTH STATUS & QUICK CONTROLS */}
        {showControls && (
          <article className="staff-card is-section-controls">
            <div className="staff-card-header">
              <span className="staff-card-badge">MAIN CONTROLS</span>
              <p className="staff-card-kicker">Booth Status &amp; Setup</p>
            </div>
            
            <div className="staff-status-row">
              <div>
                <h2>
                  {eventStatus === 'live'
                    ? 'Ready for guests'
                    : eventStatus === 'paused'
                      ? 'Booth is paused'
                      : 'Event has ended'}
                </h2>
                <p className="staff-help">
                  {eventStatus === 'live'
                    ? 'The photobooth is OPEN. Guests can tap the screen to take photos.'
                    : eventStatus === 'paused'
                      ? 'The photobooth is PAUSED. Tap Start Event to resume photo sessions.'
                      : 'The event is CLOSED. Tap Start Event to open the photobooth again.'}
                </p>
              </div>
              <p className={`staff-live is-${eventStatus}`}>{eventStatus}</p>
            </div>

            <div className="staff-actions is-three">
              <button
                className={actionClass(eventStatus !== 'live')}
                type="button"
                disabled={eventStatus === 'live'}
                onClick={handleStartEventClick}
              >
                Start Event
              </button>
              <button
                className={actionClass(eventStatus === 'live')}
                type="button"
                disabled={eventStatus !== 'live'}
                onClick={onPauseEvent}
              >
                Pause
              </button>
              <button
                className={actionClass(false)}
                type="button"
                disabled={eventStatus === 'ended'}
                onClick={onEndEvent}
              >
                End Event
              </button>
            </div>

            <div className="staff-divider" />

            <div className="staff-setting">
              <div>
                <span style={{ fontWeight: 600 }}>iPad Stand &amp; Camera Angle</span>
                <p className="staff-help" style={{ fontSize: '1.6cqw' }}>
                  {isMountOk ? 'Camera is straight and aligned for iPad stand.' : 'Please check camera angle before opening.'}
                </p>
              </div>
              <span className={`staff-badge ${isMountOk ? 'is-ready' : 'is-error'}`}>
                {isMountOk ? 'Calibrated ✓' : 'Check Angle ⚠'}
              </span>
            </div>

            <div className="staff-actions is-two">
              <button
                className="staff-btn"
                type="button"
                onClick={() => setWizardOpen(true)}
              >
                Align &amp; Calibrate Camera
              </button>
              <button
                className="staff-btn is-primary"
                type="button"
                onClick={onTestShot}
              >
                Take a Test Photo
              </button>
            </div>
          </article>
        )}

        {/* 2. PHOTO TEMPLATE & SHARING OPTIONS */}
        {showLayout && (
          <>
            <article className="staff-card is-section-layout">
              <div className="staff-card-header">
                <span className="staff-card-badge">EVENT DESIGN</span>
                <p className="staff-card-kicker">Photo Template &amp; Design</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h2 className="staff-pack-name">{pack.eventName}</h2>
                <span className="staff-badge is-neutral">v{pack.version}</span>
              </div>

              <p className="staff-pack-meta">
                {usingFallback ? 'Default Pehchaan design' : 'Custom event design'} · {pack.shotCount === 1 ? '1 photo per guest' : '3-photo strip per guest'} · Language: {pack.language === 'en' ? 'English' : 'Hindi'}
              </p>

              {pack.schoolMode && (
                <div className="staff-school-mode-badge">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8cqw' }}>
                    <span className="staff-badge is-ready" style={{ background: '#2980b9', color: '#fff' }}>SCHOOL MODE</span>
                    <strong style={{ fontSize: '1.8cqw', color: '#85c1e9' }}>Student Privacy Protection Active</strong>
                  </div>
                  <p className="staff-help" style={{ fontSize: '1.5cqw', marginTop: '0.3cqh', color: '#d4e6f1' }}>
                    WhatsApp, email, and QR sharing are turned off to protect student privacy. Only safe on-site photo printing is allowed.
                  </p>
                </div>
              )}

              {(packError || fileError) && <p className="staff-alert" role="alert">{packError ?? fileError}</p>}

              <div className="staff-actions is-two">
                <button
                  className="staff-btn"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload Custom Design
                </button>
                <button className="staff-btn" type="button" onClick={onFallbackPack}>
                  Use Default Design
                </button>
              </div>

              <input
                ref={fileRef}
                className="staff-file"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
            </article>

            <article className="staff-card is-section-layout">
              <p className="staff-card-kicker">Guest Sharing &amp; Printing Options</p>
              <p className="staff-help">
                {pack.schoolMode
                  ? 'School Mode Active: Remote sharing is turned off for student privacy.'
                  : 'Choose how guests can receive their photos at the end of a session:'}
              </p>

              <div className="staff-flags">
                <FeatureToggle
                  label="WhatsApp"
                  on={pack.whatsappEnabled}
                  onChange={(enabled) => onToggleFlag('whatsappEnabled', enabled)}
                />
                <FeatureToggle
                  label="Email"
                  on={pack.emailEnabled}
                  onChange={(enabled) => onToggleFlag('emailEnabled', enabled)}
                />
                <FeatureToggle
                  label="Cloud QR"
                  on={pack.cloudQrEnabled}
                  onChange={(enabled) => onToggleFlag('cloudQrEnabled', enabled)}
                />
                <FeatureToggle
                  label="Print"
                  on={pack.printEnabled}
                  onChange={(enabled) => onToggleFlag('printEnabled', enabled)}
                />
              </div>
            </article>
          </>
        )}

        {/* PAYMENT & PRICING */}
        {showPayment && (
          <article className="staff-card is-section-payment">
            <div className="staff-card-header">
              <span className="staff-card-badge">MONETIZATION</span>
              <p className="staff-card-kicker">Payment &amp; Pricing Model</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2>Payment Mode</h2>
              <span className={`staff-badge ${paymentModeInput === 'individual' ? 'is-ready' : 'is-neutral'}`}>
                {paymentModeInput === 'individual' ? 'Individual UPI (Paid)' : paymentModeInput === 'disabled' ? 'Disabled' : 'Organizer Sponsored (Free)'}
              </span>
            </div>

            <p className="staff-help">
              Select whether photos are paid for by the event host (Free for guests) or individually via UPI QR code before delivery.
            </p>

            {/* Mode selection buttons */}
            <div className="staff-actions is-three" style={{ marginTop: '1cqh' }}>
              <button
                type="button"
                className={actionClass(paymentModeInput === 'organizer')}
                onClick={() => handleSelectPaymentMode('organizer')}
              >
                Organizer Sponsored
              </button>
              <button
                type="button"
                className={actionClass(paymentModeInput === 'individual')}
                onClick={() => handleSelectPaymentMode('individual')}
              >
                Individual UPI
              </button>
              <button
                type="button"
                className={actionClass(paymentModeInput === 'disabled')}
                onClick={() => handleSelectPaymentMode('disabled')}
              >
                Disabled
              </button>
            </div>

            {paymentError && <p className="staff-alert" role="alert">{paymentError}</p>}
            {paymentSaveMsg && <p className="staff-alert" style={{ background: 'rgba(46, 204, 113, 0.15)', borderColor: 'rgba(46, 204, 113, 0.4)', color: '#2ecc71' }}>{paymentSaveMsg}</p>}

            {/* UPI Configuration Form (shown when Individual UPI is selected) */}
            {paymentModeInput === 'individual' && (
              <div style={{ marginTop: '1.5cqh', display: 'flex', flexDirection: 'column', gap: '1cqh', background: 'rgba(0,0,0,0.3)', padding: '1.5cqh 2cqw', borderRadius: '0.8cqw', border: '1px solid rgba(232, 213, 163, 0.2)' }}>
                <h3 style={{ fontSize: '2cqw', color: '#e8d5a3', margin: 0 }}>UPI Merchant Configuration</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1cqw' }}>
                  <div>
                    <label style={{ fontSize: '1.6cqw', color: '#c4b595', display: 'block', marginBottom: '0.4cqh' }}>Merchant UPI ID *</label>
                    <input
                      type="text"
                      className="staff-text-input"
                      placeholder="e.g. merchant@upi or pehchaan@okhdfcbank"
                      value={paymentUpiId}
                      onChange={(e) => setPaymentUpiId(e.target.value)}
                      style={{ width: '100%', padding: '0.8cqh 1.2cqw', borderRadius: '6px', background: '#121216', border: '1px solid #333', color: '#fff', fontSize: '1.7cqw' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '1.6cqw', color: '#c4b595', display: 'block', marginBottom: '0.4cqh' }}>Merchant Name *</label>
                    <input
                      type="text"
                      className="staff-text-input"
                      placeholder="e.g. Pehchaan Photobooth"
                      value={paymentMerchantName}
                      onChange={(e) => setPaymentMerchantName(e.target.value)}
                      style={{ width: '100%', padding: '0.8cqh 1.2cqw', borderRadius: '6px', background: '#121216', border: '1px solid #333', color: '#fff', fontSize: '1.7cqw' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1cqw' }}>
                  <div>
                    <label style={{ fontSize: '1.6cqw', color: '#c4b595', display: 'block', marginBottom: '0.4cqh' }}>Amount *</label>
                    <input
                      type="number"
                      min="1"
                      className="staff-text-input"
                      placeholder="99"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      style={{ width: '100%', padding: '0.8cqh 1.2cqw', borderRadius: '6px', background: '#121216', border: '1px solid #333', color: '#fff', fontSize: '1.7cqw' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '1.6cqw', color: '#c4b595', display: 'block', marginBottom: '0.4cqh' }}>Currency</label>
                    <input
                      type="text"
                      className="staff-text-input"
                      placeholder="INR"
                      value={paymentCurrency}
                      onChange={(e) => setPaymentCurrency(e.target.value)}
                      style={{ width: '100%', padding: '0.8cqh 1.2cqw', borderRadius: '6px', background: '#121216', border: '1px solid #333', color: '#fff', fontSize: '1.7cqw' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '1.6cqw', color: '#c4b595', display: 'block', marginBottom: '0.4cqh' }}>Timeout (seconds)</label>
                    <input
                      type="number"
                      min="30"
                      className="staff-text-input"
                      placeholder="300"
                      value={paymentTimeout}
                      onChange={(e) => setPaymentTimeout(e.target.value)}
                      style={{ width: '100%', padding: '0.8cqh 1.2cqw', borderRadius: '6px', background: '#121216', border: '1px solid #333', color: '#fff', fontSize: '1.7cqw' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="staff-btn is-primary"
                  style={{ alignSelf: 'flex-start', marginTop: '0.5cqh' }}
                  onClick={handleSaveIndividualConfig}
                >
                  Save Payment Settings
                </button>
              </div>
            )}

            <div className="staff-divider" style={{ margin: '2cqh 0 1.5cqh' }} />

            {/* EVENT PAYMENT SUMMARY */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8cqh' }}>
                <h3 style={{ fontSize: '2cqw', color: '#e8d5a3', margin: 0 }}>Event Payment Summary</h3>
                <button
                  type="button"
                  className="staff-btn"
                  style={{ padding: '0.3cqh 1cqw', fontSize: '1.4cqw' }}
                  onClick={refreshPaymentSummary}
                >
                  🔄 Refresh
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.8cqw', marginTop: '0.5cqh' }}>
                <div style={{ background: '#121216', padding: '1cqh', borderRadius: '6px', border: '1px solid #282830', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3cqw', color: '#2ecc71', display: 'block', fontWeight: 600 }}>Successful</span>
                  <strong style={{ fontSize: '2.4cqw', color: '#fff' }}>{paymentSummary?.successfulCount || 0}</strong>
                </div>

                <div style={{ background: '#121216', padding: '1cqh', borderRadius: '6px', border: '1px solid #282830', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3cqw', color: '#f39c12', display: 'block', fontWeight: 600 }}>Pending</span>
                  <strong style={{ fontSize: '2.4cqw', color: '#fff' }}>{paymentSummary?.pendingCount || 0}</strong>
                </div>

                <div style={{ background: '#121216', padding: '1cqh', borderRadius: '6px', border: '1px solid #282830', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3cqw', color: '#e74c3c', display: 'block', fontWeight: 600 }}>Failed</span>
                  <strong style={{ fontSize: '2.4cqw', color: '#fff' }}>{paymentSummary?.failedCount || 0}</strong>
                </div>

                <div style={{ background: '#121216', padding: '1cqh', borderRadius: '6px', border: '1px solid #282830', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3cqw', color: '#95a5a6', display: 'block', fontWeight: 600 }}>Cancelled</span>
                  <strong style={{ fontSize: '2.4cqw', color: '#fff' }}>{paymentSummary?.cancelledCount || 0}</strong>
                </div>

                <div style={{ background: '#121216', padding: '1cqh', borderRadius: '6px', border: '1px solid rgba(232, 213, 163, 0.3)', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3cqw', color: '#e8d5a3', display: 'block', fontWeight: 600 }}>Total Collected</span>
                  <strong style={{ fontSize: '2.4cqw', color: '#e8d5a3' }}>
                    {paymentSummary?.currency === 'INR' ? '₹' : (paymentSummary?.currency || '₹') + ' '}
                    {paymentSummary?.totalCollected || 0}
                  </strong>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* 3. PHOTOS, REPRINTS & DOWNLOADS */}
        {showPhotos && (
          <article className="staff-card is-section-photos">
            <div className="staff-card-header">
              <span className="staff-card-badge">GUEST PHOTOS</span>
              <p className="staff-card-kicker">Guest Photos &amp; Reprints</p>
            </div>

            <div className="staff-actions is-two">
              <button
                className="staff-btn is-primary"
                type="button"
                onClick={handleExportAllZip}
              >
                Download All Photos (ZIP)
              </button>
              <button
                className="staff-btn"
                type="button"
                disabled={!selectedSessionId}
                onClick={() => void handleExport(selectedSessionId)}
              >
                Download Selected Photo
              </button>
            </div>
            {exportMessage && <p className="staff-help" style={{ color: '#b9e7c9' }}>{exportMessage}</p>}

            <div className="staff-divider" />

            {completedSessions.length > 0 ? (
              <div className="staff-session-panel">
                {/* 1. SPOTLIGHT CARD (PREVIEW & ACTION BAR) */}
                {selectedSessionId && (
                  <div className="staff-spotlight-card">
                    <div className="staff-spotlight-preview">
                      {sessionPreviews[selectedSessionId] ? (
                        <img
                          src={sessionPreviews[selectedSessionId]}
                          alt="Selected photo strip preview"
                          className="staff-spotlight-img"
                        />
                      ) : (
                        <div className="staff-spotlight-placeholder">
                          <span style={{ fontSize: '2.5cqw' }}>📸</span>
                          <span>Photo Strip</span>
                        </div>
                      )}
                    </div>

                    <div className="staff-spotlight-details">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5cqw' }}>
                        <div>
                          <strong style={{ fontSize: '1.9cqw', color: '#fff' }}>
                            Guest Session #{completedSessions.findIndex((s) => s.sessionId === selectedSessionId) + 1}
                          </strong>
                          <p style={{ margin: '0.2cqh 0 0', fontSize: '1.4cqw', color: '#a8a296' }}>
                            {(() => {
                              const s = completedSessions.find((x) => x.sessionId === selectedSessionId)
                              return s ? `${new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${s.isSynced ? 'Uploaded to Cloud ✓' : 'Waiting to Upload'}` : ''
                            })()}
                          </p>
                        </div>
                        <span className={`staff-badge ${completedSessions.find((x) => x.sessionId === selectedSessionId)?.isSynced ? 'is-ready' : 'is-warning'}`}>
                          {completedSessions.find((x) => x.sessionId === selectedSessionId)?.isSynced ? 'Synced ✓' : 'Pending Upload'}
                        </span>
                      </div>

                      <div className="staff-actions is-three" style={{ marginTop: '0.6cqh' }}>
                        <button
                          className="staff-btn is-primary"
                          type="button"
                          disabled={!pack.printEnabled}
                          onClick={() => void handlePrint(selectedSessionId)}
                        >
                          Print Photo Strip
                        </button>
                        <button
                          className="staff-btn"
                          type="button"
                          disabled={!pack.cloudQrEnabled}
                          onClick={() => void handleViewQr(selectedSessionId)}
                        >
                          Show QR Code
                        </button>
                        <button
                          className="staff-btn"
                          type="button"
                          disabled={!pack.whatsappEnabled}
                          onClick={() => handleOpenWhatsAppModal(selectedSessionId)}
                        >
                          Send WhatsApp
                        </button>
                      </div>

                      {actionInputType === 'whatsapp' && (
                        <div className="staff-input-row">
                          <input
                            className="staff-input"
                            type="tel"
                            placeholder="Enter mobile number: 9876543210 or +91..."
                            value={actionInputValue}
                            onChange={(e) => setActionInputValue(e.target.value)}
                          />
                          <button
                            className="staff-btn is-primary"
                            type="button"
                            onClick={() => void handleSubmitWhatsApp(selectedSessionId)}
                          >
                            Send
                          </button>
                        </div>
                      )}

                      {actionInputType === 'email' && (
                        <div className="staff-input-row">
                          <input
                            className="staff-input"
                            type="email"
                            placeholder="Enter email: guest@example.com"
                            value={actionInputValue}
                            onChange={(e) => setActionInputValue(e.target.value)}
                          />
                          <button
                            className="staff-btn is-primary"
                            type="button"
                            onClick={() => void handleSubmitEmail(selectedSessionId)}
                          >
                            Send
                          </button>
                        </div>
                      )}

                      {deliveryMessage && (
                        <p className="staff-help" style={{ color: '#ecd59c', marginTop: '0.4cqh' }}>
                          {deliveryMessage}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. VISUAL PHOTO GALLERY REEL */}
                <div style={{ marginTop: '1.2cqh' }}>
                  <div className="staff-setting" style={{ marginBottom: '0.4cqh' }}>
                    <span style={{ fontWeight: 600 }}>All Guest Photos</span>
                    <span className="staff-badge is-neutral">{completedSessions.length} total</span>
                  </div>

                  {/* Hidden select for contract/testing compatibility */}
                  <select
                    className="staff-select"
                    style={{ display: 'none' }}
                    value={selectedSessionId}
                    onChange={(e) => {
                      setSelectedSessionId(e.target.value)
                      setActionInputType(null)
                      setDeliveryMessage(null)
                    }}
                  >
                    {completedSessions.map((s, idx) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        Session {s.sessionId} · Photo #{idx + 1}
                      </option>
                    ))}
                  </select>

                  <div className="staff-gallery-grid">
                    {completedSessions.map((s, idx) => {
                      const isSel = s.sessionId === selectedSessionId
                      const prevUrl = sessionPreviews[s.sessionId]
                      return (
                        <button
                          key={s.sessionId}
                          type="button"
                          className={`staff-gallery-card ${isSel ? 'is-selected' : ''}`}
                          onClick={() => {
                            setSelectedSessionId(s.sessionId)
                            setActionInputType(null)
                            setDeliveryMessage(null)
                          }}
                        >
                          {prevUrl ? (
                            <img src={prevUrl} alt={`Photo #${idx + 1}`} className="staff-gallery-thumb" />
                          ) : (
                            <div className="staff-gallery-thumb-placeholder">📸</div>
                          )}
                          <div className="staff-gallery-meta">
                            <p className="staff-gallery-title">Photo #{idx + 1}</p>
                            <p className="staff-gallery-time">
                              {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {s.isSynced ? 'Synced ✓' : 'Pending'}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="staff-help">No guest photos taken yet. Completed photos will appear here as visual photo strips so you can reprint or share them.</p>
            )}
          </article>
        )}


        {/* 4. DEVICE STORAGE, RETENTION & CLEANUP */}
        {showSystem && (
          <>
            <article className="staff-card is-section-system">
              <div className="staff-card-header">
                <span className="staff-card-badge">STORAGE &amp; SAFETY</span>
                <p className="staff-card-kicker">iPad Storage &amp; Photo Safety</p>
              </div>

              <div className="staff-storage">
                <div>
                  <span>Photos saved on iPad</span>
                  <strong>{stats.count}</strong>
                </div>
                <div>
                  <span>Storage space used</span>
                  <strong>{formatBytes(stats.bytes)}</strong>
                </div>
              </div>

              <div className="staff-setting">
                <span>Free storage space</span>
                <strong style={{ color: storageOperational.isHardStop ? '#f5b7b1' : '#b9e7c9' }}>
                  {storageOperational.formattedFreeBytes} free
                </strong>
              </div>

              <div className="staff-setting">
                <span>Storage condition</span>
                <span className={`staff-badge is-${storageOperational.level}`}>
                  {storageOperational.level === 'normal' ? 'HEALTHY (GOOD)' : storageOperational.level.toUpperCase()}
                </span>
              </div>

              <div className="staff-setting">
                <span>Auto-delete policy</span>
                <strong>{retentionStatus?.retentionHours ?? DEFAULT_RETENTION_HOURS} hours default</strong>
              </div>

              <div className="staff-setting">
                <span>Oldest photo on iPad</span>
                <strong>
                  {retentionStatus?.oldestAgeHours !== null && retentionStatus?.oldestAgeHours !== undefined
                    ? `${retentionStatus.oldestAgeHours} hours old`
                    : 'None'}
                </strong>
              </div>

              {retentionStatus?.hasExpiredPhotos && (
                <div className="staff-alert" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '1cqw', background: 'rgba(230, 126, 34, 0.15)', border: '1px solid #d35400', padding: '0.5cqh 1cqw', borderRadius: '0.6cqw' }}>
                  <span className="staff-badge is-warning">RETENTION_EXPIRED</span>
                  <span style={{ fontSize: '1.7cqw', color: '#f5b041' }}>{retentionStatus.warningMessage}</span>
                </div>
              )}

              <p className="staff-help" style={{ fontSize: '1.6cqw' }}>
                Storage guide: Green if 8 GB+ free · Warning below 8 GB · Booth stops if below 2 GB free.
              </p>

              <div className="staff-actions is-two">
                <button
                  className="staff-btn"
                  type="button"
                  onClick={handleRunCleanup}
                >
                  Clean Up Storage
                </button>
                <button
                  className="staff-btn"
                  type="button"
                  onClick={onTestShot}
                >
                  Test Shot
                </button>
              </div>
              {cleanupMessage && <p className="staff-help" style={{ color: '#b9e7c9' }}>{cleanupMessage}</p>}

              <div className="staff-divider" />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1cqw', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button className="staff-reset" type="button" onClick={onResetData}>
                    {resetArmed ? 'Confirm reset test data' : 'Reset test data'}
                  </button>
                  <span style={{ fontSize: '1.3cqw', color: '#a8a29e', marginTop: '0.2cqh' }}>
                    (Deletes test shots only, keeps real guest photos safe)
                  </span>
                </div>

                <button
                  className="staff-btn"
                  type="button"
                  style={{ borderColor: '#8c3a2b', color: '#f5b7b1', background: '#2a1a18' }}
                  onClick={() => void handleOpenWipeModal()}
                >
                  Delete All Event Photos
                </button>
              </div>

              {resetArmed && (
                <div role="alert" style={{ marginTop: '0.6cqh' }}>
                  <p className="staff-alert">Delete test photos only? Real guest photos will remain safe.</p>
                  <button className="staff-reset" onClick={onCancelReset}>Cancel reset</button>
                </div>
              )}
            </article>

            {/* INTERNET, PRINTER & HARDWARE */}
            <article className="staff-card is-section-system">
              <p className="staff-card-kicker">Internet, Printer &amp; Screen</p>

              {syncStats && (
                <div style={{ marginBottom: '1cqh' }}>
                  <div className="staff-storage">
                    <div>
                      <span>Waiting to upload</span>
                      <strong>{syncStats.pendingCount + syncStats.syncingCount}</strong>
                    </div>
                    <div>
                      <span>Uploaded to cloud</span>
                      <strong>{syncStats.syncedCount}</strong>
                    </div>
                  </div>
                  <div className="staff-setting">
                    <span>Cloud Upload Status</span>
                    <strong>
                      {syncStats.isRevoked
                        ? 'Device Revoked'
                        : syncStats.isSyncing
                          ? 'Uploading now...'
                          : !syncStats.isOnline
                            ? 'Offline (Photos saved safely on iPad)'
                            : (syncStats.pendingCount + syncStats.syncingCount) > 0
                              ? 'Upload pending'
                              : 'All photos synced safely ✓'}
                    </strong>
                  </div>
                  {syncMessage && <p className="staff-alert" role="alert">{syncMessage}</p>}
                  <button
                    className="staff-btn staff-wide"
                    type="button"
                    style={{ marginTop: '0.6cqh' }}
                    disabled={busy || syncStats.isSyncing || syncStats.isRevoked}
                    onClick={handleForceSync}
                  >
                    {syncStats.isSyncing ? 'Syncing...' : 'Force Sync'}
                  </button>
                </div>
              )}

              <div className="staff-divider" />

              {/* Printer */}
              <div className="staff-setting">
                <span>Photo Printer</span>
                <span className={`staff-badge is-${printerService.getPrinterAvailability() === 'available' ? 'ready' : 'warning'}`}>
                  {printer ? printer.name : 'No printer connected'} ({printerService.getPrinterAvailability()})
                </span>
              </div>
              {printerService.getHumanReadablePrinterError() && (
                <p className="staff-alert" role="alert">{printerService.getHumanReadablePrinterError()}</p>
              )}
              {printerFeedback && <p className="staff-help">{printerFeedback}</p>}

              <div className="staff-actions is-two" style={{ marginTop: '0.4cqh' }}>
                <button
                  className="staff-btn"
                  type="button"
                  disabled={!pack.printEnabled}
                  onClick={handleTestPrint}
                >
                  Test Print Page
                </button>
                <button
                  className="staff-btn"
                  type="button"
                  onClick={() => {
                    const nextState = printer?.status === 'online' ? 'offline' : 'online'
                    printerService.setPrinterStatus(nextState)
                    setPrinter(printerService.getSelectedPrinter())
                  }}
                >
                  Toggle Printer Online
                </button>
              </div>

              <div className="staff-divider" />

              {/* Screen Brightness */}
              <div className="staff-setting">
                <span>iPad Screen Brightness</span>
                <strong>{Math.round(brightness * 100)}% (Automatically 100% when live)</strong>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(brightness * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100
                  setStaffBrightnessOverride(val)
                  setBrightness(val)
                }}
                style={{ width: '100%', marginTop: '0.4cqh' }}
              />

              <div className="staff-divider" />

              {/* Network & Battery */}
              <div className="staff-setting">
                <span>Internet Connection</span>
                <span className={`staff-badge ${networkInfo.isOnline ? 'is-ready' : 'is-warning'}`}>
                  {networkInfo.isOnline ? 'Online (Connected)' : 'Offline (No internet)'}
                </span>
              </div>
              <div className="staff-setting">
                <span>iPad Battery</span>
                <strong>
                  {batteryInfo?.isAvailable ? batteryInfo.displayStatus : 'Battery status normal'}
                </strong>
              </div>
            </article>
          </>
        )}
      </fieldset>

      {/* ORIENTATION WIZARD MODAL */}
      {wizardOpen && (
        <OrientationWizard
          isOpen={wizardOpen}
          onConfirmed={(saved: BoothMountConfig) => {
            setMountConfig(saved)
            setWizardOpen(false)
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {/* CLOUD & LOCAL QR MODAL */}
      {qrModal?.isOpen && (
        <div className="staff-modal-overlay" onClick={() => setQrModal(null)}>
          <div className="staff-modal-card staff-qr-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wipe-modal-close"
              aria-label="Close"
              onClick={() => setQrModal(null)}
            >
              ✕
            </button>

            <div className="qr-modal-badge">
              <span>{qrModal.shareUrl.startsWith('https://') ? '🌐' : '📶'}</span>
              <span>
                {qrModal.shareUrl.startsWith('https://')
                  ? 'PUBLIC INTERNET QR (NO WI-FI NEEDED)'
                  : 'LOCAL WI-FI QR'}
              </span>
            </div>

            <h3 className="staff-modal-title">Scan QR for Photos</h3>
            <p className="qr-modal-desc">
              {qrModal.shareUrl.startsWith('https://')
                ? 'Guests can scan with any phone on 4G / 5G Mobile Data (no Wi-Fi needed) to save photos.'
                : 'Guests on the same Wi-Fi can scan to view and save their photos.'}
            </p>

            <div className="staff-qr-box" dangerouslySetInnerHTML={{ __html: qrModal.qrSvg }} />

            <div className="qr-link-container">
              <span className="qr-link-url">{qrModal.shareUrl}</span>
              <button
                type="button"
                className={`qr-copy-btn ${copiedLink ? 'is-copied' : ''}`}
                onClick={() => void handleCopyQrLink(qrModal.shareUrl)}
              >
                {copiedLink ? 'Copied! ✓' : '📋 Copy'}
              </button>
            </div>

            {/* Network / Cloud Host Switcher */}
            <div className="qr-host-switcher">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="qr-host-label">Delivery Mode / Network Link:</label>
                {!publicTunnelUrl && (
                  <button
                    type="button"
                    className="qr-tunnel-btn"
                    disabled={isStartingTunnel}
                    onClick={() => void handleStartOrRefreshTunnel()}
                  >
                    {isStartingTunnel ? 'Connecting...' : '⚡ Generate Public Cloud Link'}
                  </button>
                )}
              </div>
              <select
                className="staff-select qr-host-select"
                value={qrModal.activeHost || (publicTunnelUrl || (serverLanIp ? `${serverLanIp}:${serverPort}` : `localhost:${serverPort}`))}
                onChange={(e) => handleChangeQrHost(e.target.value)}
              >
                {publicTunnelUrl && (
                  <option value={publicTunnelUrl}>
                    🌐 Public Cloud Link ({publicTunnelUrl}) [Works on 4G/5G - No Wi-Fi Needed]
                  </option>
                )}
                {serverLanIp && (
                  <option value={`${serverLanIp}:${serverPort}`}>
                    📶 Local Wi-Fi Network ({serverLanIp}:{serverPort}) [Same Wi-Fi Required]
                  </option>
                )}
                {serverLanIps.filter((ip) => ip !== serverLanIp).map((ip) => (
                  <option key={ip} value={`${ip}:${serverPort}`}>
                    Alternate Local Network ({ip}:{serverPort})
                  </option>
                ))}
                <option value={`localhost:${serverPort}`}>
                  💻 Localhost ({serverPort}) [For Testing on This Computer]
                </option>
              </select>
            </div>

            {/* Custom Domain Input */}
            <div className="qr-custom-row">
              <input
                type="text"
                className="staff-input qr-custom-input"
                placeholder="Or type custom URL / domain (e.g. https://mybooth.com)"
                value={customHostInput}
                onChange={(e) => setCustomHostInput(e.target.value)}
              />
              <button
                type="button"
                className="staff-btn is-primary"
                disabled={!customHostInput.trim()}
                onClick={handleApplyCustomHost}
              >
                Apply
              </button>
            </div>

            <div className="qr-notice-box">
              <span className="qr-notice-icon">{qrModal.shareUrl.startsWith('https://') ? '✅' : '💡'}</span>
              <p className="qr-notice-text">
                {qrModal.shareUrl.startsWith('https://') ? (
                  <span>
                    <strong style={{ color: '#2ecc71' }}>Works Everywhere:</strong> Guests can scan with <strong>Mobile Data (4G/5G) or any Wi-Fi</strong>. Photos will open and download instantly.
                  </span>
                ) : qrModal.shareUrl.includes('localhost') || qrModal.shareUrl.includes('127.0.0.1') ? (
                  <span>
                    <strong style={{ color: '#f5b041' }}>Notice:</strong> <code>localhost</code> is for testing on this computer. For phones on 4G/5G, use the <strong>Public Cloud Link</strong> above.
                  </span>
                ) : (
                  <span>
                    <strong>Wi-Fi Note:</strong> Local Wi-Fi link requires guest smartphones to be connected to the same Wi-Fi router. For 4G/5G guests without Wi-Fi, select the <strong>Public Cloud Link</strong> above.
                  </span>
                )}
              </p>
            </div>

            <div className="qr-modal-actions">
              <button
                className="staff-btn staff-wide"
                type="button"
                onClick={() => window.open(qrModal.shareUrl, '_blank')}
              >
                ↗ Open Gallery
              </button>
              <button
                className="staff-btn is-primary staff-wide"
                type="button"
                onClick={() => setQrModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP DELIVERY MODAL */}
      {whatsAppModal?.isOpen && (
        <div className="staff-modal-overlay" onClick={() => setWhatsAppModal(null)}>
          <div className="staff-modal-card staff-share-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wipe-modal-close"
              aria-label="Close"
              onClick={() => setWhatsAppModal(null)}
            >
              ✕
            </button>

            <div className="whatsapp-badge">
              <span>💬</span>
              <span>WHATSAPP & SMS DELIVERY</span>
            </div>

            <h3 className="staff-modal-title">Send Photo to Guest</h3>
            <p className="qr-modal-desc">
              Enter guest's mobile number. Tap <strong>Open WhatsApp</strong> or <strong>Send via SMS</strong> to deliver the photo link instantly.
            </p>

            <div className="share-input-group">
              <label className="share-input-label">Guest Mobile Number (10 digits or with country code):</label>
              <input
                type="tel"
                className="share-input-box"
                placeholder="e.g. 9876543210 or +919876543210"
                value={whatsAppModal.phoneNumber}
                onChange={(e) => {
                  const val = e.target.value
                  setWhatsAppModal((prev) => prev ? {
                    ...prev,
                    phoneNumber: val,
                    error: null,
                  } : null)
                }}
                autoFocus
              />
            </div>

            <div className="share-preview-card">
              <p className="share-preview-title">Guest Will Receive</p>
              <p className="share-preview-text">{whatsAppModal.previewMessage}</p>
            </div>

            {whatsAppModal.error && (
              <p className="staff-alert" role="alert" style={{ color: '#ff7675' }}>
                ⚠️ {whatsAppModal.error}
              </p>
            )}

            {whatsAppModal.status && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(46, 204, 113, 0.15)', border: '1px solid #2ecc71', borderRadius: '0.6rem', width: '100%', textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#2ecc71', fontWeight: 600 }}>
                  {whatsAppModal.status}
                </p>
                {whatsAppModal.handoffUrl && (
                  <button
                    type="button"
                    className="staff-btn"
                    style={{ marginTop: '0.5rem', background: '#27ae60', color: '#fff', fontSize: '0.82rem', padding: '0.4rem 0.8rem', border: 'none' }}
                    onClick={() => window.open(whatsAppModal.handoffUrl, '_blank')}
                  >
                    ↗ Open WhatsApp Link Directly
                  </button>
                )}
              </div>
            )}

            <div className="qr-modal-actions" style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              <button
                type="button"
                className="whatsapp-btn-send"
                onClick={() => void handleSendWhatsAppFromModal()}
              >
                💬 Open WhatsApp to Send
              </button>
              <button
                type="button"
                className="staff-btn is-primary"
                style={{ background: '#3498db', borderColor: '#2980b9' }}
                onClick={() => handleSendSmsFromModal()}
              >
                📱 Send via SMS
              </button>
              <button
                type="button"
                className={`qr-copy-btn ${copiedLink ? 'is-copied' : ''}`}
                style={{ padding: '0.85rem 1.2rem', fontSize: '0.9rem' }}
                onClick={() => void handleCopyQrLink(whatsAppModal.previewMessage)}
              >
                {copiedLink ? 'Copied! ✓' : '📋 Copy Link'}
              </button>
              <button
                type="button"
                className="staff-btn"
                onClick={() => setWhatsAppModal(null)}
              >
                {whatsAppModal.status ? 'Done ✓' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREFLIGHT CHECK RESOLUTION MODAL */}
      {preflightModalOpen && preflightEval && (
        <div className="staff-modal-overlay" onClick={() => setPreflightModalOpen(false)}>
          <div className="preflight-modal" onClick={(e) => e.stopPropagation()}>
            <header className="preflight-header">
              <h2 className="wizard-title">Before Opening the Booth</h2>
              <p className="wizard-subtitle">
                Please make sure everything is ready before welcoming guests:
              </p>
            </header>

            <div className="preflight-list">
              {preflightEval.items.map((check) => (
                <div
                  key={check.id}
                  className={`preflight-item is-${check.isPassed ? 'passed' : check.isWaived ? 'waived' : 'failed'}`}
                >
                  <div className="preflight-item-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`staff-badge is-${check.isPassed ? 'ready' : check.isWaived ? 'warning' : 'error'}`}>
                        {check.isPassed ? 'READY ✓' : check.isWaived ? 'IGNORED' : 'NEEDS ATTENTION ⚠'}
                      </span>
                      <p className="preflight-item-title">{check.name}</p>
                    </div>
                    {check.remediationMessage && (
                      <p className="preflight-item-remediation">{check.remediationMessage}</p>
                    )}
                    {!check.isPassed && check.isWaivable && (
                      <label className="preflight-waive-label">
                        <input
                          type="checkbox"
                          checked={waivedChecks.has(check.id)}
                          onChange={() => handleToggleWaiveCheck(check.id)}
                        />
                        Ignore this check for now
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="wizard-actions">
              <button
                type="button"
                className="wizard-btn-primary"
                disabled={!preflightEval.canStart}
                onClick={handleConfirmPreflightAndStart}
              >
                {preflightEval.canStart ? 'Open Booth to Guests' : 'Fix Issues to Start'}
              </button>
              <button
                type="button"
                className="wizard-btn-secondary"
                onClick={() => setPreflightModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* END-EVENT SAFE WIPE MODAL */}
      {wipeModalOpen && (
        <div className="staff-modal-overlay" onClick={() => setWipeModalOpen(false)}>
          <div className="wipe-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wipe-modal-close"
              aria-label="Close"
              onClick={() => setWipeModalOpen(false)}
            >
              ✕
            </button>

            <header className="wipe-modal-header">
              <span className="wipe-badge">⚠️ DANGER ZONE · EVENT WIPE</span>
              <h2 className="wipe-title">Delete All Event Photos</h2>
              <p className="wipe-subtitle">
                Permanently delete local photos from this iPad after your event is finished.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', margin: '0 0 0.5rem' }}>
              <div className="wipe-info-card">
                <span className="wipe-info-icon" aria-hidden="true">🛡️</span>
                <p className="wipe-info-text">
                  <strong>Staff PIN and settings will remain safe.</strong> Only photo files taken during this event will be cleared from iPad storage.
                </p>
              </div>

              {pendingOutboxCount > 0 && (
                <div className="wipe-outbox-warning">
                  <p className="wipe-outbox-title">
                    <span>⚠️</span> Warning: {pendingOutboxCount} photo(s) waiting for cloud upload!
                  </p>
                  <p className="wipe-outbox-desc">
                    Deleting now will permanently erase un-synced photos. We strongly recommend downloading a ZIP backup first.
                  </p>
                  <button
                    className="staff-btn is-primary staff-wide"
                    type="button"
                    onClick={handleExportAllZip}
                  >
                    Download ZIP Backup First
                  </button>
                </div>
              )}

              {wipeReport && (
                <div style={{ padding: '0.9rem 1.1rem', background: wipeReport.success ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)', border: `1px solid ${wipeReport.success ? '#2ecc71' : '#e74c3c'}`, borderRadius: '0.85rem' }}>
                  <p style={{ margin: 0, fontSize: '0.92rem', color: wipeReport.success ? '#b9e7c9' : '#f5b7b1', fontWeight: 500 }}>
                    {wipeReport.message}
                  </p>
                </div>
              )}

              {wipeError && (
                <p className="staff-alert" role="alert">{wipeError}</p>
              )}

              {!wipeReport?.success && (
                <div className="wipe-input-container">
                  <label className="wipe-input-label">
                    To confirm permanent deletion, type <span className="wipe-keyword">DELETE</span> below:
                  </label>
                  <input
                    className="wipe-input-box"
                    type="text"
                    placeholder="Type DELETE"
                    value={wipeConfirmText}
                    onChange={(e) => setWipeConfirmText(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="wipe-actions">
              {!wipeReport?.success ? (
                <>
                  <button
                    type="button"
                    className="wipe-btn-confirm"
                    disabled={wipeConfirmText.trim().toUpperCase() !== 'DELETE'}
                    onClick={() => void handlePerformWipe(pendingOutboxCount > 0)}
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    className="wipe-btn-cancel"
                    onClick={() => setWipeModalOpen(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="wipe-btn-confirm"
                  onClick={() => {
                    setWipeModalOpen(false)
                    setWipeReport(null)
                  }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EVENT ACTIVATION MODAL */}
      {activationModalOpen && (
        <div className="staff-modal-backdrop" onClick={() => !activationLoading && setActivationModalOpen(false)}>
          <div className="staff-modal is-activation" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', width: '92%' }}>
            <div className="staff-modal-head">
              <div>
                <h2>{activeEventDetails ? 'Switch Photobooth Event' : 'Activate School Event'}</h2>
                <p>Scan the activation QR or enter the 6-character Event ID from the Admin Portal.</p>
              </div>
              <button
                type="button"
                className="staff-modal-close"
                disabled={activationLoading}
                onClick={() => setActivationModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="staff-modal-body" style={{ padding: '1.4rem 1.6rem' }}>
              {activationError && (
                <div className="staff-alert is-error" style={{ marginBottom: '1.1rem' }}>
                  <span>⚠️</span>
                  <span>{activationError}</span>
                </div>
              )}

              {!activationResult ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                  <div className="staff-field">
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.45rem', display: 'block' }}>
                      Event ID or Scanned QR Code Payload
                    </label>
                    <input
                      type="text"
                      className="staff-input"
                      placeholder="e.g. PEH-ABC123"
                      value={activationInput}
                      onChange={(e) => {
                        setActivationInput(e.target.value.toUpperCase())
                        setActivationError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleValidateEvent()
                      }}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        padding: '0.75rem 1rem',
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(0,0,0,0.5)',
                        border: '1.5px solid #c6a15b',
                        color: '#f7f1e6',
                        borderRadius: '8px',
                      }}
                      autoFocus
                    />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem', display: 'block' }}>
                      Enter the unique Event ID generated on the Admin Activation page (e.g. <code>PEH-123456</code>).
                    </span>
                  </div>

                  <button
                    type="button"
                    className="staff-btn is-primary"
                    style={{ width: '100%', padding: '0.85rem', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}
                    onClick={handleValidateEvent}
                    disabled={activationLoading || !activationInput.trim()}
                  >
                    {activationLoading ? 'Validating Event with Cloud...' : 'Continue & Validate Event →'}
                  </button>
                </div>
              ) : (
                /* VALIDATION RESULT CONFIRMATION CARD */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div
                    style={{
                      background: 'rgba(198, 161, 91, 0.09)',
                      border: '2px solid #c6a15b',
                      borderRadius: '12px',
                      padding: '1.25rem',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                      ✓ Verified &amp; Ready for Deployment
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#cbd5e1', fontWeight: 600 }}>
                      {(activationResult.event as any).schoolName || 'Pehchaan Model School'}
                    </div>
                    <h3 style={{ margin: '0.2rem 0 0.6rem', fontSize: '1.35rem', color: '#fff' }}>
                      {activationResult.event.name}
                    </h3>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
                        fontSize: '0.82rem',
                        borderTop: '1px solid rgba(198, 161, 91, 0.25)',
                        paddingTop: '0.85rem',
                      }}
                    >
                      <div>
                        <span style={{ color: '#94a3b8' }}>Event ID:</span>{' '}
                        <strong style={{ color: '#c6a15b', fontFamily: 'monospace' }}>{activationResult.event.eventId}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Date:</span>{' '}
                        <strong style={{ color: '#fff' }}>{activationResult.event.eventDate || 'Scheduled'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Venue:</span>{' '}
                        <strong style={{ color: '#fff' }}>{activationResult.event.venue || 'Campus'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Photo Mode:</span>{' '}
                        <strong style={{ color: '#fff' }}>{(activationResult.eventPack as any).shotCount || 3} shots</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="staff-btn"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setActivationResult(null)}
                      disabled={activationLoading}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="staff-btn is-primary"
                      style={{ flex: 2, justifyContent: 'center', fontWeight: 700, padding: '0.8rem' }}
                      onClick={handleConfirmLoadEvent}
                      disabled={activationLoading}
                    >
                      {activationLoading ? 'Loading Configuration...' : 'Confirm & Load Event Pack ✓'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </section>
  )
}

function FeatureToggle({
  label,
  on,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string
  on: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <div className={`${on ? 'staff-flag is-on' : 'staff-flag'}${disabled ? ' is-disabled' : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{label}</span>
        {disabledReason && <span style={{ fontSize: '0.72rem', color: '#f5b041' }}>{disabledReason}</span>}
      </div>
      <button
        className="staff-toggle"
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
      >
        <span>{on ? 'On' : 'Off'}</span>
        <span className="staff-toggle-track" aria-hidden="true"><span /></span>
      </button>
    </div>
  )
}

