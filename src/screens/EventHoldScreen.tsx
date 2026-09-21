import './EventHoldScreen.css'

type EventHoldScreenProps = {
  status: 'paused' | 'ended'
  eventName: string
  onStaff: () => void
}

export function EventHoldScreen({ status, eventName, onStaff }: EventHoldScreenProps) {
  const paused = status === 'paused'

  return (
    <section className="screen hold">
      <div className="attract-glow" />
      <div className="gold-frame attract-frame" />
      <div className="hold-copy">
        <p className="attract-kicker">{eventName}</p>
        <h1 className="attract-mark">Pehchaan</h1>
        <p className="attract-sub">Photobooth</p>
        <div className="attract-rule" />
        <p className="attract-line">
          {paused ? 'The booth is paused. Please wait for the next session.' : 'This event has ended.'}
        </p>
      </div>
      <button className="hold-staff" type="button" onClick={onStaff}>
        Staff
      </button>
    </section>
  )
}
