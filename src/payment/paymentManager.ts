import type { EventPack } from '../eventPack/types'
import type {
  PaymentRecord,
  PaymentSummary,
  PaymentStatus,
  CreatePaymentParams,
  PaymentVerificationResult,
  PaymentStatusResult,
} from './types'
import { mockPaymentProvider } from './mockProvider'
import { apiClient } from '../api/client'

/**
 * Payment Manager abstraction for Pehchaan Photobooth.
 *
 * Provides a unified API for payment initiation, status polling, server verification,
 * and duplicate payment prevention (idempotency).
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, requests attempt backend server synchronization if available,
 * and fallback gracefully to the local mock provider for seamless offline & local testing.
 * Production iPadOS architecture will connect directly to backend endpoints with server-side secrets.
 */
export class PaymentManager {
  private localHistory = new Map<string, PaymentRecord>()

  /**
   * Evaluates if a given EventPack requires individual guest payment.
   * Default is ORGANIZER SPONSORED (free, no payment required).
   */
  public isPaymentRequired(pack: EventPack): boolean {
    if (!pack.payment) return false
    if (pack.payment.enabled === false) return false
    return pack.payment.mode === 'individual'
  }

  /**
   * Initiates a new payment attempt with idempotency protection.
   */
  public async createPayment(params: CreatePaymentParams): Promise<PaymentRecord> {
    const { sessionId } = params

    // Idempotency Check: Verify if session already has a successful payment
    for (const record of this.localHistory.values()) {
      if (record.sessionId === sessionId && record.status === 'success') {
        return record
      }
    }

    // Try backend server first
    try {
      const serverResult = await this.callServerCreatePayment(params)
      if (serverResult) {
        this.localHistory.set(serverResult.paymentReference, serverResult)
        mockPaymentProvider.registerPayment(serverResult)
        return serverResult
      }
    } catch {
      // Backend unavailable or offline; fallback to prototype mock provider
    }

    // Fallback to local mock provider for Chrome prototype
    const mockRecord = await mockPaymentProvider.createPayment(params)
    this.localHistory.set(mockRecord.paymentReference, mockRecord)
    return mockRecord
  }

  /**
   * Retrieves the current status of a payment attempt.
   */
  public async getPaymentStatus(paymentReference: string): Promise<PaymentStatusResult> {
    // Check if mockPaymentProvider has an explicit simulated/completed state
    const mockStatus = await mockPaymentProvider.getPaymentStatus(paymentReference)
    if (mockStatus.record && mockStatus.status !== 'pending') {
      this.localHistory.set(paymentReference, mockStatus.record)
      void this.callServerSimulatePayment(
        paymentReference,
        mockStatus.status,
        mockStatus.record.errorMessage || undefined
      ).catch(() => {})
      return mockStatus
    }

    // Try backend server
    try {
      const serverStatus = await this.callServerGetStatus(paymentReference)
      if (serverStatus) {
        if (serverStatus.record) {
          this.localHistory.set(paymentReference, serverStatus.record)
          mockPaymentProvider.registerPayment(serverStatus.record)
        }
        return serverStatus
      }
    } catch {
      // Backend unavailable; query local mock provider
    }

    if (mockStatus.record) {
      this.localHistory.set(paymentReference, mockStatus.record)
    }
    return mockStatus
  }

  /**
   * Simulates a payment state transition (success, failed, cancelled, expired) for demo/testing.
   */
  public async simulatePayment(
    paymentReference: string,
    status: PaymentStatus,
    reason?: string
  ): Promise<PaymentStatusResult> {
    // 1. Update mock provider
    if (status === 'success') {
      mockPaymentProvider.simulateSuccess(paymentReference)
    } else if (status === 'failed') {
      mockPaymentProvider.simulateFailure(paymentReference, reason)
    } else if (status === 'cancelled') {
      mockPaymentProvider.simulateCancel(paymentReference)
    } else if (status === 'expired') {
      mockPaymentProvider.simulateExpired(paymentReference)
    }

    // 2. Try backend server simulation endpoint
    try {
      await this.callServerSimulatePayment(paymentReference, status, reason)
    } catch {
      // Backend unavailable; mock provider handles local simulation
    }

    // 3. Update local history
    const local = this.localHistory.get(paymentReference)
    if (local) {
      local.status = status
      local.updatedAt = Date.now()
      if (status === 'success') {
        local.verifiedAt = Date.now()
      }
      if (reason) {
        local.errorMessage = reason
      }
    }

    return this.getPaymentStatus(paymentReference)
  }

  /**
   * Verifies the payment with the backend verification authority.
   * NEVER trust client-side claims alone without server verification.
   */
  public async verifyPayment(paymentReference: string): Promise<PaymentVerificationResult> {
    // Try backend server first
    try {
      const serverVerification = await this.callServerVerifyPayment(paymentReference)
      if (serverVerification && serverVerification.verified) {
        const local = this.localHistory.get(paymentReference)
        if (local) {
          local.status = 'success'
          local.verifiedAt = serverVerification.verifiedAt || Date.now()
          local.updatedAt = Date.now()
        }
        mockPaymentProvider.simulateSuccess(paymentReference)
        return serverVerification
      }
    } catch {
      // Backend unavailable; check local mock provider
    }

    const mockVerification = await mockPaymentProvider.verifyPayment(paymentReference)
    if (mockVerification.verified) {
      const local = this.localHistory.get(paymentReference)
      if (local) {
        local.status = 'success'
        local.verifiedAt = mockVerification.verifiedAt || Date.now()
        local.updatedAt = Date.now()
      }
    }
    return mockVerification
  }

  /**
   * Cancels a pending payment session.
   */
  public async cancelPayment(paymentReference: string): Promise<PaymentStatusResult> {
    try {
      await this.callServerCancelPayment(paymentReference)
    } catch {
      // Backend unavailable
    }

    const mockResult = await mockPaymentProvider.cancelPayment(paymentReference)
    const local = this.localHistory.get(paymentReference)
    if (local && local.status !== 'success') {
      local.status = 'cancelled'
      local.updatedAt = Date.now()
    }
    return mockResult
  }

  /**
   * Retrieves aggregated payment summary for Staff Mode.
   */
  public async getEventSummary(eventId: string): Promise<PaymentSummary> {
    try {
      const summary = await this.callServerGetSummary(eventId)
      if (summary) return summary
    } catch {
      // Backend unavailable
    }

    // Compute from local history
    let successfulCount = 0
    let pendingCount = 0
    let failedCount = 0
    let cancelledCount = 0
    let totalCollected = 0
    let currency = 'INR'

    for (const record of this.localHistory.values()) {
      if (record.eventId === eventId && record.mode === 'individual') {
        currency = record.currency || 'INR'
        if (record.status === 'success') {
          successfulCount++
          totalCollected += record.amount || 0
        } else if (record.status === 'pending' || record.status === 'initiated') {
          pendingCount++
        } else if (record.status === 'failed' || record.status === 'expired') {
          failedCount++
        } else if (record.status === 'cancelled') {
          cancelledCount++
        }
      }
    }

    return {
      eventId,
      successfulCount,
      pendingCount,
      failedCount,
      cancelledCount,
      totalCollected,
      currency,
    }
  }

  // --- Internal Backend HTTP Call Helpers ---

  private async callServerCreatePayment(params: CreatePaymentParams): Promise<PaymentRecord | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.payment || null
  }

  private async callServerGetStatus(paymentReference: string): Promise<PaymentStatusResult | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(paymentReference)}`, {
      method: 'GET',
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      status: json.status,
      paymentReference,
      record: json.payment,
    }
  }

  private async callServerSimulatePayment(
    paymentReference: string,
    status: PaymentStatus,
    reason?: string
  ): Promise<PaymentStatusResult | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(paymentReference)}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      status: json.status,
      paymentReference,
      record: json.payment,
      error: json.error,
    }
  }

  private async callServerVerifyPayment(paymentReference: string): Promise<PaymentVerificationResult | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(paymentReference)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      verified: Boolean(json.verified),
      status: json.status || (json.verified ? 'success' : 'failed'),
      paymentReference,
      verifiedAt: json.verifiedAt || null,
      error: json.error,
    }
  }

  private async callServerCancelPayment(paymentReference: string): Promise<PaymentStatusResult | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(paymentReference)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      status: json.status,
      paymentReference,
      record: json.payment,
    }
  }

  private async callServerGetSummary(eventId: string): Promise<PaymentSummary | null> {
    const baseUrl = apiClient.getBaseUrl()
    const res = await fetch(`${baseUrl}/api/payments/summary/${encodeURIComponent(eventId)}`, {
      method: 'GET',
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.summary || null
  }
}

export const paymentManager = new PaymentManager()
