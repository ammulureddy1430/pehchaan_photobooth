import crypto from 'node:crypto'
import type {
  PaymentGatewayProvider,
  CreateGatewayOrderParams,
  GatewayOrderResult,
  GatewayWebhookPayload,
  GatewayOrderStatusResult,
} from './types.js'

export interface RazorpayConfig {
  keyId?: string
  keySecret?: string
  webhookSecret?: string
}

export class RazorpayGatewayProvider implements PaymentGatewayProvider {
  public readonly name = 'razorpay'
  public readonly keyId: string
  public readonly keySecret: string
  public readonly webhookSecret: string

  constructor(config: RazorpayConfig = {}) {
    this.keyId = config.keyId || process.env.RAZORPAY_KEY_ID || process.env.GATEWAY_KEY_ID || 'rzp_test_key'
    this.keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET || process.env.GATEWAY_KEY_SECRET || 'rzp_test_secret'
    this.webhookSecret = config.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || process.env.GATEWAY_WEBHOOK_SECRET || 'rzp_webhook_secret'
  }

  public async createPaymentOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult> {
    const { paymentReference, amount, currency, merchantName = 'Pehchaan Photobooth', upiId = 'pehchaan@upi' } = params
    const gatewayOrderId = `order_rzp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Standard NPCI Dynamic UPI Intent URI linked to the gateway order & reference
    const qrUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=${currency}&tr=${encodeURIComponent(paymentReference)}&tn=${encodeURIComponent('Pehchaan Photobooth')}`

    return {
      gatewayOrderId,
      paymentReference,
      qrUri,
      gatewayProvider: this.name,
      rawOrder: {
        id: gatewayOrderId,
        entity: 'order',
        amount: Math.round(amount * 100), // in paise
        currency,
        receipt: paymentReference,
        status: 'created',
      },
    }
  }

  public verifyWebhookSignature(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): boolean {
    const signature = (headers['x-razorpay-signature'] || headers['x-signature'] || '') as string
    if (!signature || !this.webhookSecret) return false

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8')
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(bodyBuffer)
        .digest('hex')

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

    const eventId = String(event.id || event.event_id || `evt_${Date.now()}`)
    const eventType = String(event.event || 'payment.captured')

    const payload = event.payload || {}
    const paymentEntity = payload.payment?.entity || event.payment || event
    const qrEntity = payload.qr_code?.entity || {}
    const orderEntity = payload.order?.entity || {}

    const paymentReference =
      paymentEntity.notes?.paymentReference ||
      qrEntity.notes?.paymentReference ||
      orderEntity.receipt ||
      paymentEntity.receipt ||
      event.paymentReference ||
      paymentEntity.description ||
      ''

    const gatewayPaymentId = String(paymentEntity.id || `pay_${Date.now()}`)
    const gatewayOrderId = String(paymentEntity.order_id || qrEntity.id || orderEntity.id || '')

    // Razorpay amount is typically in paise (divide by 100) if raw integer
    const rawAmount = paymentEntity.amount !== undefined ? Number(paymentEntity.amount) : 0
    const amount = rawAmount > 0 && Number.isInteger(rawAmount) && rawAmount >= 100 ? rawAmount / 100 : rawAmount
    const currency = String(paymentEntity.currency || 'INR').toUpperCase()

    let status: 'success' | 'failed' | 'cancelled' = 'failed'
    if (
      eventType === 'payment.captured' ||
      eventType === 'order.paid' ||
      eventType === 'qr_code.credited' ||
      paymentEntity.status === 'captured' ||
      paymentEntity.status === 'success'
    ) {
      status = 'success'
    } else if (eventType === 'payment.failed' || paymentEntity.status === 'failed') {
      status = 'failed'
    } else if (paymentEntity.status === 'cancelled') {
      status = 'cancelled'
    }

    const failureReason = paymentEntity.error_description || paymentEntity.error_reason || undefined

    return {
      eventId,
      eventType,
      paymentReference,
      gatewayOrderId: gatewayOrderId || undefined,
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
