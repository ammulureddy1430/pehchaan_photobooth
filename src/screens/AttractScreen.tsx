import type { ShotMode } from '../types'
import type { EventStatus } from '../eventPack/types'
import './AttractScreen.css'

type AttractScreenProps = {
  busy?: boolean
  allowThree?: boolean
  mode: ShotMode
  eventStatus?: EventStatus
  pauseMessage?: string | null
  restState?: 'battery_rest' | 'storage_critical' | null
  privacyNotice?: string | null
  eventName?: string
  schoolName?: string
  eventSubtitle?: string
  schoolLogoUrl?: string | null
  onModeChange: (mode: ShotMode) => void
  onStart: () => void
  onStaff: () => void
}

export function AttractScreen({
  busy = false,
  allowThree: _allowThree = true,
  mode: _mode,
  eventStatus = 'live',
  pauseMessage,
  restState,
  privacyNotice,
  eventName,
  schoolName,
  eventSubtitle,
  schoolLogoUrl,
  onModeChange: _onModeChange,
  onStart,
  onStaff,
}: AttractScreenProps) {
  const isPaused = eventStatus === 'paused'
  const isEnded = eventStatus === 'ended'
  const isResting = Boolean(restState)

  return (
    <section className="screen attract">
      <div className="attract-glow" />
      <div className="gold-frame attract-frame" />
      <button className="attract-staff" type="button" onClick={onStaff}>
        Staff
      </button>

      <div className="attract-copy">
        {schoolLogoUrl && (
          <img
            src={schoolLogoUrl}
            alt={schoolName || 'School Logo'}
            className="attract-school-logo"
          />
        )}
        <p className="attract-kicker">{schoolName || 'Portrait Studio'}</p>
        <h1 className="attract-mark">{eventName || 'Pehchaan'}</h1>
        <p className="attract-sub">{eventSubtitle || 'Photobooth'}</p>
        <div className="attract-rule" />
        
        {isPaused ? (
          <div className="attract-paused-box" role="alert">
            <h2 className="attract-paused-title">Booth Paused</h2>
            <p className="attract-line">
              {pauseMessage || "We'll be right back with you shortly."}
            </p>
          </div>
        ) : isEnded ? (
          <div className="attract-paused-box" role="alert">
            <h2 className="attract-paused-title">Event Concluded</h2>
            <p className="attract-line">
              Thank you for visiting. This photobooth event has ended.
            </p>
          </div>
        ) : isResting ? (
          <div className="attract-paused-box" role="alert">
            <h2 className="attract-paused-title">Booth Resting</h2>
            <p className="attract-line">
              {restState === 'battery_rest'
                ? 'Booth is resting due to low power. Connect charger to resume.'
                : 'Storage maintenance required. Please notify booth staff.'}
            </p>
          </div>
        ) : (
          <>
            <p className="attract-line">A quiet moment. A lasting portrait.</p>
            {privacyNotice && (
              <div className="attract-privacy-notice" role="note">
                <span className="privacy-shield-icon" aria-hidden="true">🛡</span>
                <span>{privacyNotice}</span>
              </div>
            )}
          </>
        )}
      </div>

      {!isPaused && !isEnded && !isResting && (
        <div className="attract-actions">
          <button className="btn btn-primary attract-start" type="button" disabled={busy} onClick={onStart}>
            Start
          </button>
        </div>
      )}
    </section>
  )
}
