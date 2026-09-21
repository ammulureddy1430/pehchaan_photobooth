import { canvasToJpeg, closeBitmap, decodeBitmap, releaseCanvas } from './jpeg'

const THUMB_MAX_EDGE = 360
const THUMB_QUALITY = 0.72

export async function createThumbnail(original: Blob): Promise<Blob> {
  const bitmap = await decodeBitmap(original)

  try {
    const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    try {
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Could not create a thumbnail.')
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, width, height)
      return await canvasToJpeg(canvas, THUMB_QUALITY)
    } finally {
      releaseCanvas(canvas)
    }
  } finally {
    closeBitmap(bitmap)
  }
}
