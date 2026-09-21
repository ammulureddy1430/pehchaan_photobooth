import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error'

const CONSTRAINT_LADDER: MediaStreamConstraints[] = [
  {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
    },
  },
  {
    audio: false,
    video: true,
  },
]

function mediaErrorName(error: unknown): string {
  if (error instanceof DOMException && error.name) {
    return error.name
  }

  if (error instanceof Error && error.name) {
    return error.name
  }

  return 'UnknownError'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function classifyError(error: unknown): {
  status: CameraStatus
  name: string
  message: string
} {
  const name = mediaErrorName(error)

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      status: 'denied',
      name,
      message:
        'Camera permission is needed to take a photo. Allow access in Chrome, then try again.',
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      status: 'unavailable',
      name,
      message: 'No camera was found on this device.',
    }
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      status: 'error',
      name,
      message:
        'The camera is already in use by another application, or it could not be opened.',
    }
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      status: 'error',
      name,
      message: 'This camera does not support the requested video settings.',
    }
  }

  if (name === 'SecurityError') {
    return {
      status: 'error',
      name,
      message: 'Camera access is blocked in this browser context.',
    }
  }

  if (name === 'AbortError') {
    return {
      status: 'error',
      name,
      message: 'Camera start was interrupted before the preview could begin.',
    }
  }

  if (name === 'NotSupportedError' || name === 'TypeError') {
    return {
      status: 'unavailable',
      name,
      message: 'Camera is not available in this browser.',
    }
  }

  return {
    status: 'error',
    name,
    message: 'The camera could not be started.',
  }
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function releaseVideo(video: HTMLVideoElement | null): void {
  if (!video) {
    return
  }

  video.srcObject = null
}

async function requestStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (error) {
    const name = mediaErrorName(error)
    if (name === 'AbortError' || name === 'NotReadableError') {
      await wait(200)
      return await navigator.mediaDevices.getUserMedia(constraints)
    }
    throw error
  }
}

async function getStream(): Promise<MediaStream> {
  let lastError: unknown = new DOMException(
    'No compatible camera constraints succeeded.',
    'OverconstrainedError',
  )

  for (const constraints of CONSTRAINT_LADDER) {
    try {
      return await requestStream(constraints)
    } catch (error) {
      lastError = error
      const name = mediaErrorName(error)
      if (name === 'OverconstrainedError' || name === 'NotFoundError') {
        continue
      }
      throw error
    }
  }

  throw lastError
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generationRef = useRef(0)
  const [status, setStatus] = useState<CameraStatus>('requesting')
  const [message, setMessage] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<string | null>(null)

  const release = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    releaseVideo(videoRef.current)
  }, [])

  const start = useCallback(async () => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    release()
    setStatus('requesting')
    setMessage(null)
    setErrorType(null)

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      if (generation !== generationRef.current) {
        return
      }
      setStatus('unavailable')
      setErrorType('NotSupportedError')
      setMessage('Camera is not available in this browser (navigator.mediaDevices.getUserMedia is missing).')
      return
    }

    let video = videoRef.current
    if (!video) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      video = videoRef.current
    }

    if (!video) {
      if (generation !== generationRef.current) {
        return
      }
      setStatus('error')
      setErrorType('InvalidStateError')
      setMessage('Camera preview element is not attached.')
      return
    }

    try {
      const stream = await getStream()

      if (generation !== generationRef.current) {
        stopStream(stream)
        return
      }

      streamRef.current = stream
      video.muted = true
      video.defaultMuted = true
      video.autoplay = true
      video.playsInline = true
      video.setAttribute('playsinline', 'true')
      video.srcObject = stream

      try {
        await video.play()
      } catch (playError) {
        if (generation !== generationRef.current) {
          return
        }

        if (mediaErrorName(playError) === 'AbortError') {
          await video.play()
        } else {
          throw playError
        }
      }

      if (generation !== generationRef.current) {
        return
      }

      setStatus('ready')
      setMessage(null)
      setErrorType(null)
    } catch (error) {
      if (generation !== generationRef.current) {
        return
      }

      release()
      const classified = classifyError(error)
      setStatus(classified.status)
      setErrorType(classified.name)
      setMessage(`${classified.message} (${classified.name})`)
    }
  }, [release])

  useEffect(() => {
    void start()

    return () => {
      generationRef.current += 1
      stopStream(streamRef.current)
      streamRef.current = null
      releaseVideo(videoRef.current)
    }
  }, [start])

  return { videoRef, status, message, errorType, retry: start }
}
