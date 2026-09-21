import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { AppError } from '../../errors/AppError.js'

export type InquiryStatus = 'new' | 'contacted' | 'quoted' | 'confirmed' | 'archived'

export interface InquiryRecord {
  id: string
  organisation: string
  contactName: string
  whatsappNumber: string
  email: string | null
  city: string
  eventDateText: string | null
  audienceBand: string
  setting: string
  requirements: string | null
  customWishes: string | null
  status: InquiryStatus
  notes: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface CreateInquiryParams {
  organisation: string
  contactName: string
  whatsappNumber: string
  email?: string | null
  city: string
  eventDateText?: string | null
  audienceBand: string
  setting: string
  requirements?: string | null
  customWishes?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateInquiryParams {
  status?: InquiryStatus
  notes?: string | null
  organisation?: string
  contactName?: string
  whatsappNumber?: string
  email?: string | null
  city?: string
  eventDateText?: string | null
  audienceBand?: string
  setting?: string
  requirements?: string | null
  customWishes?: string | null
}

export class InquiryRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): InquiryRecord {
    let metadata: Record<string, unknown> | null = null
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json)
      } catch {
        metadata = null
      }
    }

    return {
      id: row.id,
      organisation: row.organisation,
      contactName: row.contact_name,
      whatsappNumber: row.whatsapp_number,
      email: row.email ?? null,
      city: row.city,
      eventDateText: row.event_date_text ?? null,
      audienceBand: row.audience_band,
      setting: row.setting,
      requirements: row.requirements ?? null,
      customWishes: row.custom_wishes ?? null,
      status: row.status as InquiryStatus,
      notes: row.notes ?? null,
      metadata,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  public createInquiry(params: CreateInquiryParams): InquiryRecord {
    const organisation = (params.organisation || '').trim()
    const contactName = (params.contactName || '').trim()
    const whatsappNumber = (params.whatsappNumber || '').trim()
    const email = (params.email || '').trim() || null
    const city = (params.city || '').trim()
    const eventDateText = (params.eventDateText || '').trim() || null
    const audienceBand = (params.audienceBand || '').trim()
    const setting = (params.setting || '').trim()
    const requirements = (params.requirements || '').trim() || null
    const customWishes = (params.customWishes || '').trim() || null

    if (!organisation) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Organisation name is required.')
    }
    if (!contactName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Contact name is required.')
    }
    if (!whatsappNumber) {
      throw new AppError(400, 'VALIDATION_ERROR', 'WhatsApp number is required.')
    }
    if (!city) {
      throw new AppError(400, 'VALIDATION_ERROR', 'City is required.')
    }
    if (!audienceBand) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Expected audience band is required.')
    }
    if (!setting) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Setting is required.')
    }

    const id = `INQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    const now = Date.now()
    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null

    this.db.prepare(`
      INSERT INTO inquiries (
        id, organisation, contact_name, whatsapp_number, email, city,
        event_date_text, audience_band, setting, requirements, custom_wishes,
        status, notes, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', null, ?, ?, ?)
    `).run(
      id,
      organisation,
      contactName,
      whatsappNumber,
      email,
      city,
      eventDateText,
      audienceBand,
      setting,
      requirements,
      customWishes,
      metadataJson,
      now,
      now,
    )

    return this.getInquiry(id)!
  }

  public getInquiry(id: string): InquiryRecord | null {
    const row = this.db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id)
    return row ? this.mapRow(row) : null
  }

  public listInquiries(options: { status?: string; search?: string; limit?: number } = {}): InquiryRecord[] {
    let query = 'SELECT * FROM inquiries WHERE 1=1'
    const params: any[] = []

    if (options.status && options.status !== 'all') {
      query += ' AND status = ?'
      params.push(options.status)
    }

    if (options.search) {
      const term = `%${options.search.trim()}%`
      query += ' AND (organisation LIKE ? OR contact_name LIKE ? OR whatsapp_number LIKE ? OR email LIKE ? OR city LIKE ?)'
      params.push(term, term, term, term, term)
    }

    query += ' ORDER BY created_at DESC'

    if (options.limit && options.limit > 0) {
      query += ` LIMIT ${options.limit}`
    }

    const rows = this.db.prepare(query).all(...params)
    return rows.map((r) => this.mapRow(r))
  }

  public updateInquiry(id: string, params: UpdateInquiryParams): InquiryRecord {
    const existing = this.getInquiry(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Inquiry ${id} not found`)
    }

    const status = params.status !== undefined ? params.status : existing.status
    const notes = params.notes !== undefined ? params.notes : existing.notes
    const organisation = params.organisation !== undefined ? params.organisation.trim() : existing.organisation
    const contactName = params.contactName !== undefined ? params.contactName.trim() : existing.contactName
    const whatsappNumber = params.whatsappNumber !== undefined ? params.whatsappNumber.trim() : existing.whatsappNumber
    const email = params.email !== undefined ? (params.email ? params.email.trim() : null) : existing.email
    const city = params.city !== undefined ? params.city.trim() : existing.city
    const eventDateText = params.eventDateText !== undefined ? (params.eventDateText ? params.eventDateText.trim() : null) : existing.eventDateText
    const audienceBand = params.audienceBand !== undefined ? params.audienceBand.trim() : existing.audienceBand
    const setting = params.setting !== undefined ? params.setting.trim() : existing.setting
    const requirements = params.requirements !== undefined ? (params.requirements ? params.requirements.trim() : null) : existing.requirements
    const customWishes = params.customWishes !== undefined ? (params.customWishes ? params.customWishes.trim() : null) : existing.customWishes
    const now = Date.now()

    this.db.prepare(`
      UPDATE inquiries
      SET organisation = ?, contact_name = ?, whatsapp_number = ?, email = ?,
          city = ?, event_date_text = ?, audience_band = ?, setting = ?,
          requirements = ?, custom_wishes = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      organisation,
      contactName,
      whatsappNumber,
      email,
      city,
      eventDateText,
      audienceBand,
      setting,
      requirements,
      customWishes,
      status,
      notes,
      now,
      id,
    )

    return this.getInquiry(id)!
  }

  public deleteInquiry(id: string): boolean {
    const res = this.db.prepare('DELETE FROM inquiries WHERE id = ?').run(id)
    return res.changes > 0
  }

  public getInquiryStats(): {
    total: number
    new: number
    contacted: number
    quoted: number
    confirmed: number
    archived: number
  } {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM inquiries GROUP BY status
    `).all() as Array<{ status: string; count: number }>

    const stats = {
      total: 0,
      new: 0,
      contacted: 0,
      quoted: 0,
      confirmed: 0,
      archived: 0,
    }

    for (const r of rows) {
      stats.total += r.count
      if (r.status in stats) {
        ;(stats as any)[r.status] = r.count
      }
    }

    return stats
  }
}
