import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { AssetRecord, AssetRole } from '../types.js'
import { AppError } from '../../errors/AppError.js'
import type { AssetStorage } from '../../storage/storage.js'

export interface CreateAssetParams {
  assetId?: string
  deviceId: string
  assetRole: AssetRole
  shotNumber?: number | null
  filename: string
  contentType: string
  data: Buffer
  createdAt?: number
}

export class AssetRepository {
  constructor(
    private db: Database.Database,
    private storage: AssetStorage
  ) {}

  private mapRow(row: any): AssetRecord {
    return {
      assetId: row.asset_id,
      sessionId: row.session_id,
      deviceId: row.device_id,
      assetRole: row.asset_role as AssetRole,
      shotNumber: row.shot_number !== null ? Number(row.shot_number) : null,
      filename: row.filename,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      checksum: row.checksum,
      storageKey: row.storage_key,
      createdAt: Number(row.created_at),
    }
  }

  async createAsset(
    sessionId: string,
    params: CreateAssetParams
  ): Promise<{ asset: AssetRecord; idempotent: boolean }> {
    const { deviceId, assetRole, shotNumber = null, filename, contentType, data, createdAt } = params

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'sessionId is required')
    }
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'deviceId is required')
    }
    if (!filename || typeof filename !== 'string' || filename.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'filename is required')
    }
    if (!contentType || typeof contentType !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'contentType is required')
    }
    if (!Buffer.isBuffer(data) || data.byteLength === 0) {
      throw new AppError(400, 'INVALID_ASSET', 'Asset data buffer is required and cannot be empty')
    }

    const validRoles: AssetRole[] = ['original', 'thumbnail', 'composed', 'print']
    if (!validRoles.includes(assetRole)) {
      throw new AppError(400, 'INVALID_ASSET', `Invalid asset role: ${assetRole}. Must be one of: ${validRoles.join(', ')}`)
    }

    const trimmedSessionId = sessionId.trim()
    const trimmedDeviceId = deviceId.trim()
    const trimmedFilename = filename.trim()

    // 1. Verify Session exists
    const sessionRow = this.db.prepare('SELECT session_id, event_id FROM sessions WHERE session_id = ?').get(trimmedSessionId)
    if (!sessionRow) {
      throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${trimmedSessionId} not found`)
    }

    // 2. Check Idempotency by explicit assetId or by (sessionId, filename) or (sessionId, assetRole, shotNumber)
    const assetId = (params.assetId && params.assetId.trim().length > 0)
      ? params.assetId.trim()
      : `ast_${crypto.randomUUID()}`

    // Check by assetId
    const existingById = this.getAsset(assetId)
    if (existingById) {
      return { asset: existingById, idempotent: true }
    }

    // Check by session_id and filename
    const existingByFilename = this.db
      .prepare('SELECT * FROM assets WHERE session_id = ? AND filename = ?')
      .get(trimmedSessionId, trimmedFilename)
    if (existingByFilename) {
      return { asset: this.mapRow(existingByFilename), idempotent: true }
    }

    // Check by session_id, asset_role, shot_number
    if (shotNumber !== null && shotNumber !== undefined) {
      const existingByRoleAndShot = this.db
        .prepare('SELECT * FROM assets WHERE session_id = ? AND asset_role = ? AND shot_number = ?')
        .get(trimmedSessionId, assetRole, shotNumber)
      if (existingByRoleAndShot) {
        return { asset: this.mapRow(existingByRoleAndShot), idempotent: true }
      }
    } else {
      const existingByRole = this.db
        .prepare('SELECT * FROM assets WHERE session_id = ? AND asset_role = ? AND shot_number IS NULL')
        .get(trimmedSessionId, assetRole)
      if (existingByRole) {
        return { asset: this.mapRow(existingByRole), idempotent: true }
      }
    }

    // 3. Store asset data in storage abstraction
    const storageKey = `sessions/${trimmedSessionId}/${assetRole}/${trimmedFilename}`
    const stored = await this.storage.put(storageKey, data, contentType)

    // 4. Insert into database
    const now = Date.now()
    const createdTimestamp = typeof createdAt === 'number' && createdAt > 0 ? createdAt : now

    try {
      this.db
        .prepare(
          `INSERT INTO assets (asset_id, session_id, device_id, asset_role, shot_number, filename, content_type, byte_size, checksum, storage_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          assetId,
          trimmedSessionId,
          trimmedDeviceId,
          assetRole,
          shotNumber,
          trimmedFilename,
          contentType,
          stored.byteSize,
          stored.checksum,
          stored.storageKey,
          createdTimestamp
        )
    } catch (err: unknown) {
      const sqliteErr = err as { code?: string; message?: string }
      if (
        sqliteErr.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
        sqliteErr.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        sqliteErr.message?.includes('UNIQUE')
      ) {
        const doubleCheckById = this.getAsset(assetId)
        if (doubleCheckById) {
          return {
            asset: doubleCheckById,
            idempotent: true,
          }
        }
        const doubleCheckRow = this.db
          .prepare('SELECT * FROM assets WHERE session_id = ? AND filename = ?')
          .get(trimmedSessionId, trimmedFilename)
        if (doubleCheckRow) {
          return {
            asset: this.mapRow(doubleCheckRow),
            idempotent: true,
          }
        }
      }
      throw err
    }

    const created = this.getAsset(assetId)!
    return {
      asset: created,
      idempotent: false,
    }
  }

  getAsset(assetId: string): AssetRecord | null {
    const row = this.db.prepare('SELECT * FROM assets WHERE asset_id = ?').get(assetId)
    if (!row) return null
    return this.mapRow(row)
  }

  listSessionAssets(sessionId: string): AssetRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM assets WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId)
    return rows.map((r) => this.mapRow(r))
  }
}
