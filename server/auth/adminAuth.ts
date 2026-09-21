import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { AdminRepository } from '../db/repositories/adminRepository.js'
import type { AdminRecord, SafeAdminRecord } from '../db/types.js'
import { AppError } from '../errors/AppError.js'

export interface AdminTokenPayload {
  adminId: string
  email: string
  name: string
  role: 'admin' | 'superadmin' | string
  schoolId?: string | null
  issuedAt: number
  expiresAt: number
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

export function getAdminAuthSecret(): string {
  return process.env.ADMIN_AUTH_SECRET || 'pehchaan-photobooth-dev-admin-secret-key-32b'
}

export const ADMIN_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export function generateAdminToken(
  admin: Pick<AdminRecord, 'id' | 'email' | 'name' | 'role'> & { schoolId?: string | null },
  expiresInMs: number = ADMIN_TOKEN_EXPIRY_MS,
  secret?: string
): string {
  const secretKey = secret || getAdminAuthSecret()
  const now = Date.now()
  const payload: AdminTokenPayload = {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    schoolId: admin.schoolId ?? null,
    issuedAt: now,
    expiresAt: now + expiresInMs,
  }

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadEncoded)
    .digest('base64url')

  return `${payloadEncoded}.${signature}`
}

export function verifyAdminToken(token: string, secret?: string): AdminTokenPayload {
  if (!token || typeof token !== 'string') {
    throw new AppError(401, 'MISSING_ADMIN_TOKEN', 'Admin authentication token is required')
  }

  const parts = token.trim().split('.')
  if (parts.length !== 2) {
    throw new AppError(401, 'INVALID_ADMIN_TOKEN', 'Malformed admin authentication token')
  }

  const [payloadEncoded, signature] = parts
  const secretKey = secret || getAdminAuthSecret()

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadEncoded)
    .digest('base64url')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new AppError(401, 'INVALID_ADMIN_TOKEN', 'Invalid admin token signature')
  }

  try {
    const payloadJson = base64UrlDecode(payloadEncoded)
    const payload = JSON.parse(payloadJson) as AdminTokenPayload

    if (!payload.adminId || !payload.email || typeof payload.expiresAt !== 'number') {
      throw new AppError(401, 'INVALID_ADMIN_TOKEN', 'Invalid admin token payload structure')
    }

    if (Date.now() > payload.expiresAt) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Admin authentication session has expired')
    }

    return payload
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(401, 'INVALID_ADMIN_TOKEN', 'Failed to decode admin token payload')
  }
}

export function extractAdminToken(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization']
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) {
      return match[1].trim()
    }
  }

  const customHeader = req.headers['x-admin-token']
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim()
  }

  return null
}

export function authenticateAdmin(
  req: IncomingMessage,
  adminRepo: AdminRepository,
  secret?: string
): SafeAdminRecord {
  const token = extractAdminToken(req)
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Admin authentication token is required')
  }

  const payload = verifyAdminToken(token, secret)
  const admin = adminRepo.getAdminById(payload.adminId)

  if (!admin) {
    throw new AppError(401, 'ADMIN_NOT_FOUND', `Admin user not found for ID: ${payload.adminId}`)
  }

  return adminRepo.toSafe(admin)
}
