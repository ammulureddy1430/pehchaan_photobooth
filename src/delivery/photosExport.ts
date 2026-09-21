import { getDerived, compositionDerivedId, getPhotosByIds, getCompletedSession } from '../lib/photoStore'
import type { PhotosExportRequest, PhotosExportResult } from './types'

/**
 * Service for local media export / photos saving.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome browser prototype, local export triggers browser downloads via Blob URLs.
 * In the final native iPadOS application, this service will map to PhotoKit
 * (PHPhotoLibrary.shared().performChanges) and the native Files/Share sheet.
 */
export class PhotosExportService {
  /**
   * Exports the composed JPEG (and optionally original photos) for a session.
   * Stored media in IndexedDB is never deleted or modified.
   */
  public async exportSessionMedia(request: PhotosExportRequest): Promise<PhotosExportResult> {
    const { sessionId, includeOriginals = false } = request

    if (!sessionId) {
      return {
        success: false,
        status: 'FAILED',
        exportedCount: 0,
        filenames: [],
        error: 'sessionId is required for photo export.',
      }
    }

    try {
      const exportedFilenames: string[] = []

      // 1. Retrieve composed JPEG or fallback to raw photo
      const compDerived = await getDerived(compositionDerivedId(sessionId))
      if (compDerived?.blob instanceof Blob) {
        const compFilename = `pehchaan_${sessionId}_composed.jpg`
        this.triggerBrowserDownload(compDerived.blob, compFilename)
        exportedFilenames.push(compFilename)
      } else {
        const completedRecord = await getCompletedSession(sessionId)
        if (completedRecord && completedRecord.photoIds.length > 0) {
          const photos = await getPhotosByIds(completedRecord.photoIds)
          if (photos.length > 0 && photos[0].original instanceof Blob) {
            const filename = `pehchaan_${sessionId}_photo.jpg`
            this.triggerBrowserDownload(photos[0].original, filename)
            exportedFilenames.push(filename)
          }
        }
      }

      // 2. Retrieve original photos if requested
      if (includeOriginals && compDerived?.blob instanceof Blob) {
        const completedRecord = await getCompletedSession(sessionId)
        if (completedRecord && completedRecord.photoIds.length > 0) {
          const photos = await getPhotosByIds(completedRecord.photoIds)
          for (const photo of photos) {
            if (photo.original instanceof Blob) {
              const filename = `pehchaan_${sessionId}_${photo.originalName || `shot_${photo.shotNumber}.jpg`}`
              this.triggerBrowserDownload(photo.original, filename)
              exportedFilenames.push(filename)
            }
          }
        }
      }


      if (exportedFilenames.length === 0) {
        return {
          success: false,
          status: 'FAILED',
          exportedCount: 0,
          filenames: [],
          error: `No local media found for session ${sessionId}.`,
        }
      }

      return {
        success: true,
        status: 'COMPLETED',
        exportedCount: exportedFilenames.length,
        filenames: exportedFilenames,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        status: 'FAILED',
        exportedCount: 0,
        filenames: [],
        error: `Photo export failed: ${errorMsg}`,
      }
    }
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      // In Node.js testing environment, download is simulated safely
      return
    }

    try {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      setTimeout(() => {
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      console.error('[PhotosExportService] Download trigger error:', err)
    }
  }
}

export const photosExportService = new PhotosExportService()
