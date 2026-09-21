import type Database from 'better-sqlite3'
import type { SessionRecord, SessionStatus, AssetRecord } from '../types.js'
import { AppError } from '../../errors/AppError.js'

export interface CreateSessionParams {
  sessionId: string
  deviceId: string
  shotCount?: number
  language?: string
  status?: SessionStatus
  eventPackVersion?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: number
}

export interface SessionWithAssets {
  session: SessionRecord
  assets: AssetRecord[]
}

export class SessionRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): SessionRecord {
    return {
      sessionId: row.session_id,
      eventId: row.event_id,
      deviceId: row.device_id,
      shotCount: Number(row.shot_count),
      language: row.language,
      status: row.status as SessionStatus,
      eventPackVersion: row.event_pack_version ?? null,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  createSession(eventId: string, params: CreateSessionParams): { session: SessionRecord; idempotent: boolean } {
    const { sessionId, deviceId, shotCount = 3, language = 'en', status = 'completed', eventPackVersion, metadata, createdAt } = params

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'sessionId is required')
    }
    if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'eventId is required')
    }
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'deviceId is required')
    }

    const trimmedSessionId = sessionId.trim()
    const trimmedEventId = eventId.trim()
    const trimmedDeviceId = deviceId.trim()

    // 1. Verify Event exists
    const eventRow = this.db.prepare('SELECT event_id FROM events WHERE event_id = ?').get(trimmedEventId)
    if (!eventRow) {
      throw new AppError(404, 'EVENT_NOT_FOUND', `Event ${trimmedEventId} not found`)
    }

    // 2. Verify Device exists and is active
    const deviceRow = this.db.prepare('SELECT device_id, status FROM devices WHERE device_id = ?').get(trimmedDeviceId) as { device_id: string; status: string } | undefined
    if (!deviceRow) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', `Device ${trimmedDeviceId} not found`)
    }
    if (deviceRow.status === 'revoked') {
      throw new AppError(403, 'DEVICE_REVOKED', `Device ${trimmedDeviceId} is revoked`)
    }

    // 3. Check for existing session (Mandatory Idempotency)
    const existingRow = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(trimmedSessionId)
    if (existingRow) {
      const existing = this.mapRow(existingRow)
      return {
        session: existing,
        idempotent: true,
      }
    }

    // 4. Insert new session
    const now = Date.now()
    const createdTimestamp = typeof createdAt === 'number' && createdAt > 0 ? createdAt : now
    const metadataJson = metadata ? JSON.stringify(metadata) : null

    try {
      this.db
        .prepare(
          `INSERT INTO sessions (session_id, event_id, device_id, shot_count, language, status, event_pack_version, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          trimmedSessionId,
          trimmedEventId,
          trimmedDeviceId,
          shotCount,
          language,
          status,
          eventPackVersion || null,
          metadataJson,
          createdTimestamp,
          now
        )
    } catch (err: unknown) {
      // If race condition hit SQLite UNIQUE constraint
      const sqliteErr = err as { code?: string; message?: string }
      if (sqliteErr.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || sqliteErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteErr.message?.includes('UNIQUE')) {
        const doubleCheck = this.getSession(trimmedSessionId)
        if (doubleCheck) {
          return {
            session: doubleCheck,
            idempotent: true,
          }
        }
      }
      throw err
    }

    const created = this.getSession(trimmedSessionId)!
    return {
      session: created,
      idempotent: false,
    }
  }

  getSession(sessionId: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId)
    if (!row) return null
    return this.mapRow(row)
  }

  getSessionWithAssets(sessionId: string): SessionWithAssets | null {
    const session = this.getSession(sessionId)
    if (!session) return null

    const assetRows = this.db
      .prepare('SELECT * FROM assets WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as any[]

    const assets: AssetRecord[] = assetRows.map((row) => ({
      assetId: row.asset_id,
      sessionId: row.session_id,
      deviceId: row.device_id,
      assetRole: row.asset_role,
      shotNumber: row.shot_number !== null ? Number(row.shot_number) : null,
      filename: row.filename,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      checksum: row.checksum,
      storageKey: row.storage_key,
      createdAt: Number(row.created_at),
    }))

    return {
      session,
      assets,
    }
  }

  completeSession(sessionId: string): { session: SessionRecord; idempotent: boolean } {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'sessionId is required')
    }
    const trimmedId = sessionId.trim()
    const session = this.getSession(trimmedId)
    if (!session) {
      throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${trimmedId} not found`)
    }

    if (session.status === 'completed') {
      return { session, idempotent: true }
    }

    const now = Date.now()
    this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?').run('completed', now, trimmedId)

    const updated = this.getSession(trimmedId)!
    return { session: updated, idempotent: false }
  }

  updateSessionStatus(sessionId: string, status: SessionStatus): { session: SessionRecord; idempotent: boolean } {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'sessionId is required')
    }
    const trimmedId = sessionId.trim()
    const session = this.getSession(trimmedId)
    if (!session) {
      throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${trimmedId} not found`)
    }

    if (session.status === status) {
      return { session, idempotent: true }
    }

    const now = Date.now()
    this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?').run(status, now, trimmedId)

    const updated = this.getSession(trimmedId)!
    return { session: updated, idempotent: false }
  }

  listEventSessions(eventId: string): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE event_id = ? ORDER BY created_at DESC')
      .all(eventId)
    return rows.map((r) => this.mapRow(r))
  }
}
