import type {
  PaymentRecord,
  CreatePaymentParams,
  PaymentVerificationResult,
  PaymentStatusResult,
} from './types'
import { buildUpiIntentUrl, generatePaymentReference } from './upiQr'

/**
 * Mock UPI Payment Provider for Chrome Prototype testing and simulation.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, this provider simulates UPI payment processing,
 * QR code presentation, webhook triggers, and status verification.
 * In production native iPadOS deployment, payment initiation and webhook verification
 * occur through secure backend server routes (e.g. Razorpay/PhonePe/PineLabs UPI).
 * Frontend never contains merchant secret credentials.
 */
export class MockPaymentProvider {
  private payments = new Map<string, PaymentRecord>()
  private autoApproveDelayMs: number = 0 // 0 = manual simulation / test control

  public setAutoApproveDelay(ms: number) {
    this.autoApproveDelayMs = ms
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentRecord> {
    const paymentReference = generatePaymentReference(params.eventId, params.sessionId)
    const upiId = params.upiId || 'pehchaan@upi'
    const merchantName = params.merchantName || 'Pehchaan Photobooth'
    const amount = params.amount || 99
    const currency = params.currency || 'INR'

    const qrUri = buildUpiIntentUrl({
      upiId,
      merchantName,
      amount,
      currency,
      paymentReference,
    })

    const record: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventId: params.eventId,
      sessionId: params.sessionId,
      deviceId: params.deviceId || 'proto_device_1',
      paymentReference,
      amount,
      currency,
      mode: params.mode || 'individual',
      status: 'pending',
      provider: 'mock_upi_provider',
      upiId,
      merchantName,
      qrUri,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      verifiedAt: null,
      errorMessage: null,
    }

    this.payments.set(paymentReference, record)

    if (this.autoApproveDelayMs > 0) {
      setTimeout(() => {
        const existing = this.payments.get(paymentReference)
        if (existing && existing.status === 'pending') {
          existing.status = 'success'
          existing.verifiedAt = Date.now()
          existing.updatedAt = Date.now()
        }
      }, this.autoApproveDelayMs)
    }

    return record
  }

  public async getPaymentStatus(paymentReference: string): Promise<PaymentStatusResult> {
    const record = this.payments.get(paymentReference)
    if (!record) {
      return {
        status: 'failed',
        paymentReference,
        error: 'Payment record not found.',
      }
    }

    return {
      status: record.status,
      paymentReference,
      record,
    }
  }

  public async verifyPayment(paymentReference: string): Promise<PaymentVerificationResult> {
    const record = this.payments.get(paymentReference)
    if (!record) {
      return {
        verified: false,
        status: 'failed',
        paymentReference,
        error: 'Payment reference not found.',
      }
    }

    if (record.status === 'success') {
      return {
        verified: true,
        status: 'success',
        paymentReference,
        verifiedAt: record.verifiedAt || Date.now(),
      }
    }

    return {
      verified: false,
      status: record.status,
      paymentReference,
      error: `Payment is in ${record.status} state.`,
    }
  }

  public async cancelPayment(paymentReference: string): Promise<PaymentStatusResult> {
    const record = this.payments.get(paymentReference)
    if (!record) {
      return {
        status: 'failed',
        paymentReference,
        error: 'Payment reference not found.',
      }
    }

    if (record.status !== 'success') {
      record.status = 'cancelled'
      record.updatedAt = Date.now()
    }

    return {
      status: record.status,
      paymentReference,
      record,
    }
  }

  public registerPayment(record: PaymentRecord): void {
    this.payments.set(record.paymentReference, { ...record })
  }

  private getOrCreateRecord(paymentReference: string): PaymentRecord {
    let record = this.payments.get(paymentReference)
    if (!record) {
      const now = Date.now()
      record = {
        id: `pay_${now}_${Math.random().toString(36).slice(2, 7)}`,
        eventId: 'evt_sim',
        sessionId: 'sess_sim',
        deviceId: 'proto_device_1',
        paymentReference,
        amount: 99,
        currency: 'INR',
        mode: 'individual',
        status: 'pending',
        provider: 'mock_upi_provider',
        createdAt: now,
        updatedAt: now,
        verifiedAt: null,
        errorMessage: null,
      }
      this.payments.set(paymentReference, record)
    }
    return record
  }

  // --- Test & Simulation Hooks for Chrome Prototype ---
  public simulateSuccess(paymentReference: string): PaymentRecord {
    const record = this.getOrCreateRecord(paymentReference)
    record.status = 'success'
    record.verifiedAt = Date.now()
    record.updatedAt = Date.now()
    record.errorMessage = null
    this.payments.set(paymentReference, record)
    return record
  }

  public simulateFailure(paymentReference: string, reason?: string): PaymentRecord {
    const record = this.getOrCreateRecord(paymentReference)
    record.status = 'failed'
    record.errorMessage = reason || 'Payment was declined by bank/UPI app.'
    record.updatedAt = Date.now()
    this.payments.set(paymentReference, record)
    return record
  }

  public simulateCancel(paymentReference: string): PaymentRecord {
    const record = this.getOrCreateRecord(paymentReference)
    record.status = 'cancelled'
    record.errorMessage = 'Payment cancelled by user.'
    record.updatedAt = Date.now()
    this.payments.set(paymentReference, record)
    return record
  }

  public simulateExpired(paymentReference: string): PaymentRecord {
    const record = this.getOrCreateRecord(paymentReference)
    record.status = 'expired'
    record.errorMessage = 'Payment session expired.'
    record.updatedAt = Date.now()
    this.payments.set(paymentReference, record)
    return record
  }

  public clear(): void {
    this.payments.clear()
  }
}

export const mockPaymentProvider = new MockPaymentProvider()
