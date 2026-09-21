import './OrientationOverlay.css'

interface OrientationOverlayProps {
  onStaff?: () => void
}

export function OrientationOverlay({ onStaff }: OrientationOverlayProps) {
  return (
    <div className="orientation-overlay" role="alert" aria-live="assertive">
      <div className="gold-frame" />
      {onStaff && (
        <button
          className="orientation-staff"
          type="button"
          onClick={onStaff}
          aria-label="Staff Access"
        >
          Staff
        </button>
      )}
      <div className="orientation-card">
        <div className="orientation-icon-box" aria-hidden="true">
          <svg
            className="orientation-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <h2 className="orientation-title">Please Rotate Device</h2>
        <p className="orientation-sub">
          Pehchaan Photobooth is designed for portrait mode. Please turn your device upright to continue.
        </p>
      </div>
    </div>
  )
}
