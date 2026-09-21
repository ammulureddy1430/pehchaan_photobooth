import type { DbPaymentStatus } from '../db/types.js'

export interface CreateGatewayOrderParams {
  paymentReference: string
  amount: number
  currency: string
  merchantName?: string
  upiId?: string
  timeoutSeconds?: number
  metadata?: Record<string, unknown>
}

export interface GatewayOrderResult {
  gatewayOrderId: string
  paymentReference: string
  qrUri: string
  gatewayProvider: string
  rawOrder?: unknown
}

export interface GatewayWebhookPayload {
  eventId: string
  eventType: string
  paymentReference: string
  gatewayOrderId?: string
  gatewayPaymentId: string
  amount: number
  currency: string
  status: 'success' | 'failed' | 'cancelled'
  failureReason?: string
  receivedAt: number
  rawEvent?: unknown
}

export interface GatewayOrderStatusResult {
  status: DbPaymentStatus
  paymentReference: string
  gatewayOrderId?: string
  gatewayPaymentId?: string
  amount?: number
  currency?: string
  verified: boolean
  error?: string
}

export interface PaymentGatewayProvider {
  readonly name: string
  createPaymentOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult>
  verifyWebhookSignature(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): boolean
  parseWebhookPayload(
    body: unknown,
    headers?: Record<string, string | string[] | undefined>
  ): GatewayWebhookPayload | null
  queryOrderStatus(orderIdOrRef: string): Promise<GatewayOrderStatusResult>
}
