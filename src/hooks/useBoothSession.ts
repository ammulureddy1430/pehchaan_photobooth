import { useCallback, useEffect, useRef, useState } from 'react'
import { createId } from '../lib/ids'
import { compositionFromPack, supportsShotMode } from '../eventPack/compositionFromPack'
import type { EventPack } from '../eventPack/types'
import { buildPhotoRecord } from '../media/buildPhotoRecord'
import { composeToJpeg } from '../media/composition'
import { clearActiveSession, commitCapture, compositionDerivedId, getActiveSession, getDerived, getPhotosByIds, getStorageStats, putActiveSession, putSessionComposition } from '../lib/photoStore'
import { messageFromUnknown, StorageError } from '../lib/storageError'
import { evaluateStorageStatus } from '../lib/storageLimits'
import { getBoothMountConfig, isMountConfirmed } from '../lib/orientationWizard'
import { DEFAULT_SHOT_MODE, type BoothSession, type FlowStep, type SessionKind, type ShotMode } from '../types'
import { enqueueSessionForSync } from '../sync/outboxManager'
import { syncWorker } from '../sync/syncWorker'

type BoothSessionOptions = {
  pack: EventPack
  operatorReady: boolean
  refreshStorage: () => Promise<void>
  onIdle?: (kind: SessionKind) => void
}

export function useBoothSession({ pack, operatorReady, refreshStorage, onIdle }: BoothSessionOptions) {
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<FlowStep>('attract')
  const [mode, setMode] = useState<ShotMode>(DEFAULT_SHOT_MODE)
  const [session, setSession] = useState<BoothSession | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null)
  const [composedUrl, setComposedUrl] = useState<string | null>(null)
  const [storageMessage, setStorageMessage] = useState<string | null>(null)
  const [recoveryBlocked, setRecoveryBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const sessionRef = useRef<BoothSession | null>(null)
  const packRef = useRef(pack)
  packRef.current = pack
  const urls = useRef<Record<string, string>>({})
  const originalUrl = useRef<string | null>(null)
  const compositionUrl = useRef<string | null>(null)
  const generation = useRef(0)
  const actionBusy = useRef(false)

  const syncOriginal = useCallback((next: string | null) => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current)
    originalUrl.current = next
    setCurrentPhotoUrl(next)
  }, [])
  const syncComposition = useCallback((next: string | null) => {
    if (compositionUrl.current) URL.revokeObjectURL(compositionUrl.current)
    compositionUrl.current = next
    setComposedUrl(next)
  }, [])
  const clearUrls = useCallback(() => {
    Object.values(urls.current).forEach(url => URL.revokeObjectURL(url))
    urls.current = {}
    setPhotoUrls({})
    syncOriginal(null)
    syncComposition(null)
  }, [syncOriginal, syncComposition])
  const activate = useCallback((next: BoothSession | null) => {
    generation.current += 1
    setComposing(false)
    sessionRef.current = next
    setSession(next)
    setStep(next?.step ?? 'attract')
  }, [])

  const renderComposition = useCallback(async (active: BoothSession) => {
    const token = ++generation.current
    const isCurrent = () => token === generation.current && sessionRef.current?.id === active.id && sessionRef.current.revision === active.revision && sessionRef.current.step === 'final-review'
    setComposing(true)
    try {
      const photos = await getPhotosByIds(active.photoIds.filter((id): id is string => id !== null))
      if (!isCurrent()) return
      if (photos.length !== active.mode) throw new Error('Some session photos are missing.')
      const spec = await compositionFromPack(active.packSnapshot, active.mode)
      if (!isCurrent()) return
      const jpeg = await composeToJpeg(spec, new Map(photos.map(photo => [photo.shotNumber, photo.original])))
      if (!isCurrent()) return
      const saved = await putSessionComposition({
        id: compositionDerivedId(active.id), sessionId: active.id,
        kind: 'test-composition', sessionKind: active.kind, revision: active.revision,
        blob: jpeg, createdAt: Date.now(), byteSize: jpeg.size,
      }, isCurrent)
      if (saved) {
        if (isCurrent()) syncComposition(URL.createObjectURL(jpeg))
        await refreshStorage()
      }
    } catch (error) {
      if (isCurrent()) setStorageMessage(`Composition failed; original photos are saved. Retake or retry the composition. ${messageFromUnknown(error, '')}`)
    } finally {
      if (isCurrent()) setComposing(false)
    }
  }, [refreshStorage, syncComposition])

  useEffect(() => {
    if (!operatorReady) return
    let cancelled = false
    async function boot() {
      try {
        const active = await getActiveSession(packRef.current)
        if (cancelled || !active) return
        const photos = await getPhotosByIds(active.photoIds.filter((id): id is string => id !== null))
        if (cancelled) return
        for (const [index, id] of active.photoIds.entries()) {
          if (id && !photos.some(photo => photo.id === id && photo.sessionId === active.id && photo.shotIndex === index && photo.shotNumber === index + 1)) {
            throw new Error('The saved session references missing or mismatched photos. Return to start; existing photos will be kept.')
          }
        }
        // Upgrade legacy sessions once, retaining originals and freezing the available pack.
        await putActiveSession(active)
        if (cancelled) return
        clearUrls()
        urls.current = Object.fromEntries(photos.map(photo => [photo.id, URL.createObjectURL(photo.thumbnail ?? photo.original)]))
        setPhotoUrls(urls.current)
        const current = photos.find(photo => photo.id === active.photoIds[active.currentShotIndex])
        syncOriginal(current ? URL.createObjectURL(current.original) : null)
        activate(active)
        setMode(active.mode)
        if (active.step === 'final-review' || active.step === 'delivery') {
          const existing = await getDerived(compositionDerivedId(active.id))
          if (cancelled) return
          if (existing?.blob instanceof Blob && existing.sessionId === active.id && existing.revision === active.revision) {
            syncComposition(URL.createObjectURL(existing.blob))
          } else void renderComposition(active)
        }
      } catch (error) {
        if (!cancelled) {
          setRecoveryBlocked(true)
          setStorageMessage(`Session recovery failed. ${messageFromUnknown(error, 'Please retry.')}`)
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void boot()
    return () => {
      cancelled = true
      generation.current += 1
      Object.values(urls.current).forEach(url => URL.revokeObjectURL(url))
      if (originalUrl.current) URL.revokeObjectURL(originalUrl.current)
      if (compositionUrl.current) URL.revokeObjectURL(compositionUrl.current)
    }
  }, [operatorReady, activate, clearUrls, syncOriginal, syncComposition, renderComposition])

  const transition = useCallback(async (work: () => Promise<void>) => {
    if (actionBusy.current) {
      let waitCount = 0
      while (actionBusy.current && waitCount < 30) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        waitCount++
      }
      if (actionBusy.current) {
        console.warn('[useBoothSession] Transition busy timeout, aborting')
        return false
      }
    }
    actionBusy.current = true
    setBusy(true)
    try {
      await work()
      return true
    } catch (error) {
      setStorageMessage(`Could not update the session. ${messageFromUnknown(error, 'Please try again.')}`)
      return false
    } finally {
      actionBusy.current = false
      setBusy(false)
    }
  }, [])

  const startSession = useCallback(async (options?: { mode?: ShotMode; kind?: SessionKind }) => {
    if (!ready || recoveryBlocked || sessionRef.current) return false
    return transition(async () => {
      const stats = await getStorageStats()
      const storageStatus = evaluateStorageStatus(stats)
      if (storageStatus.isHardStop && options?.kind !== 'test') {
        throw new StorageError('failed', storageStatus.guestMessage || 'Photo storage is full. Please contact booth staff.')
      }

      if (options?.kind !== 'test') {
        const mountConfig = await getBoothMountConfig()
        if (!isMountConfirmed(mountConfig)) {
          throw new StorageError('failed', 'Booth mount alignment pending. Please notify booth staff.')
        }
      }

      const snapshot = structuredClone(packRef.current)
      const nextMode = options?.mode ?? mode
      if (!supportsShotMode(snapshot, nextMode)) throw new Error('This Event Pack supports only 1 shot. Choose 1 Shot.')
      
      const requiresConsent = Boolean(
        options?.kind !== 'test' && snapshot.consentMode && snapshot.consentMode !== 'none'
      )
      const initialStep: Exclude<FlowStep, 'attract'> = requiresConsent ? 'consent' : 'capture'

      const next: BoothSession = {
        id: createId(),
        mode: nextMode,
        currentShotIndex: 0,
        photoIds: Array.from({ length: nextMode }, () => null),
        step: initialStep,
        retaking: false,
        kind: options?.kind ?? 'guest',
        packSnapshot: snapshot,
        revision: createId(),
        consentAcceptedAt: requiresConsent ? null : Date.now(),
        consentVersion: requiresConsent ? null : (snapshot.version || '1.0.0'),
        shareOptIn: false,
      }
      await putActiveSession(next)
      clearUrls()
      setStorageMessage(null)
      setMode(nextMode)
      activate(next)
    })
  }, [ready, recoveryBlocked, mode, transition, clearUrls, activate])

  const agreeConsent = useCallback(async (options?: { shareOptIn?: boolean }) => {
    const current = sessionRef.current
    if (!current || current.step !== 'consent') return false
    return transition(async () => {
      const next: BoothSession = {
        ...current,
        step: 'capture',
        consentAcceptedAt: Date.now(),
        consentVersion: current.packSnapshot.version || '1.0.0',
        shareOptIn: Boolean(options?.shareOptIn),
        revision: createId(),
      }
      await putActiveSession(next)
      activate(next)
    })
  }, [transition, activate])

  const cancelConsent = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return false
    return transition(async () => {
      await clearActiveSession()
      clearUrls()
      setStorageMessage(null)
      activate(null)
    })
  }, [transition, clearUrls, activate])

  const saveCapturedPhoto = useCallback(async (blob: Blob) => {
    const current = sessionRef.current
    if (!current || current.step !== 'capture' || actionBusy.current) throw new StorageError('failed', 'The session is busy. Please retry.')
    actionBusy.current = true
    setBusy(true)
    try {
      const token = generation.current
      const id = createId()
      const photo = await buildPhotoRecord({ id, sessionId: current.id, shotIndex: current.currentShotIndex, sessionKind: current.kind, original: blob })
      if (token !== generation.current) throw new Error('The session changed before the photo could be saved.')
      const photoIds = [...current.photoIds]
      const previousId = photoIds[current.currentShotIndex]
      photoIds[current.currentShotIndex] = id
      const next: BoothSession = { ...current, photoIds, revision: createId(), retaking: false, step: current.currentShotIndex === current.mode - 1 ? 'final-review' : 'review' }
      await commitCapture({ photo, session: next, replacePhotoId: previousId })
      if (token !== generation.current) return
      if (previousId && urls.current[previousId]) { URL.revokeObjectURL(urls.current[previousId]); delete urls.current[previousId] }
      urls.current = { ...urls.current, [id]: URL.createObjectURL(photo.thumbnail ?? photo.original) }
      setPhotoUrls(urls.current)
      syncOriginal(URL.createObjectURL(photo.original))
      syncComposition(null)
      activate(next)
      setStorageMessage(null)
      if (next.step === 'final-review') void renderComposition(next)
      void refreshStorage()
    } finally {
      actionBusy.current = false
      setBusy(false)
    }
  }, [activate, renderComposition, refreshStorage, syncOriginal, syncComposition])

  const retakeCurrent = useCallback(() => transition(async () => {
    const current = sessionRef.current
    if (!current || current.step === 'capture') return
    const next: BoothSession = { ...current, step: 'capture', retaking: true, revision: createId() }
    await putActiveSession(next, true)
    activate(next)
    syncComposition(null)
    setStorageMessage(null)
    void refreshStorage()
  }), [transition, activate, syncComposition, refreshStorage])

  const finish = useCallback(async (current: BoothSession | null) => {
    if (current) {
      const validPhotoIds = current.photoIds.filter((id): id is string => Boolean(id))
      if (validPhotoIds.length > 0) {
        try {
          const photos = await getPhotosByIds(validPhotoIds)
          if (photos.length > 0) {
            await enqueueSessionForSync(current, photos, true)
            void syncWorker.process()
          }
        } catch (err) {
          console.error('[useBoothSession] Failed to persist completed session and outbox:', err)
        }
      }
    }
    await clearActiveSession()
    activate(null)
    clearUrls()
    setStorageMessage(null)
    setRecoveryBlocked(false)
    setMode(packRef.current.shotCount)
    await refreshStorage()
    onIdle?.(current?.kind ?? 'guest')
  }, [activate, clearUrls, refreshStorage, onIdle])

  const continueSession = useCallback(() => transition(async () => {
    const current = sessionRef.current
    if (!current || current.step === 'capture') return
    if (current.currentShotIndex === current.mode - 1) {
      // Check if individual payment is configured
      const isIndividualPayment =
        current.kind === 'guest' &&
        current.packSnapshot.payment?.mode === 'individual' &&
        current.packSnapshot.payment?.enabled !== false

      if (isIndividualPayment && current.paymentStatus !== 'success') {
        const next: BoothSession = {
          ...current,
          step: 'payment',
          paymentRequired: true,
          paymentMode: 'individual',
          paymentStatus: 'pending',
          revision: createId(),
        }
        await putActiveSession(next)
        activate(next)
        return
      }

      // Organizer mode / free sponsored flow
      const hasDeliveryOptions = Boolean(
        current.packSnapshot.whatsappEnabled ||
        current.packSnapshot.emailEnabled ||
        current.packSnapshot.cloudQrEnabled ||
        current.packSnapshot.printEnabled
      )

      if (hasDeliveryOptions) {
        const next: BoothSession = {
          ...current,
          step: 'delivery',
          paymentRequired: false,
          paymentMode: current.packSnapshot.payment?.mode ?? 'organizer',
          paymentStatus: 'not_required',
          revision: createId(),
        }
        await putActiveSession(next)
        activate(next)

        const validPhotoIds = next.photoIds.filter((id): id is string => Boolean(id))
        if (validPhotoIds.length > 0) {
          try {
            const photos = await getPhotosByIds(validPhotoIds)
            if (photos.length > 0) {
              await enqueueSessionForSync(next, photos, true)
              void syncWorker.process()
            }
          } catch (err) {
            console.error('[useBoothSession] Outbox persistence error:', err)
          }
        }
        return
      }

      const completed: BoothSession = {
        ...current,
        paymentRequired: false,
        paymentMode: current.packSnapshot.payment?.mode ?? 'organizer',
        paymentStatus: 'not_required',
      }
      await finish(completed)
      return
    }

    const next: BoothSession = {
      ...current,
      currentShotIndex: current.currentShotIndex + 1,
      step: 'capture',
      retaking: false,
      revision: createId(),
    }
    await putActiveSession(next)
    activate(next)
    syncOriginal(null)
    setStorageMessage(null)
  }), [transition, finish, activate, syncOriginal])

  const handlePaymentSuccess = useCallback((record: import('../payment/types').PaymentRecord) => {
    return transition(async () => {
      let current = sessionRef.current || session
      if (!current) {
        current = await getActiveSession(packRef.current).catch(() => null)
      }
      if (!current) {
        await finish(null)
        return
      }
      const verifiedSession: BoothSession = {
        ...current,
        step: 'delivery',
        paymentRequired: true,
        paymentMode: 'individual',
        paymentStatus: 'success',
        paymentReference: record.paymentReference,
        paymentAmount: record.amount,
        revision: createId(),
      }
      await putActiveSession(verifiedSession)
      activate(verifiedSession)

      const validPhotoIds = verifiedSession.photoIds.filter((id): id is string => Boolean(id))
      if (validPhotoIds.length > 0) {
        try {
          const photos = await getPhotosByIds(validPhotoIds)
          if (photos.length > 0) {
            await enqueueSessionForSync(verifiedSession, photos, true)
            void syncWorker.process()
          }
        } catch (err) {
          console.error('[useBoothSession] Outbox persistence error:', err)
        }
      }
    })
  }, [transition, activate, session])

  const finishDelivery = useCallback(() => {
    return transition(async () => {
      await finish(sessionRef.current || session)
    })
  }, [transition, finish, session])

  const handlePaymentCancel = useCallback(() => {
    return transition(async () => {
      const current = sessionRef.current
      if (!current) return
      // Safe cancellation - keep captured photos intact and return to final review
      const next: BoothSession = {
        ...current,
        step: 'final-review',
        paymentStatus: 'cancelled',
        revision: createId(),
      }
      await putActiveSession(next)
      activate(next)
    })
  }, [transition, activate])

  const cancelCapture = useCallback(() => transition(async () => {
    const current = sessionRef.current
    if (!current || (!current.photoIds[current.currentShotIndex] && current.currentShotIndex === 0)) { await finish(current); return }
    const index = current.photoIds[current.currentShotIndex] ? current.currentShotIndex : current.currentShotIndex - 1
    const photos = await getPhotosByIds([current.photoIds[index]!])
    if (!photos[0]) throw new Error('The previous photo could not be restored. Please retry.')
    const next: BoothSession = { ...current, currentShotIndex: index, step: index === current.mode - 1 ? 'final-review' : 'review', retaking: false, revision: createId() }
    await putActiveSession(next)
    activate(next)
    syncOriginal(URL.createObjectURL(photos[0].original))
    setStorageMessage(null)
    if (next.step === 'final-review') void renderComposition(next)
  }), [transition, finish, activate, syncOriginal, renderComposition])

  return {
    ready, step, mode, setMode, session, storageMessage, currentPhotoUrl, composedUrl, busy, composing, recoveryBlocked,
    sessionPhotos: (session?.photoIds ?? []).flatMap(id => id && photoUrls[id] ? [{ id, url: photoUrls[id] }] : []),
    startSession, agreeConsent, cancelConsent, saveCapturedPhoto, retakeCurrent, continueSession, cancelCapture,
    handlePaymentSuccess, handlePaymentCancel, finishDelivery,
    clearInvalidSession: () => transition(() => finish(null)),
    retryComposition: () => { if (!actionBusy.current && (sessionRef.current?.step === 'final-review' || sessionRef.current?.step === 'payment' || sessionRef.current?.step === 'delivery')) { setStorageMessage(null); void renderComposition(sessionRef.current) } },
  }
}
