import { useCallback, useEffect } from 'react'
import { StorageHud } from './components/StorageHud'
import { useBoothSession } from './hooks/useBoothSession'
import { useOperator } from './hooks/useOperator'
import { AttractScreen } from './screens/AttractScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { ConsentScreen } from './screens/ConsentScreen'
import { EventHoldScreen } from './screens/EventHoldScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { PaymentScreen } from './screens/PaymentScreen'
import { DeliveryScreen } from './screens/DeliveryScreen'
import { StaffPinScreen } from './screens/StaffPinScreen'
import { StaffScreen } from './screens/StaffScreen'
import { STAGE_HEIGHT, STAGE_WIDTH } from './types'
import './App.css'

export default function App() {
  const operator = useOperator()
  const {
    pack,
    eventStatus,
    view,
    packError,
    pinError,
    language,
    setLanguage,
    storageStats,
    syncStats,
    resetArmed,
    lockUntil,
    usingFallback,
    openStaff,
    exitStaff,
    reenterStaff,
    submitPin,
    startEvent,
    pauseEvent,
    endEvent,
    restoreFallbackPack,
    loadPackJson,
    setPackFlag,
    resetTestData,
    refreshStorage,
    forceSync,
  } = operator

  const handleIdle = useCallback(
    (kind: 'guest' | 'test') => {
      void refreshStorage()
      if (kind === 'test') {
        reenterStaff()
      }
    },
    [reenterStaff, refreshStorage],
  )

  const {
    ready,
    step,
    mode,
    setMode,
    session,
    storageMessage,
    currentPhotoUrl,
    composedUrl,
    sessionPhotos,
    startSession,
    agreeConsent,
    cancelConsent,
    saveCapturedPhoto,
    retakeCurrent,
    continueSession,
    cancelCapture,
    handlePaymentSuccess,
    handlePaymentCancel,
    finishDelivery,
    busy, composing, recoveryBlocked, clearInvalidSession, retryComposition,
  } = useBoothSession({ pack, operatorReady: operator.ready, refreshStorage, onIdle: handleIdle })

  useEffect(() => {
    if (step === 'attract') {
      setMode(pack.shotCount)
    }
  }, [pack.id, pack.shotCount, setMode, step])

  const sessionPack = session?.packSnapshot ?? pack
  const shotTotal = session?.mode ?? mode
  const shotNumber = (session?.currentShotIndex ?? 0) + 1
  const isFinalReview = step === 'final-review'
  const showReview = (step === 'review' || isFinalReview) && Boolean(currentPhotoUrl)
  const boothReady = ready && operator.ready
  const inGuestFlow = step === 'consent' || step === 'capture' || showReview || step === 'payment' || step === 'delivery'
  const showStaff = view === 'staff'
  const showPin = view === 'pin'
  const showHold =
    !showStaff &&
    !showPin &&
    !inGuestFlow &&
    !recoveryBlocked &&
    (eventStatus === 'paused' || eventStatus === 'ended')
  const showAttract = boothReady && !showStaff && !showPin && !showHold && step === 'attract' && !recoveryBlocked

  const stageStyle: React.CSSProperties = {
    aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}`,
    ...(pack.accentColor ? { '--gold': pack.accentColor, '--gold-bright': pack.accentColor } : {}),
    ...(pack.backgroundColor ? { '--ink': pack.backgroundColor } : {}),
  }

  return (
    <div className="app-shell">
      <div
        className="stage"
        style={stageStyle}
      >
        <StorageHud stats={storageStats} message={storageMessage ?? operator.storageError} />
        {recoveryBlocked && !showStaff && !showPin && (
          <div className="screen capture-status"><div className="status-card">
            <h2>Session could not be restored</h2><p>{storageMessage}</p>
            <button className="btn btn-primary" disabled={busy} onClick={() => { void clearInvalidSession() }}>Return to start</button>
            <p>Stored photos will be kept.</p>
          </div></div>
        )}

        {showAttract && (
          <AttractScreen
            mode={mode}
            busy={busy}
            allowThree={pack.shotCount === 3}
            privacyNotice={
              pack.schoolMode || (pack.consentMode && pack.consentMode !== 'none')
                ? (pack.privacyNoticeText || 'Privacy Notice: Photos taken during this session are saved privately and never published publicly.')
                : null
            }
            eventName={pack.eventName}
            schoolName={pack.schoolName || operator.activeEventDetails?.schoolName || undefined}
            eventSubtitle={pack.eventSubtitle}
            schoolLogoUrl={pack.schoolLogoUrl || undefined}
            onModeChange={setMode}
            onStart={() => {
              if (eventStatus === 'live') {
                void startSession({ kind: 'guest', mode: (pack.shotCount as any) || mode })
              }
            }}
            onStaff={openStaff}
          />
        )}

        {showHold && (
          <EventHoldScreen
            status={eventStatus === 'ended' ? 'ended' : 'paused'}
            eventName={pack.eventName}
            onStaff={openStaff}
          />
        )}

        {showPin && (
          <StaffPinScreen
            error={pinError}
            disabled={!operator.authAvailable || operator.busy}
            lockUntil={lockUntil}
            onSubmit={(pin) => {
              void submitPin(pin)
            }}
            onCancel={exitStaff}
          />
        )}

        {showStaff && (
          <StaffScreen
            pack={pack}
            usingFallback={usingFallback}
            eventStatus={eventStatus}
            packError={packError}
            language={language}
            stats={storageStats}
            syncStats={syncStats}
            resetArmed={resetArmed}
            busy={operator.busy || busy}
            onCancelReset={operator.cancelReset}
            onLanguageChange={(value) => { void setLanguage(value) }}
            onStartEvent={() => {
              void startEvent()
            }}
            onPauseEvent={() => {
              void pauseEvent()
            }}
            onEndEvent={() => {
              void endEvent()
            }}
            onLoadPack={(text) => {
              void loadPackJson(text)
            }}
            onFallbackPack={() => {
              void restoreFallbackPack()
            }}
            onToggleFlag={(flag, enabled) => {
              void setPackFlag(flag, enabled)
            }}
            onUpdatePaymentConfig={(config) => {
              void operator.setPaymentConfig(config)
            }}
            onTestShot={() => {
              void startSession({ kind: 'test', mode: 1 }).then(started => {
                if (started) operator.leaveForTest()
              })
            }}
            activeEventDetails={operator.activeEventDetails}
            onActivateEvent={operator.activateBoothEvent}
            onResetData={() => {
              void resetTestData()
            }}
            onForceSync={forceSync}
            onExit={exitStaff}
          />
        )}

        {boothReady && !showStaff && !showPin && step === 'consent' && (
          <ConsentScreen
            pack={sessionPack}
            busy={busy}
            onAgree={(options) => {
              void agreeConsent(options)
            }}
            onCancel={() => {
              void cancelConsent()
            }}
          />
        )}

        {boothReady && !showStaff && !showPin && step === 'capture' && (
          <CaptureScreen
            shotNumber={shotNumber}
            shotTotal={shotTotal}
            mirrorOutput={sessionPack.mirrorOutput}
            readyDelayMs={shotNumber > 1 ? sessionPack.betweenShotPauseMs : 0}
            countdownSeconds={sessionPack.countdownSeconds || 3}
            onCaptured={saveCapturedPhoto}
            onCancel={() => {
              void cancelCapture()
            }}
          />
        )}

        {boothReady && !showStaff && !showPin && showReview && currentPhotoUrl && (
          <ReviewScreen
            photoUrl={currentPhotoUrl}
            composedUrl={composedUrl}
            photos={sessionPhotos}
            shotNumber={shotNumber}
            shotTotal={shotTotal}
            isFinal={isFinalReview}
            shareFlags={sessionPack}
            busy={busy}
            composing={composing}
            onRetryComposition={retryComposition}
            onRetake={() => {
              void retakeCurrent()
            }}
            onContinue={() => {
              void continueSession()
            }}
          />
        )}

        {boothReady && !showStaff && !showPin && step === 'payment' && session && (
          <PaymentScreen
            pack={sessionPack}
            session={session}
            busy={busy}
            onPaymentSuccess={handlePaymentSuccess}
            onCancel={handlePaymentCancel}
          />
        )}

        {boothReady && !showStaff && !showPin && step === 'delivery' && session && (
          <DeliveryScreen
            pack={sessionPack}
            session={session}
            photoUrl={currentPhotoUrl || ''}
            composedUrl={composedUrl}
            photos={sessionPhotos}
            busy={busy}
            onFinish={() => {
              void finishDelivery()
            }}
          />
        )}
      </div>
    </div>
  )
}
