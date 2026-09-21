import type { IncomingMessage } from 'node:http'
import type { DeviceRepository } from '../db/repositories/deviceRepository.js'
import type { DeviceRecord } from '../db/types.js'
import { verifyDeviceToken } from './token.js'
import { AppError } from '../errors/AppError.js'

export function extractDeviceToken(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization']
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) {
      return match[1].trim()
    }
  }

  const customHeader = req.headers['x-device-token']
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim()
  }

  return null
}

export function authenticateDevice(
  req: IncomingMessage,
  deviceRepo: DeviceRepository,
  secret?: string
): DeviceRecord {
  const token = extractDeviceToken(req)
  if (!token) {
    throw new AppError(401, 'MISSING_DEVICE_TOKEN', 'Device authentication token is required')
  }

  const payload = verifyDeviceToken(token, secret)
  const device = deviceRepo.getDevice(payload.deviceId)

  if (!device) {
    throw new AppError(401, 'DEVICE_NOT_FOUND', `Device ${payload.deviceId} is not registered`)
  }

  if (device.status === 'revoked' || device.revokedAt !== null) {
    throw new AppError(403, 'DEVICE_REVOKED', `Device ${device.deviceId} has been revoked`)
  }

  return device
}
