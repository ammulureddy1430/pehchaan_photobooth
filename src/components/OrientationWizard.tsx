import { useState, useRef, useEffect, useCallback } from 'react'
import { confirmMount, type BoothMountConfig } from '../lib/orientationWizard'
import './OrientationWizard.css'

interface OrientationWizardProps {
  isOpen: boolean
  onClose: () => void
  onConfirmed: (config: BoothMountConfig) => void
}

export function OrientationWizard({ isOpen, onClose, onConfirmed }: OrientationWizardProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [testShot, setTestShot] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
  }, [stream])

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null)
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Camera API not available in this browser environment.')
        return
      }
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      setStream(media)
      if (videoRef.current) {
        videoRef.current.srcObject = media
        void videoRef.current.play().catch(() => {})
      }
    } catch (err) {
      setCameraError('Failed to start camera preview: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTestShot(null)
      void startCamera()
    } else {
      stopStream()
    }
    return () => {
      stopStream()
    }
  }, [isOpen])

  useEffect(() => {
    if (videoRef.current && stream && !testShot) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => {})
    }
  }, [stream, testShot])

  if (!isOpen) return null

  const handleCaptureTestShot = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setTestShot(dataUrl)
    }
  }

  const handleRetake = () => {
    setTestShot(null)
  }

  const handleConfirmUpright = async () => {
    stopStream()
    const config = await confirmMount(testShot)
    onConfirmed(config)
    onClose()
  }

  return (
    <div className="orientation-wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="orientation-wizard-modal">
        <header className="wizard-header">
          <div>
            <h2 id="wizard-title" className="wizard-title">Camera Angle Check</h2>
            <p className="wizard-subtitle">Make sure the iPad camera is facing straight before opening the booth</p>
          </div>
          <button className="wizard-close-btn" type="button" onClick={onClose} aria-label="Close Wizard">
            ✕
          </button>
        </header>

        <div className="wizard-preview-container">
          {testShot ? (
            <img src={testShot} alt="Captured Mount Test Shot" className="wizard-image" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="wizard-video" />
          )}
          <div className="wizard-guidelines">
            <span className="wizard-guidelines-badge">
              {testShot ? 'Test Picture Preview' : 'Live Camera Feed'}
            </span>
          </div>
        </div>

        {cameraError && <p className="staff-error" style={{ marginBottom: '1rem' }}>{cameraError}</p>}

        <div className="wizard-actions">
          {!testShot ? (
            <button
              type="button"
              className="wizard-btn-primary"
              onClick={handleCaptureTestShot}
            >
              Take Test Picture
            </button>
          ) : (
            <>
              <button
                type="button"
                className="wizard-btn-primary"
                onClick={handleConfirmUpright}
              >
                ✓ Picture looks straight (Confirm)
              </button>
              <button
                type="button"
                className="wizard-btn-secondary"
                onClick={handleRetake}
              >
                Retake Picture
              </button>
            </>
          )}
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        <p className="wizard-info-note">
          This check makes sure the iPad camera is vertical and straight so your photos are never sideways or upside down.
        </p>
      </div>
    </div>
  )
}

