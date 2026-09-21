import { useCallback, useEffect, useRef, useState } from 'react'
import { FALLBACK_PACK_ID, getFallbackPack } from '../eventPack/fallbackPack'
import type { EventPack, EventStatus, PackFeatureFlag, PackLanguage } from '../eventPack/types'
import { parseEventPackJson, validateEventPack } from '../eventPack/validatePack'
import { EVENT_PACK_KEY, EVENT_STATUS_KEY, STAFF_AUTH_KEY, ACTIVE_EVENT_DETAILS_KEY, clearTestMedia, getMetaValue, getStorageStats, putMetaValue } from '../lib/photoStore'
import { messageFromUnknown } from '../lib/storageError'
import { createStaffAuth, isStaffAuthState, MAX_PIN_ATTEMPTS, verifyStaffPin, type StaffAuthState } from '../staff/pinAuth'
import type { StorageStats } from '../types'
import { evaluateStorageStatus } from '../lib/storageLimits'
import { syncWorker } from '../sync/syncWorker'
import { heartbeatClient } from '../sync/heartbeatClient'
import type { SyncStats } from '../sync/types'

export interface ActiveEventDetails {
  eventId: string
  eventName: string
  eventDate?: string | null
  venue?: string | null
  schoolName?: string | null
  activatedAt: string
  configVersion?: string | number
  status?: string
}

export type OperatorView = 'none' | 'pin' | 'staff'

export function useOperator() {
  const [ready, setReady] = useState(false)
  const [pack, setPack] = useState<EventPack>(getFallbackPack)
  const [activeEventDetails, setActiveEventDetails] = useState<ActiveEventDetails | null>(null)
  const [eventStatus, setEventStatus] = useState<EventStatus>('paused')
  const [auth, setAuth] = useState<StaffAuthState | null>(null)
  const [view, setView] = useState<OperatorView>('none')
  const [packError, setPackError] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageStats, setStorageStats] = useState<StorageStats>({ count: 0, bytes: 0 })
  const [syncStats, setSyncStats] = useState<SyncStats>({
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    totalCount: 0,
    lastSyncTime: null,
    lastError: null,
    isSyncing: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isRevoked: false,
  })
  const [resetArmed, setResetArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const authRef = useRef<StaffAuthState | null>(null)
  const packRef = useRef(pack)
  const authenticated = useRef(false)
  const busyRef = useRef(false)
  const loginGeneration = useRef(0)
  const statsGeneration = useRef(0)

  const refreshStorage = useCallback(async () => {
    const generation = ++statsGeneration.current
    try {
      const stats = await getStorageStats()
      const sync = await syncWorker.getStats()
      if (generation === statsGeneration.current) {
        setStorageStats(stats)
        setSyncStats(sync)
        setStorageError(null)
      }
    } catch (error) {
      if (generation === statsGeneration.current) setStorageError(`Could not refresh storage. ${messageFromUnknown(error, 'Try again.')}`)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const storedPack = await getMetaValue<unknown>(EVENT_PACK_KEY)
        const storedStatus = await getMetaValue<unknown>(EVENT_STATUS_KEY)
        const storedAuth = await getMetaValue<unknown>(STAFF_AUTH_KEY)
        const storedDetails = await getMetaValue<ActiveEventDetails>(ACTIVE_EVENT_DETAILS_KEY)
        if (cancelled) return

        // 1. Try to automatically load active event pack from server
        let serverPack: EventPack | null = null
        let serverDetails: ActiveEventDetails | null = null
        let serverPin: string | null = null
        let serverStatus: EventStatus | null = null

        try {
          let paramEventId: string | null = null
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            paramEventId = params.get('eventId') || params.get('id')
          }
          const fetchUrl = paramEventId ? `/api/booth/active?eventId=${encodeURIComponent(paramEventId)}` : '/api/booth/active'
          const res = await fetch(fetchUrl)
          if (res.ok) {
            const data = await res.json()
            if (data.success && data.eventPack) {
              const val = validateEventPack(data.eventPack)
              if (val.ok) {
                serverPack = val.pack
                serverPin = data.staffPin || data.eventPack.staffPin || null
                serverStatus = data.event?.status === 'ended' ? 'ended' : data.event?.status === 'paused' ? 'paused' : 'live'
                serverDetails = {
                  eventId: data.event.eventId,
                  eventName: data.event.name,
                  schoolName: data.event.schoolName,
                  eventDate: data.event.eventDate,
                  venue: data.event.venue,
                  status: data.event.status,
                  activatedAt: new Date().toISOString(),
                }
              }
            }
          }
        } catch {
          // Server offline / network error; continue with local storage
        }

        if (cancelled) return

        let nextPack: EventPack
        let nextDetails: ActiveEventDetails | null = storedDetails || null
        let nextStatus: EventStatus

        if (serverPack) {
          nextPack = serverPack
          nextDetails = serverDetails
          nextStatus = serverStatus || 'live'
          await putMetaValue(EVENT_PACK_KEY, nextPack)
          if (nextDetails) await putMetaValue(ACTIVE_EVENT_DETAILS_KEY, nextDetails)
          await putMetaValue(EVENT_STATUS_KEY, nextStatus)
        } else {
          const result = validateEventPack(storedPack)
          nextPack = result.ok ? result.pack : getFallbackPack()
          if (!result.ok) await putMetaValue(EVENT_PACK_KEY, nextPack)
          nextStatus = storedStatus === 'live' || storedStatus === 'paused' || storedStatus === 'ended' ? storedStatus : 'live'
          if (nextStatus !== storedStatus) await putMetaValue(EVENT_STATUS_KEY, nextStatus)
        }

        if (cancelled) return
        packRef.current = nextPack
        setPack(nextPack)
        if (nextDetails && nextDetails.eventId) {
          setActiveEventDetails(nextDetails)
        }
        setEventStatus(nextStatus)

        // Handle Staff Auth
        let nextAuth: any
        if (serverPin) {
          nextAuth = await createStaffAuth(serverPin)
          await putMetaValue(STAFF_AUTH_KEY, nextAuth)
        } else if (storedAuth !== undefined && isStaffAuthState(storedAuth)) {
          nextAuth = storedAuth
        } else {
          nextAuth = await createStaffAuth(nextPack.staffPin || '1234')
          await putMetaValue(STAFF_AUTH_KEY, nextAuth)
        }

        if (cancelled) return
        authRef.current = nextAuth
        setAuth(nextAuth)
      } catch (error) {
        if (!cancelled) {
          authRef.current = null
          setAuth(null)
          setPinError(`Staff access is unavailable. ${messageFromUnknown(error, 'Reload to retry.')}`)
        }
      } finally {
        if (!cancelled) {
          setReady(true)
          void refreshStorage()
          syncWorker.init()
          heartbeatClient.start()
        }
      }
    }
    void boot()
    return () => { cancelled = true; loginGeneration.current += 1 }
  }, [refreshStorage])

  useEffect(() => {
    const unsubscribe = syncWorker.subscribe((stats) => {
      setSyncStats(stats)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const openStaff = useCallback(() => {
    loginGeneration.current += 1
    authenticated.current = false
    if (authRef.current) setPinError(null)
    setView('pin')
  }, [])

  const exitStaff = useCallback(() => {
    loginGeneration.current += 1
    authenticated.current = false
    setView('none')
    setResetArmed(false)
  }, [])

  const leaveForTest = useCallback(() => {
    setResetArmed(false)
    setView('none')
  }, [])

  const reenterStaff = useCallback(() => {
    if (authenticated.current && authRef.current) setView('staff')
    else openStaff()
  }, [openStaff])

  const submitPin = useCallback(async (pin: string) => {
    if (busyRef.current) return
    const current = authRef.current
    if (!current) {
      setPinError('Staff authentication is unavailable. Reload to retry; Staff access remains blocked.')
      return
    }
    const generation = loginGeneration.current
    busyRef.current = true
    setBusy(true)
    try {
      const result = await verifyStaffPin(pin, current)
      await putMetaValue(STAFF_AUTH_KEY, result.auth)
      authRef.current = result.auth
      setAuth(result.auth)
      if (generation !== loginGeneration.current) return
      if (result.ok) {
        authenticated.current = true
        setPinError(null)
        await refreshStorage()
        if (generation !== loginGeneration.current) return
        setView('staff')
      } else {
        setPinError(result.reason === 'locked' ? null : `Incorrect PIN. ${MAX_PIN_ATTEMPTS - result.auth.failedAttempts} attempts remaining.`)
      }
    } catch (error) {
      authenticated.current = false
      authRef.current = null
      setAuth(null)
      setPinError(`Staff verification could not be saved. Reload to retry. ${messageFromUnknown(error, '')}`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [refreshStorage])

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (!authenticated.current || !authRef.current || busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setPackError(null)
    try {
      await action()
      return true
    } catch (error) {
      setPackError(`Action failed. ${messageFromUnknown(error, 'Please try again.')}`)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const persistPack = useCallback(async (next: EventPack) => {
    await putMetaValue(EVENT_PACK_KEY, next)
    packRef.current = next
    setPack(next)
  }, [])
  const changeStatus = useCallback((next: EventStatus) => runAction(async () => {
    await putMetaValue(EVENT_STATUS_KEY, next)
    setEventStatus(next)
  }), [runAction])
  const restoreFallbackPack = useCallback(() => runAction(async () => {
    const fallback = getFallbackPack()
    const current = packRef.current
    const nextPack = {
      ...fallback,
      whatsappEnabled: current.whatsappEnabled,
      emailEnabled: current.emailEnabled,
      cloudQrEnabled: current.cloudQrEnabled,
      printEnabled: current.printEnabled,
    }
    await putMetaValue(ACTIVE_EVENT_DETAILS_KEY, null)
    setActiveEventDetails(null)
    return persistPack(nextPack)
  }), [runAction, persistPack])

  const activateBoothEvent = useCallback(async (newPack: EventPack, eventDetails: ActiveEventDetails) => {
    return runAction(async () => {
      const validation = validateEventPack(newPack)
      if (!validation.ok) {
        throw new Error(`Event Pack is invalid: ${validation.errors.join(' ')}`)
      }
      await putMetaValue(EVENT_PACK_KEY, validation.pack)
      await putMetaValue(ACTIVE_EVENT_DETAILS_KEY, eventDetails)
      await putMetaValue(EVENT_STATUS_KEY, 'live')
      if (validation.pack.staffPin) {
        const nextAuth = await createStaffAuth(validation.pack.staffPin)
        await putMetaValue(STAFF_AUTH_KEY, nextAuth)
        authRef.current = nextAuth
        setAuth(nextAuth)
      }
      packRef.current = validation.pack
      setPack(validation.pack)
      setActiveEventDetails(eventDetails)
      setEventStatus('live')
    })
  }, [runAction])

  const setPackFlag = useCallback((flag: PackFeatureFlag, enabled: boolean) => runAction(async () => {
    await persistPack({ ...packRef.current, [flag]: enabled })
  }), [runAction, persistPack])
  const setLanguage = useCallback((language: PackLanguage) => runAction(() => persistPack({ ...packRef.current, language })), [runAction, persistPack])
  const loadPackJson = useCallback((text: string) => runAction(async () => {
    const result = parseEventPackJson(text)
    if (!result.ok) throw new Error(`Event Pack rejected. ${result.errors.join(' ')}`)
    await persistPack(result.pack)
  }), [runAction, persistPack])
  const resetTestData = useCallback(async () => {
    if (!authenticated.current || busyRef.current) return
    if (!resetArmed) { setResetArmed(true); return }
    await runAction(async () => {
      await clearTestMedia()
      setResetArmed(false)
      await refreshStorage()
    })
  }, [resetArmed, runAction, refreshStorage])

  const forceSync = useCallback(async () => {
    return syncWorker.forceSync()
  }, [])

  const setPaymentConfig = useCallback((payment: import('../eventPack/types').EventPackPaymentConfig) => runAction(async () => {
    await persistPack({ ...packRef.current, payment })
  }), [runAction, persistPack])

  return {
    ready, pack, eventStatus, view, packError, pinError, storageError, busy,
    activeEventDetails, activateBoothEvent,
    language: pack.language, setLanguage, storageStats, syncStats, resetArmed,
    storageOperationalStatus: evaluateStorageStatus(storageStats),
    lockUntil: auth?.lockUntil ?? null, authAvailable: Boolean(auth),
    usingFallback: pack.id === FALLBACK_PACK_ID,
    openStaff, exitStaff, leaveForTest, reenterStaff, submitPin,
    startEvent: () => changeStatus('live'), pauseEvent: () => changeStatus('paused'), endEvent: () => changeStatus('ended'),
    restoreFallbackPack, loadPackJson, setPackFlag, setPaymentConfig, resetTestData, refreshStorage, forceSync,
    cancelReset: () => setResetArmed(false),
  }
}
