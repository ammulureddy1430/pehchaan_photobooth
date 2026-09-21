import type { PhotoEffect } from '../types'
import { canvasToJpeg, closeBitmap, decodeBitmap, releaseCanvas } from './jpeg'
import { sanitizeJpegBlob } from './exif'

export type PhotoSlot = {
  id: string
  shotNumber: number
  x: number
  y: number
  width: number
  height: number
  fit: 'cover' | 'contain'
  effect?: PhotoEffect
}

export type TextElement = {
  id: string
  text: string
  x: number
  y: number
  font: string
  color: string
  align: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

export type OverlayLayer = {
  png: Blob
  x: number
  y: number
  width: number
  height: number
}

export type CompositionSpec = {
  id: string
  name: string
  width: number
  height: number
  background: string
  slots: PhotoSlot[]
  overlay?: OverlayLayer
  texts: TextElement[]
}

function effectFilter(effect: PhotoEffect | undefined): string {
  if (effect === 'black-and-white') {
    return 'grayscale(1)'
  }

  if (effect === 'sepia') {
    return 'sepia(1)'
  }

  return 'none'
}

function drawFitted(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  slot: PhotoSlot,
): void {
  const imageAspect = image.width / image.height
  const slotAspect = slot.width / slot.height
  const cover = slot.fit !== 'contain'
  const imageIsWider = imageAspect > slotAspect
  const fillWithWidth = cover ? !imageIsWider : imageIsWider

  let drawWidth = slot.width
  let drawHeight = slot.height

  if (fillWithWidth) {
    drawWidth = slot.width
    drawHeight = slot.width / imageAspect
  } else {
    drawHeight = slot.height
    drawWidth = slot.height * imageAspect
  }

  const dx = slot.x + (slot.width - drawWidth) / 2
  const dy = slot.y + (slot.height - drawHeight) / 2

  context.save()
  context.beginPath()
  context.rect(slot.x, slot.y, slot.width, slot.height)
  context.clip()
  context.filter = effectFilter(slot.effect)
  context.drawImage(image, dx, dy, drawWidth, drawHeight)
  context.restore()
}

async function drawSlot(
  context: CanvasRenderingContext2D,
  slot: PhotoSlot,
  photo: Blob | undefined,
): Promise<void> {
  context.fillStyle = '#161310'
  context.fillRect(slot.x, slot.y, slot.width, slot.height)

  if (!photo) {
    return
  }

  const maxEdge = Math.ceil(Math.max(slot.width, slot.height) * 2)
  const bitmap = await decodeBitmap(photo)
  let source = bitmap
  let resized: ImageBitmap | null = null

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    if (scale < 1) {
      resized = await decodeBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
        resizeQuality: 'high',
      })
      closeBitmap(bitmap)
      source = resized
    }

    drawFitted(context, source, slot)
  } finally {
    closeBitmap(resized)
    if (source === bitmap) {
      closeBitmap(bitmap)
    }
  }
}

export async function composeToJpeg(
  spec: CompositionSpec,
  photosByShot: Map<number, Blob>,
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const context = canvas.getContext('2d')

  if (!context) {
    releaseCanvas(canvas)
    throw new Error('Could not compose the photo layout.')
  }

  try {
    context.fillStyle = spec.background
    context.fillRect(0, 0, spec.width, spec.height)

    for (const slot of spec.slots) {
      await drawSlot(context, slot, photosByShot.get(slot.shotNumber))
    }

    if (spec.overlay) {
      const overlay = await decodeBitmap(spec.overlay.png)
      try {
        context.drawImage(
          overlay,
          spec.overlay.x,
          spec.overlay.y,
          spec.overlay.width,
          spec.overlay.height,
        )
      } finally {
        closeBitmap(overlay)
      }
    }

    for (const text of spec.texts) {
      context.fillStyle = text.color
      context.font = text.font
      context.textAlign = text.align
      context.textBaseline = text.baseline ?? 'alphabetic'
      context.fillText(text.text, text.x, text.y)
    }

    const rawJpeg = await canvasToJpeg(canvas, quality)
    return await sanitizeJpegBlob(rawJpeg)
  } finally {
    releaseCanvas(canvas)
  }
}
