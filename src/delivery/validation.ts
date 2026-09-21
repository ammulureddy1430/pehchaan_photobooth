/**
 * Validation helpers for delivery channels (phone numbers, email addresses, URLs).
 */

export interface ValidationResult<T = string> {
  valid: boolean
  normalized?: T
  error?: string
}

/**
 * Validates and normalizes phone numbers for WhatsApp delivery.
 * Supports standard 10-digit mobile numbers (defaulting to +91 India country code)
 * and international numbers in E.164 format (+ followed by 10 to 15 digits).
 */
export function validatePhoneNumber(raw: string): ValidationResult<string> {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Phone number is required.' }
  }

  const trimmed = raw.trim()
  // Remove spaces, hyphens, brackets, dots
  const cleaned = trimmed.replace(/[\s\-().]/g, '')

  if (cleaned.length === 0) {
    return { valid: false, error: 'Phone number cannot be empty.' }
  }

  // International format with leading plus (+12345678901)
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1)
    if (!/^\d{10,15}$/.test(digits)) {
      return {
        valid: false,
        error: 'International phone number must have between 10 and 15 digits following "+".',
      }
    }
    return { valid: true, normalized: `+${digits}` }
  }

  // 10-digit national number (e.g. India standard 10-digit mobile)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+91${cleaned}` }
  }

  // 11 to 15 digits without plus
  if (/^\d{10,15}$/.test(cleaned)) {
    return { valid: true, normalized: `+${cleaned}` }
  }

  return {
    valid: false,
    error: 'Invalid phone number format. Enter a valid 10-digit mobile number or international number with country code.',
  }
}

/**
 * Validates and normalizes email addresses.
 */
export function validateEmail(raw: string): ValidationResult<string> {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Email address is required.' }
  }

  const trimmed = raw.trim().toLowerCase()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email address cannot be empty.' }
  }

  // Standard email regex compliant with practical email format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com).' }
  }

  return { valid: true, normalized: trimmed }
}

/**
 * Validates that a gallery or share URL is well-formed and safe.
 * Rejects blob: URLs, localhost internal tokens, or malformed strings.
 */
export function validateShareUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('blob:')) return false
  if (trimmed.includes('undefined') || trimmed.includes('null')) return false

  // Valid relative path /gallery/:sessionId or valid http(s) URL
  if (trimmed.startsWith('/gallery/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true
  }

  return false
}
