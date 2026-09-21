import type { PhotoRecord, PhotoStatus, SessionKind } from '../types'
import { originalFileName, thumbnailFileName } from '../types'
import { ensureJpeg } from './jpeg'
import { createThumbnail } from './thumbnail'
import { sanitizeJpegBlob } from './exif'

export async function buildPhotoRecord(input: {
  id: string
  sessionId: string
  shotIndex: number
  sessionKind: SessionKind
  original: Blob
  createdAt?: number
}): Promise<PhotoRecord> {
  const shotNumber = input.shotIndex + 1
  const ensured = await ensureJpeg(input.original)
  const original = await sanitizeJpegBlob(ensured)
  let thumbnail: Blob | null = null
  let status: PhotoStatus = 'captured'

  try {
    const rawThumb = await createThumbnail(original)
    thumbnail = await sanitizeJpegBlob(rawThumb)
    status = 'ready'
  } catch {
    thumbnail = null
    status = 'processing_failed'
  }

  return {
    id: input.id,
    sessionId: input.sessionId,
    shotNumber,
    shotIndex: input.shotIndex,
    createdAt: input.createdAt ?? Date.now(),
    sessionKind: input.sessionKind,
    original,
    thumbnail,
    status,
    originalName: originalFileName(shotNumber),
    thumbnailName: thumbnailFileName(shotNumber),
    originalByteSize: original.size,
    thumbnailByteSize: thumbnail?.size ?? 0,
  }
}

export function photoByteSize(photo: PhotoRecord): number {
  const originalSize = photo.originalByteSize || photo.original.size || 0
  const thumbnailSize = photo.thumbnailByteSize || photo.thumbnail?.size || 0
  return originalSize + thumbnailSize
}
