const JPEG_QUALITY = 0.92

function sourceCrop(
  videoWidth: number,
  videoHeight: number,
  targetAspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const videoAspect = videoWidth / videoHeight

  if (videoAspect > targetAspect) {
    const sw = videoHeight * targetAspect
    return {
      sx: (videoWidth - sw) / 2,
      sy: 0,
      sw,
      sh: videoHeight,
    }
  }

  const sh = videoWidth / targetAspect
  return {
    sx: 0,
    sy: (videoHeight - sh) / 2,
    sw: videoWidth,
    sh,
  }
}

export async function captureJpeg(
  video: HTMLVideoElement,
  targetAspect: number,
  options?: { mirror?: boolean },
): Promise<Blob> {
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight

  if (!videoWidth || !videoHeight) {
    throw new Error('Camera frame is not ready.')
  }

  const crop = sourceCrop(videoWidth, videoHeight, targetAspect)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(crop.sw)
  canvas.height = Math.round(crop.sh)

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not capture photo.')
  }

  const mirror = options?.mirror !== false
  if (mirror) {
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(
    video,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
          return
        }
        reject(new Error('Could not create JPEG.'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

  return blob
}
