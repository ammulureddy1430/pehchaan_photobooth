import './ReviewScreen.css'

type ReviewPhoto = {
  id: string
  url: string
}

type ShareFlags = {
  whatsappEnabled: boolean
  emailEnabled: boolean
  cloudQrEnabled: boolean
  printEnabled: boolean
}

type ReviewScreenProps = {
  busy?: boolean
  composing?: boolean
  onRetryComposition?: () => void
  photoUrl: string
  composedUrl?: string | null
  photos: ReviewPhoto[]
  shotNumber: number
  shotTotal: number
  isFinal: boolean
  shareFlags?: ShareFlags
  onRetake: () => void
  onContinue: () => void
}

export function ReviewScreen({
  busy = false,
  composing = false,
  onRetryComposition,
  photoUrl,
  composedUrl,
  photos,
  shotNumber,
  shotTotal,
  isFinal,
  onRetake,
  onContinue,
}: ReviewScreenProps) {
  const showComposed = Boolean(isFinal && composedUrl)
  const showStrip = !showComposed && isFinal && photos.length > 1
  const showShotCount = shotTotal > 1 && !showStrip && !showComposed

  return (
    <section className="screen review">
      {showComposed && composedUrl ? (
        <img className="review-photo is-composed" src={composedUrl} alt="Composed portrait" />
      ) : showStrip ? (
        <div className="review-strip" aria-label="Captured portraits">
          {photos.map((photo, index) => (
            <img
              key={photo.id}
              className={index === photos.length - 1 ? 'review-strip-photo is-current' : 'review-strip-photo'}
              src={photo.url}
              alt={`Portrait ${index + 1} of ${photos.length}`}
            />
          ))}
        </div>
      ) : (
        <img className="review-photo" src={photoUrl} alt="Captured portrait" />
      )}

      {!showComposed && !showStrip && <div className="review-vignette" />}
      <div className="gold-frame" />

      {showShotCount && (
        <p className="shot-progress">
          {shotNumber} of {shotTotal}
        </p>
      )}

      {isFinal && !composedUrl && (
        <div className="review-notice" role="status">
          {composing ? (
            'Preparing portrait…'
          ) : (
            <button className="btn btn-ghost review-share-btn" onClick={onRetryComposition} disabled={busy}>
              Retry composition
            </button>
          )}
        </div>
      )}

      <div className="review-dock">
        <button className="btn btn-ghost review-btn" type="button" disabled={busy} onClick={onRetake}>
          Retake
        </button>
        <button className="btn btn-primary review-btn" type="button" disabled={busy} onClick={onContinue}>
          {isFinal ? 'Done' : 'Next'}
        </button>
      </div>
    </section>
  )
}
