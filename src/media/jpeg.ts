const JPEG_TYPE = 'image/jpeg'
const PNG_TYPE = 'image/png'

export function isJpegBlob(blob: Blob): boolean {
  return blob.type === JPEG_TYPE || blob.type === 'image/jpg'
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

export async function decodeBitmap(
  source: Blob | ImageBitmap,
  options?: ImageBitmapOptions,
): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode photos.')
  }

  return createImageBitmap(source, options)
}

export function closeBitmap(image: ImageBitmap | null | undefined): void {
  if (image) {
    image.close()
  }
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
          return
        }
        reject(new Error('Could not encode the image.'))
      },
      type,
      quality,
    )
  })

  return blob
}

export async function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Blob> {
  return canvasToBlob(canvas, JPEG_TYPE, quality)
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas, PNG_TYPE)
}

export async function ensureJpeg(blob: Blob): Promise<Blob> {
  if (isJpegBlob(blob)) {
    return blob
  }

  const bitmap = await decodeBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  try {
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not convert the photo to JPEG.')
    }
    context.drawImage(bitmap, 0, 0)
    return await canvasToJpeg(canvas, 0.92)
  } finally {
    closeBitmap(bitmap)
    releaseCanvas(canvas)
  }
}
