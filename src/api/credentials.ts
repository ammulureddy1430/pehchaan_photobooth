/**
 * Client credentials abstraction for Pehchaan Photobooth.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this browser prototype, credentials (such as local device authentication tokens)
 * are stored via isolated local storage abstraction with in-memory fallback.
 *
 * Native iPadOS Mapping:
 * In the native iPadOS app, all device authentication tokens and cryptographically
 * sensitive secrets MUST be stored in the Apple Keychain Services API:
 * - SecItemAdd
 * - SecItemCopyMatching
 * - SecItemUpdate
 * - SecItemDelete
 * with kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly protection.
 *
 * Server-side secrets (WhatsApp Business API tokens, SMTP credentials, Twilio API keys)
 * MUST NEVER be bundled or placed into the client application.
 */

export interface DeviceCredentials {
  deviceId: string
  deviceToken: string | null
  createdAt: number
}

const MEMORY_CREDENTIALS: Map<string, string> = new Map()

export class ClientCredentialsService {
  /**
   * Stores a secure device token.
   */
  public static async storeToken(key: string, token: string): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`sec_${key}`, token)
      }
    } catch {
      // Memory fallback
    }
    MEMORY_CREDENTIALS.set(key, token)
  }

  /**
   * Retrieves a secure device token.
   */
  public static async getToken(key: string): Promise<string | null> {
    try {
      if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(`sec_${key}`)
        if (item) return item
      }
    } catch {
      // Memory fallback
    }
    return MEMORY_CREDENTIALS.get(key) || null
  }

  /**
   * Deletes a secure device token.
   */
  public static async deleteToken(key: string): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`sec_${key}`)
      }
    } catch {
      // Memory fallback
    }
    MEMORY_CREDENTIALS.delete(key)
  }
}
