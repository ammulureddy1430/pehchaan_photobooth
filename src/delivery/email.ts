import { validateEmail, validateShareUrl } from './validation'
import type { EmailDeliveryRequest, EmailDeliveryResult } from './types'

/**
 * Service for Email delivery.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this browser prototype, email delivery prepares a clean `mailto:` link containing
 * the verified public gallery link.
 * In the final native iPadOS application, this service will map to MFMailComposeViewController
 * or native system share sheets.
 */
export class EmailDeliveryService {
  /**
   * Prepares and triggers email delivery for a session.
   * Requires:
   * 1. Email feature flag is ON.
   * 2. Valid email address.
   * 3. Valid public gallery / share URL from Step 6 server ACK.
   */
  public prepareEmailDelivery(
    request: EmailDeliveryRequest,
    enabled: boolean = true
  ): EmailDeliveryResult {
    const { sessionId, email, galleryUrl, eventName = 'Pehchaan Photobooth' } = request

    if (!enabled) {
      return {
        success: false,
        status: 'DISABLED',
        error: 'Email delivery is disabled in the current Event Pack.',
      }
    }

    if (!sessionId) {
      return {
        success: false,
        status: 'FAILED',
        error: 'sessionId is required for Email delivery.',
      }
    }

    // 1. Validate email address
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid || !emailValidation.normalized) {
      return {
        success: false,
        status: 'FAILED',
        error: emailValidation.error || 'Invalid email address.',
      }
    }

    // 2. Validate cloud gallery/share URL
    if (!validateShareUrl(galleryUrl)) {
      return {
        success: false,
        status: 'WAITING_FOR_SYNC',
        error: 'Session is waiting for cloud synchronization. Email delivery will be ready once cloud sync completes.',
      }
    }

    // 3. Construct clean email subject and body (No auth tokens or private data)
    const subject = `Your Photo from ${eventName}`
    const body = `Hello,\n\nThank you for visiting ${eventName}! You can view and download your photobooth portrait at the following link:\n\n${galleryUrl}\n\nEnjoy your photo!`

    const mailtoUrl = `mailto:${encodeURIComponent(emailValidation.normalized)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    return {
      success: true,
      status: 'READY',
      mailtoUrl,
    }
  }

  /**
   * Executes browser mailto handoff.
   */
  public launchHandoff(mailtoUrl: string): boolean {
    if (typeof window === 'undefined') return false
    try {
      window.location.href = mailtoUrl
      return true
    } catch (err) {
      console.error('[EmailDeliveryService] Failed to open mailto link:', err)
      return false
    }
  }
}

export const emailDeliveryService = new EmailDeliveryService()
