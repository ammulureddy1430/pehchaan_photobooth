import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { EventRecord, EventStatus } from '../types.js'
import { AppError } from '../../errors/AppError.js'

export interface CreateEventParams {
  eventId?: string
  schoolId?: string | null
  name: string
  description?: string | null
  eventDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue?: string | null
  status?: EventStatus
  eventPackId?: string | null
  eventPackVersion?: string | null
  eventPackSnapshot?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateEventParams {
  name?: string
  description?: string | null
  eventDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue?: string | null
  status?: EventStatus
  metadata?: Record<string, unknown> | null
}

export class EventRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): EventRecord {
    let parsedMetadata: Record<string, unknown> | null = null
    try {
      if (row.metadata_json) {
        parsedMetadata = JSON.parse(row.metadata_json)
      }
    } catch {
      parsedMetadata = null
    }

    let parsedSnapshot: Record<string, unknown> | null = null
    try {
      if (row.event_pack_snapshot_json) {
        parsedSnapshot = JSON.parse(row.event_pack_snapshot_json)
      }
    } catch {
      parsedSnapshot = null
    }

    const fallbackVenue = parsedMetadata?.venue ? String(parsedMetadata.venue) : null

    return {
      eventId: row.event_id,
      schoolId: row.school_id ?? null,
      name: row.name,
      description: row.description ?? null,
      eventDate: row.event_date ?? null,
      startTime: row.start_time ?? null,
      endTime: row.end_time ?? null,
      venue: row.venue ?? fallbackVenue,
      status: (row.status || 'draft') as EventStatus,
      eventPackId: row.event_pack_id ?? null,
      eventPackVersion: row.event_pack_version ?? null,
      eventPackSnapshot: parsedSnapshot,
      activationToken: row.activation_token ?? null,
      metadata: parsedMetadata,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  public static generateReadableEventId(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length]
    }
    return `PEH-${code}`
  }

  createEvent(params: CreateEventParams): { event: EventRecord; isNew: boolean } {
    const {
      name,
      schoolId,
      description,
      eventDate,
      startTime,
      endTime,
      venue,
      status = 'draft',
      eventPackId,
      eventPackVersion,
      eventPackSnapshot,
      metadata,
    } = params

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Event name is required')
    }

    const eventId = params.eventId && params.eventId.trim().length > 0
      ? params.eventId.trim()
      : EventRepository.generateReadableEventId()

    const activationToken = `act_${crypto.randomBytes(16).toString('hex')}`
    const now = Date.now()
    const snapshotJson = eventPackSnapshot ? JSON.stringify(eventPackSnapshot) : null
    const metadataJson = metadata ? JSON.stringify(metadata) : null

    const existingRow = this.db.prepare('SELECT * FROM events WHERE event_id = ? OR LOWER(event_id) = LOWER(?)').get(eventId, eventId)
    if (existingRow) {
      return {
        event: this.mapRow(existingRow),
        isNew: false,
      }
    }

    this.db
      .prepare(
        `INSERT INTO events (
          event_id, school_id, name, description, event_date, start_time, end_time, venue,
          status, event_pack_id, event_pack_version, event_pack_snapshot_json, activation_token, metadata_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        schoolId || null,
        name.trim(),
        description ? description.trim() : null,
        eventDate ? eventDate.trim() : null,
        startTime ? startTime.trim() : null,
        endTime ? endTime.trim() : null,
        venue ? venue.trim() : null,
        status,
        eventPackId || null,
        eventPackVersion || null,
        snapshotJson,
        activationToken,
        metadataJson,
        now,
        now
      )

    const created = this.getEvent(eventId)!
    return {
      event: created,
      isNew: true,
    }
  }

  updateEvent(eventId: string, updates: UpdateEventParams): EventRecord {
    const existing = this.getEvent(eventId)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
    }

    const now = Date.now()
    const name = updates.name !== undefined ? updates.name.trim() : existing.name
    if (!name) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Event name cannot be empty')
    }

    const description = updates.description !== undefined
      ? (updates.description ? updates.description.trim() : null)
      : (existing.description ?? null)

    const eventDate = updates.eventDate !== undefined
      ? (updates.eventDate ? updates.eventDate.trim() : null)
      : (existing.eventDate ?? null)

    const startTime = updates.startTime !== undefined
      ? (updates.startTime ? updates.startTime.trim() : null)
      : (existing.startTime ?? null)

    const endTime = updates.endTime !== undefined
      ? (updates.endTime ? updates.endTime.trim() : null)
      : (existing.endTime ?? null)

    const venue = updates.venue !== undefined
      ? (updates.venue ? updates.venue.trim() : null)
      : (existing.venue ?? null)

    const status = updates.status !== undefined ? updates.status : existing.status

    const mergedMetadata = updates.metadata !== undefined
      ? { ...(existing.metadata || {}), ...updates.metadata }
      : existing.metadata
    const metadataJson = mergedMetadata ? JSON.stringify(mergedMetadata) : null

    this.db
      .prepare(
        `UPDATE events
         SET name = ?, description = ?, event_date = ?, start_time = ?, end_time = ?, venue = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE event_id = ?`
      )
      .run(
        name,
        description,
        eventDate,
        startTime,
        endTime,
        venue,
        status,
        metadataJson,
        now,
        existing.eventId
      )

    return this.getEvent(existing.eventId)!
  }

  regenerateActivationToken(eventId: string): string {
    const event = this.getEvent(eventId)
    if (!event) {
      throw new AppError(404, 'NOT_FOUND', `Event ${eventId} not found`)
    }
    const newToken = `act_${crypto.randomBytes(16).toString('hex')}`
    const now = Date.now()
    this.db.prepare('UPDATE events SET activation_token = ?, updated_at = ? WHERE event_id = ?').run(
      newToken,
      now,
      event.eventId
    )
    return newToken
  }

  recordDeviceActivation(deviceId: string, eventId: string, activationToken?: string): void {
    const now = Date.now()
    const activationId = `dact_${crypto.randomUUID()}`
    this.db.prepare(`
      INSERT INTO device_event_activations (id, device_id, event_id, activation_token, activated_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(activationId, deviceId, eventId, activationToken || null, now, now)

    try {
      this.db.prepare('UPDATE devices SET active_event_id = ?, last_seen = ? WHERE device_id = ?').run(eventId, now, deviceId)
    } catch {
      // Best effort update
    }
  }

  getActiveDeviceCount(eventId: string): number {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(DISTINCT device_id) as count FROM device_event_activations WHERE event_id = ?
      `).get(eventId) as { count: number }
      return row?.count || 0
    } catch {
      return 0
    }
  }

  getEvent(eventId: string): EventRecord | null {
    if (!eventId) return null
    const trimmed = eventId.trim()
    const row = this.db.prepare('SELECT * FROM events WHERE event_id = ? OR LOWER(event_id) = LOWER(?)').get(trimmed, trimmed)
    if (!row) return null
    return this.mapRow(row)
  }

  listEvents(): EventRecord[] {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY created_at DESC').all()
    return rows.map((r) => this.mapRow(r))
  }

  listEventsBySchool(schoolId?: string): EventRecord[] {
    if (schoolId) {
      const rows = this.db.prepare(
        'SELECT * FROM events WHERE school_id = ? OR school_id IS NULL ORDER BY created_at DESC'
      ).all(schoolId)
      return rows.map((r) => this.mapRow(r))
    }
    return this.listEvents()
  }
}

