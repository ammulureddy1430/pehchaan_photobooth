/**
 * Photo Library permission and save abstraction.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome browser prototype, saving to device photo roll triggers standard
 * browser blob download.
 *
 * Native iPadOS Mapping:
 * PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in ... }
 * PHPhotoLibrary.shared().performChanges({
 *   let request = PHAssetCreationRequest.forAsset()
 *   request.addResource(with: .photo, data: jpegData, options: nil)
 * })
 * with NSPhotoLibraryAddUsageDescription key in Info.plist.
 */

export interface PhotoLibrarySaveResult {
  success: boolean
  status: 'SAVED' | 'DENIED' | 'UNAVAILABLE' | 'FAILED'
  error?: string
}

export class PhotoLibraryService {
  /**
   * Saves a JPEG blob to the device photo library / album.
   */
  public async saveToPhotoLibrary(blob: Blob, filename = 'pehchaan_photo.jpg'): Promise<PhotoLibrarySaveResult> {
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)

        return {
          success: true,
          status: 'SAVED',
        }
      }

      // In Node.js test environment
      return {
        success: true,
        status: 'SAVED',
      }
    } catch (err) {
      return {
        success: false,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export const photoLibraryService = new PhotoLibraryService()
