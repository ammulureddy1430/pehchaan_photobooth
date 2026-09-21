import type Database from 'better-sqlite3'
import type { SchoolProfileRecord } from '../types.js'
import { AppError } from '../../errors/AppError.js'

export interface UpdateSchoolProfileParams {
  schoolName?: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  logoUrl?: string | null
}

export class SchoolRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): SchoolProfileRecord {
    return {
      id: row.id,
      schoolName: row.school_name,
      contactPerson: row.contact_person,
      email: row.email,
      phone: row.phone,
      address: row.address,
      logoUrl: row.logo_url ?? null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  public getProfile(): SchoolProfileRecord {
    const row = this.db.prepare('SELECT * FROM school_profiles ORDER BY created_at ASC LIMIT 1').get()
    if (!row) {
      // Return a default initial profile
      const now = Date.now()
      this.db.prepare(`
        INSERT INTO school_profiles (id, school_name, contact_person, email, phone, address, logo_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'sch_default',
        'Pehchaan Model School',
        'School Coordinator',
        'admin@pehchaan.me',
        '+91 98765 43210',
        'Plot 42, Jubilee Hills, Hyderabad, Telangana 500033',
        null,
        now,
        now
      )
      const newRow = this.db.prepare('SELECT * FROM school_profiles WHERE id = ?').get('sch_default')
      return this.mapRow(newRow)
    }
    return this.mapRow(row)
  }

  public updateProfile(params: UpdateSchoolProfileParams): SchoolProfileRecord {
    const current = this.getProfile()

    if (params.email !== undefined && (!params.email || !params.email.includes('@'))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Valid email address is required')
    }
    if (params.schoolName !== undefined && (!params.schoolName || params.schoolName.trim().length === 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'School name cannot be empty')
    }

    const schoolName = params.schoolName !== undefined ? params.schoolName.trim() : current.schoolName
    const contactPerson = params.contactPerson !== undefined ? params.contactPerson.trim() : current.contactPerson
    const email = params.email !== undefined ? params.email.trim() : current.email
    const phone = params.phone !== undefined ? params.phone.trim() : current.phone
    const address = params.address !== undefined ? params.address.trim() : current.address
    const logoUrl = params.logoUrl !== undefined ? (params.logoUrl ? params.logoUrl.trim() : null) : current.logoUrl
    const now = Date.now()

    this.db.prepare(`
      UPDATE school_profiles
      SET school_name = ?, contact_person = ?, email = ?, phone = ?, address = ?, logo_url = ?, updated_at = ?
      WHERE id = ?
    `).run(schoolName, contactPerson, email, phone, address, logoUrl, now, current.id)

    return this.getProfile()
  }
}
