import type { PaymentMode, EventPackPaymentConfig } from '../eventPack/types'
import type { PaymentStatus } from '../types'

export type { PaymentMode, PaymentStatus, EventPackPaymentConfig }

export interface PaymentRecord {
  id: string
  eventId: string
  sessionId: string
  deviceId: string
  paymentReference: string
  amount: number
  currency: string
  mode: PaymentMode
  status: PaymentStatus
  provider: string
  upiId?: string
  merchantName?: string
  qrUri?: string
  createdAt: number
  updatedAt: number
  verifiedAt?: number | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface PaymentSummary {
  eventId: string
  successfulCount: number
  pendingCount: number
  failedCount: number
  cancelledCount: number
  totalCollected: number
  currency: string
}

export interface CreatePaymentParams {
  eventId: string
  sessionId: string
  deviceId?: string
  amount: number
  currency?: string
  mode?: PaymentMode
  upiId?: string
  merchantName?: string
  timeoutSeconds?: number
}

export interface PaymentVerificationResult {
  verified: boolean
  status: PaymentStatus
  paymentReference: string
  verifiedAt?: number | null
  error?: string
}

export interface PaymentStatusResult {
  status: PaymentStatus
  paymentReference: string
  record?: PaymentRecord
  error?: string
}
