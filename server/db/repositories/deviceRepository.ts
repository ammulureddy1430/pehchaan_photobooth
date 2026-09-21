import type Database from 'better-sqlite3'
import type { DeviceRecord, SafeDeviceInfo } from '../types.js'
import { AppError } from '../../errors/AppError.js'
import { generateDeviceToken } from '../../auth/token.js'

export interface RegisterDeviceParams {
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  metadata?: Record<string, unknown>
}

export interface RegisterDeviceResult {
  device: SafeDeviceInfo
  token: string
  isNew: boolean
}

export interface HeartbeatParams {
  batteryLevel?: number
  appVersion?: string
  freeDiskBytes?: number
  status?: string
  metadata?: Record<string, unknown>
}

export class DeviceRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): DeviceRecord {
    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
      platform: row.platform,
      appVersion: row.app_version,
      status: row.status,
      registeredAt: Number(row.registered_at),
      lastSeen: Number(row.last_seen),
      lastHeartbeat: row.last_heartbeat ? Number(row.last_heartbeat) : null,
      revokedAt: row.revoked_at ? Number(row.revoked_at) : null,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    }
  }

  public toSafe(device: DeviceRecord): SafeDeviceInfo {
    return {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      appVersion: device.appVersion,
      status: device.status,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
      lastHeartbeat: device.lastHeartbeat,
      revokedAt: device.revokedAt,
      metadata: device.metadata,
    }
  }

  registerDevice(params: RegisterDeviceParams): RegisterDeviceResult {
    const { deviceId, deviceName, platform, appVersion, metadata } = params

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'deviceId is required and cannot be empty')
    }
    if (!deviceName || typeof deviceName !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'deviceName is required')
    }
    if (!platform || typeof platform !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'platform is required')
    }
    if (!appVersion || typeof appVersion !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'appVersion is required')
    }

    const trimmedId = deviceId.trim()
    const now = Date.now()
    const metadataJson = metadata ? JSON.stringify(metadata) : null

    const existingRow = this.db
      .prepare('SELECT * FROM devices WHERE device_id = ?')
      .get(trimmedId)

    if (existingRow) {
      const existing = this.mapRow(existingRow)

      if (existing.status === 'revoked' || existing.revokedAt !== null) {
        throw new AppError(403, 'DEVICE_REVOKED', `Device ${trimmedId} has been revoked and cannot register`)
      }

      // Safe repeated registration: update metadata and refresh lastSeen
      this.db
        .prepare(
          `UPDATE devices
           SET device_name = ?, platform = ?, app_version = ?, last_seen = ?, metadata_json = COALESCE(?, metadata_json)
           WHERE device_id = ?`
        )
        .run(deviceName, platform, appVersion, now, metadataJson, trimmedId)

      const updated = this.getDevice(trimmedId)!
      const token = generateDeviceToken(trimmedId)

      return {
        device: this.toSafe(updated),
        token,
        isNew: false,
      }
    }

    // Insert new device
    this.db
      .prepare(
        `INSERT INTO devices (device_id, device_name, platform, app_version, status, registered_at, last_seen, last_heartbeat, revoked_at, metadata_json)
         VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, NULL, ?)`
      )
      .run(trimmedId, deviceName, platform, appVersion, now, now, metadataJson)

    const created = this.getDevice(trimmedId)!
    const token = generateDeviceToken(trimmedId)

    return {
      device: this.toSafe(created),
      token,
      isNew: true,
    }
  }

  getDevice(deviceId: string): DeviceRecord | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId)
    if (!row) return null
    return this.mapRow(row)
  }

  listDevices(): SafeDeviceInfo[] {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY registered_at DESC').all()
    return rows.map((r) => this.toSafe(this.mapRow(r)))
  }

  revokeDevice(deviceId: string): SafeDeviceInfo {
    const existing = this.getDevice(deviceId)
    if (!existing) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${deviceId} not found`)
    }

    const now = Date.now()
    this.db
      .prepare(`UPDATE devices SET status = 'revoked', revoked_at = ? WHERE device_id = ?`)
      .run(now, deviceId)

    const updated = this.getDevice(deviceId)!
    return this.toSafe(updated)
  }

  heartbeat(deviceId: string, params: HeartbeatParams = {}): SafeDeviceInfo {
    const existing = this.getDevice(deviceId)
    if (!existing) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${deviceId} not found`)
    }

    if (existing.status === 'revoked' || existing.revokedAt !== null) {
      throw new AppError(403, 'DEVICE_REVOKED', `Device ${deviceId} is revoked`)
    }

    const now = Date.now()
    const mergedMetadata = {
      ...(existing.metadata || {}),
      ...(params.metadata || {}),
      ...(params.batteryLevel !== undefined ? { batteryLevel: params.batteryLevel } : {}),
      ...(params.freeDiskBytes !== undefined ? { freeDiskBytes: params.freeDiskBytes } : {}),
    }

    this.db
      .prepare(
        `UPDATE devices
         SET last_seen = ?, last_heartbeat = ?, app_version = COALESCE(?, app_version), metadata_json = ?
         WHERE device_id = ?`
      )
      .run(now, now, params.appVersion || null, JSON.stringify(mergedMetadata), deviceId)

    const updated = this.getDevice(deviceId)!
    return this.toSafe(updated)
  }
}
