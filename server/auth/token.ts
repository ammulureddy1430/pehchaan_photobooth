import crypto from 'node:crypto'
import { AppError } from '../errors/AppError.js'

export interface DeviceTokenPayload {
  deviceId: string
  issuedAt: number
  role: 'device'
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function getDeviceAuthSecret(): string {
  return process.env.DEVICE_AUTH_SECRET || 'pehchaan-photobooth-dev-device-secret-key-32b'
}

export function generateDeviceToken(deviceId: string, secret?: string): string {
  const secretKey = secret || getDeviceAuthSecret()
  const payload: DeviceTokenPayload = {
    deviceId,
    issuedAt: Date.now(),
    role: 'device',
  }

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadEncoded)
    .digest('base64url')

  return `${payloadEncoded}.${signature}`
}

export function verifyDeviceToken(token: string, secret?: string): DeviceTokenPayload {
  if (!token || typeof token !== 'string') {
    throw new AppError(401, 'MISSING_DEVICE_TOKEN', 'Device authentication token is required')
  }

  const parts = token.trim().split('.')
  if (parts.length !== 2) {
    throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Malformed device authentication token')
  }

  const [payloadEncoded, signature] = parts
  const secretKey = secret || getDeviceAuthSecret()

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadEncoded)
    .digest('base64url')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Invalid device token signature')
  }

  try {
    const payloadJson = base64UrlDecode(payloadEncoded)
    const payload = JSON.parse(payloadJson) as DeviceTokenPayload

    if (!payload.deviceId || typeof payload.deviceId !== 'string') {
      throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Invalid device token payload')
    }

    return payload
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Failed to decode device token payload')
  }
}
