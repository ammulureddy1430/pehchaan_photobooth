import { generateQrDataUrl, generateQrSvg } from '../delivery/qrGenerator'

export interface UpiIntentParams {
  upiId: string
  merchantName: string
  amount: number
  currency?: string
  paymentReference: string
  transactionNote?: string
}

/**
 * Builds a standard NPCI UPI Intent URL.
 * Specification format:
 * upi://pay?pa={upiId}&pn={merchantName}&am={amount}&cu={currency}&tr={paymentReference}&tn={transactionNote}
 */
export function buildUpiIntentUrl(params: UpiIntentParams): string {
  const {
    upiId,
    merchantName,
    amount,
    currency = 'INR',
    paymentReference,
    transactionNote = 'Pehchaan Photobooth',
  } = params

  const cleanUpiId = upiId.trim()
  const cleanMerchant = merchantName.trim()
  const formattedAmount = Number(amount).toFixed(2)

  const searchParams = new URLSearchParams()
  searchParams.set('pa', cleanUpiId)
  searchParams.set('pn', cleanMerchant)
  searchParams.set('am', formattedAmount)
  searchParams.set('cu', currency)
  searchParams.set('tr', paymentReference)
  searchParams.set('tn', transactionNote)

  return `upi://pay?${searchParams.toString()}`
}

/**
 * Creates a unique, idempotent payment reference.
 * Format: PB-{eventId}-{sessionId}-{timestamp}
 */
export function generatePaymentReference(eventId: string, sessionId: string): string {
  const cleanEvent = eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'event'
  const cleanSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'session'
  const timestamp = Date.now()
  const salt = Math.random().toString(36).slice(2, 6)
  return `PB-${cleanEvent}-${cleanSession}-${timestamp}-${salt}`
}

/**
 * Generates an SVG Data URL for the given UPI Intent URL.
 */
export function generateUpiQrDataUrl(intentUrl: string): string {
  return generateQrDataUrl(intentUrl, { margin: 4 })
}

/**
 * Generates raw SVG markup for the given UPI Intent URL.
 */
export function generateUpiQrSvg(intentUrl: string): string {
  return generateQrSvg(intentUrl, { margin: 4 })
}
