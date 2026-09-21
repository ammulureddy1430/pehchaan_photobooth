import type { PaymentGatewayProvider } from './types.js'
import { RazorpayGatewayProvider } from './razorpayProvider.js'
import { StandardUpiGatewayProvider } from './standardUpiProvider.js'
import { MockGatewayProvider } from './mockGatewayProvider.js'

export interface GatewayFactoryOptions {
  provider?: string
  webhookSecret?: string
  keyId?: string
  keySecret?: string
}

export function createGatewayProvider(options: GatewayFactoryOptions = {}): PaymentGatewayProvider {
  const providerName = (
    options.provider ||
    process.env.PAYMENT_PROVIDER ||
    process.env.GATEWAY_PROVIDER ||
    'standard_upi'
  ).toLowerCase()

  switch (providerName) {
    case 'razorpay':
      return new RazorpayGatewayProvider({
        keyId: options.keyId,
        keySecret: options.keySecret,
        webhookSecret: options.webhookSecret,
      })
    case 'mock':
    case 'mock_upi':
    case 'demo':
      return new MockGatewayProvider(options.webhookSecret)
    case 'standard_upi':
    default:
      return new StandardUpiGatewayProvider({
        merchantKey: options.keyId,
        webhookSecret: options.webhookSecret,
      })
  }
}
