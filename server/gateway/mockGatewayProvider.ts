import crypto from 'node:crypto'
import type {
  PaymentGatewayProvider,
  CreateGatewayOrderParams,
  GatewayOrderResult,
  GatewayWebhookPayload,
  GatewayOrderStatusResult,
} from './types.js'

export class MockGatewayProvider implements PaymentGatewayProvider {
  public readonly name = 'mock_upi'
  public webhookSecret: string

  constructor(secret: string = 'mock_webhook_secret') {
    this.webhookSecret = process.env.GATEWAY_WEBHOOK_SECRET || secret
  }

  public async createPaymentOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult> {
    const {
      paymentReference,
      amount,
      currency,
      merchantName = 'Pehchaan Photobooth',
      upiId = 'pehchaan@upi',
    } = params

    const gatewayOrderId = `mock_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const qrUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=${currency}&tr=${encodeURIComponent(paymentReference)}&tn=${encodeURIComponent('Pehchaan Photobooth')}`

    return {
      gatewayOrderId,
      paymentReference,
      qrUri,
      gatewayProvider: this.name,
      rawOrder: {
        gatewayOrderId,
        paymentReference,
        amount,
        currency,
        status: 'pending',
      },
    }
  }

  public signPayload(rawBody: string | Buffer): string {
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8')
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyBuffer)
      .digest('hex')
  }

  public verifyWebhookSignature(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): boolean {
    const signature = (headers['x-webhook-signature'] || headers['x-signature'] || headers['x-razorpay-signature'] || '') as string
    if (!signature || !this.webhookSecret) return false

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8')
      const expectedSignature = this.signPayload(bodyBuffer)

      const sigBuf = Buffer.from(signature, 'hex')
      const expBuf = Buffer.from(expectedSignature, 'hex')

      if (sigBuf.length !== expBuf.length) return false
      return crypto.timingSafeEqual(sigBuf, expBuf)
    } catch {
      return false
    }
  }

  public parseWebhookPayload(
    body: unknown,
    _headers?: Record<string, string | string[] | undefined>
  ): GatewayWebhookPayload | null {
    if (!body || typeof body !== 'object') return null
    const event = body as Record<string, any>

    const eventId = String(event.eventId || event.id || `evt_${Date.now()}`)
    const eventType = String(event.eventType || event.event || 'payment.success')
    const paymentReference = String(event.paymentReference || event.referenceId || event.orderId || '')
    const gatewayPaymentId = String(event.gatewayPaymentId || event.transactionId || event.paymentId || `pay_mock_${Date.now()}`)
    const gatewayOrderId = event.gatewayOrderId || event.orderId || undefined
    const amount = Number(event.amount) || 0
    const currency = String(event.currency || 'INR').toUpperCase()

    let status: 'success' | 'failed' | 'cancelled' = 'failed'
    const rawStatus = String(event.status || '').toLowerCase()
    if (rawStatus === 'success' || rawStatus === 'captured' || rawStatus === 'paid' || eventType.includes('success')) {
      status = 'success'
    } else if (rawStatus === 'cancelled') {
      status = 'cancelled'
    } else {
      status = 'failed'
    }

    const failureReason = event.failureReason || event.errorMessage || event.reason || undefined

    return {
      eventId,
      eventType,
      paymentReference,
      gatewayOrderId,
      gatewayPaymentId,
      amount,
      currency,
      status,
      failureReason,
      receivedAt: Date.now(),
      rawEvent: event,
    }
  }

  public async queryOrderStatus(orderIdOrRef: string): Promise<GatewayOrderStatusResult> {
    return {
      status: 'pending',
      paymentReference: orderIdOrRef,
      verified: false,
    }
  }
}
