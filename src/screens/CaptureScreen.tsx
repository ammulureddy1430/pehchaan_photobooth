import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { captureJpeg } from '../lib/captureFrame'
import { isStorageError, messageFromUnknown } from '../lib/storageError'
import { STAGE_ASPECT } from '../types'
import './CaptureScreen.css'

type CaptureScreenProps = {
  shotNumber: number
  shotTotal: number
  mirrorOutput?: boolean
  readyDelayMs?: number
  countdownSeconds?: number
  onCaptured: (blob: Blob) => Promise<void>
  onCancel: () => void
}

export function CaptureScreen({
  shotNumber,
  shotTotal,
  mirrorOutput = true,
  readyDelayMs = 0,
  countdownSeconds = 3,
  onCaptured,
  onCancel,
}: CaptureScreenProps) {
  const { videoRef, status, message, retry } = useCamera()
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [errorTitle, setErrorTitle] = useState('Photo not captured')
  const pendingBlobRef = useRef<Blob | null>(null)
  const capturingRef = useRef(false)

  const [pausedForNext, setPausedForNext] = useState(shotNumber > 1 && readyDelayMs > 0)
  const busy = countdown !== null || capturingRef.current || pausedForNext
  const cameraReady = status === 'ready' && !pausedForNext
  const showStatus = status !== 'ready' || captureError !== null
  const showShotCount = shotTotal > 1

  const saveBlob = useCallback(
    async (blob: Blob) => {
      try {
        await onCaptured(blob)
        pendingBlobRef.current = null
      } catch (error) {
        pendingBlobRef.current = blob
        capturingRef.current = false
        setCountdown(null)
        setFlash(false)
        setErrorTitle(
          isStorageError(error) && error.code === 'quota'
            ? 'Storage full'
            : isStorageError(error)
              ? 'Photo not saved'
              : 'Photo not captured',
        )
        setCaptureError(
          messageFromUnknown(error, 'Could not take the photo. Please try again.'),
        )
      }
    },
    [onCaptured],
  )

  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video) {
      capturingRef.current = false
      setCountdown(null)
      setErrorTitle('Photo not captured')
      setCaptureError('Camera preview could not be captured.')
      return
    }

    setFlash(true)

    try {
      const blob = await captureJpeg(video, STAGE_ASPECT, { mirror: mirrorOutput })
      await saveBlob(blob)
    } catch (error) {
      capturingRef.current = false
      setCountdown(null)
      setFlash(false)
      pendingBlobRef.current = null
      setErrorTitle('Photo not captured')
      setCaptureError(
        messageFromUnknown(error, 'Could not take the photo. Please try again.'),
      )
    }
  }, [mirrorOutput, saveBlob, videoRef])

  useEffect(() => {
    if (!pausedForNext) {
      return
    }

    const timer = window.setTimeout(() => setPausedForNext(false), readyDelayMs)
    return () => window.clearTimeout(timer)
  }, [pausedForNext, readyDelayMs])

  useEffect(() => {
    if (countdown === null) {
      return
    }

    if (countdown === 0) {
      void takePhoto()
      return
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => (current === null ? null : current - 1))
    }, 1000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [countdown, takePhoto])

  const beginCountdown = () => {
    if (!cameraReady || busy) {
      return
    }

    capturingRef.current = true
    pendingBlobRef.current = null
    setCaptureError(null)
    setCountdown(countdownSeconds > 0 ? countdownSeconds : 3)
  }

  const handleTryAgain = () => {
    setCaptureError(null)

    if (pendingBlobRef.current) {
      capturingRef.current = true
      void saveBlob(pendingBlobRef.current)
      return
    }

    if (status !== 'ready') {
      void retry()
    }
  }

  return (
    <section className="screen capture">
      <video
        ref={videoRef}
        className="capture-video"
        autoPlay
        muted
        playsInline
      />

      <div className="capture-vignette" />
      <div className="gold-frame" />

      <button
        className="capture-back"
        type="button"
        disabled={busy}
        onClick={onCancel}
        aria-label="Back"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>

      {showShotCount && (
        <p className="shot-progress">
          {shotNumber} of {shotTotal}
        </p>
      )}

      {flash && <div className="capture-flash" />}

      {pausedForNext && (
        <div className="capture-count" aria-live="polite">
          <span className="capture-ready">Ready</span>
        </div>
      )}

      {countdown !== null && countdown > 0 && (
        <div className="capture-count" aria-live="assertive">
          <span>{countdown}</span>
        </div>
      )}

      {showStatus && (
        <div className="capture-status">
          <div className="status-card">
            <h2>
              {captureError
                ? errorTitle
                : status === 'requesting'
                  ? 'Starting camera'
                  : 'Camera access needed'}
            </h2>
            <p>
              {captureError ??
                (status === 'denied'
                  ? 'Please ask booth staff to enable the camera on this device.'
                  : status === 'unavailable'
                    ? 'No camera found. Please inform booth staff.'
                    : message ?? 'Please allow the camera so the photobooth can take your portrait.')}
            </p>
            <div className="status-actions">
              {status !== 'requesting' && (
                <button className="btn btn-primary" type="button" onClick={handleTryAgain}>
                  Try again
                </button>
              )}
              <button className="btn btn-ghost" type="button" onClick={onCancel}>
                Return
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="capture-dock">
        <button
          className="capture-shutter"
          type="button"
          disabled={!cameraReady || busy}
          onClick={beginCountdown}
          aria-label="Take photo"
        >
          <span className="capture-shutter-ring" />
        </button>
      </div>
    </section>
  )
}
