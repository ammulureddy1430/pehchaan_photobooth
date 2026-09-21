import { generateQrDataUrl, generateQrSvg } from './qrGenerator'
import { validateShareUrl } from './validation'
import type { CloudQrRequest, CloudQrResult } from './types'

/**
 * Service for Cloud QR code generation and presentation.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this prototype, QR codes are generated dynamically as SVG/Data URLs from the validated public share link.
 * In the final native iPadOS application, this service will map to CoreImage
 * (CIFilter(name: "CIQRCodeGenerator")).
 */
export class CloudQrService {
  /**
   * Generates a QR code for a session.
   *
   * CRITICAL REQUIREMENT:
   * A Cloud QR code must NEVER be generated before the session has a valid
   * public cloud share URL from Step 6 synchronization ACK.
   * It must never contain internal blob URLs, IndexedDB IDs, or auth secrets.
   */
  public generateCloudQr(request: CloudQrRequest, enabled: boolean = true): CloudQrResult {
    const { sessionId, galleryUrl } = request

    if (!enabled) {
      return {
        success: false,
        status: 'DISABLED',
        error: 'Cloud QR code is disabled in the current Event Pack.',
      }
    }

    if (!sessionId) {
      return {
        success: false,
        status: 'FAILED',
        error: 'sessionId is required for Cloud QR generation.',
      }
    }

    // 1. Verify cloud sync ACK / public share URL exists and is valid
    if (!validateShareUrl(galleryUrl)) {
      return {
        success: false,
        status: 'WAITING_FOR_SYNC',
        error: 'Cloud QR code is unavailable because session is waiting for cloud synchronization.',
      }
    }

    try {
      const shareUrl = galleryUrl!
      const qrDataUrl = generateQrDataUrl(shareUrl, { margin: 4 })
      const qrSvg = generateQrSvg(shareUrl, { margin: 4 })

      return {
        success: true,
        status: 'READY',
        shareUrl,
        qrDataUrl,
        qrSvg,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        status: 'FAILED',
        error: `QR generation failed: ${errorMsg}`,
      }
    }
  }
}

export const cloudQrService = new CloudQrService()
