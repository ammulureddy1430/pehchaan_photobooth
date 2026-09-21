import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { AdminRecord, SafeAdminRecord } from '../types.js'
import { AppError } from '../../errors/AppError.js'

export interface CreateAdminParams {
  id?: string
  email: string
  password: string
  name: string
  role?: 'admin' | 'superadmin'
}

export class AdminRepository {
  constructor(private db: Database.Database) {}

  public static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt || crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex')
    return { hash, salt: s }
  }

  public static verifyPassword(password: string, hash: string, salt: string): boolean {
    const computed = AdminRepository.hashPassword(password, salt).hash
    const computedBuf = Buffer.from(computed, 'hex')
    const hashBuf = Buffer.from(hash, 'hex')
    if (computedBuf.length !== hashBuf.length) return false
    return crypto.timingSafeEqual(computedBuf, hashBuf)
  }

  private mapRow(row: any): AdminRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      salt: row.salt,
      name: row.name,
      role: row.role,
      schoolId: row.school_id ?? null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  public toSafe(admin: AdminRecord): SafeAdminRecord {
    const { passwordHash, salt, ...safe } = admin
    return safe
  }

  public getAdminByEmail(email: string): AdminRecord | null {
    if (!email) return null
    const row = this.db.prepare('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?)').get(email.trim())
    if (!row) return null
    return this.mapRow(row)
  }

  public getAdminById(id: string): AdminRecord | null {
    if (!id) return null
    const row = this.db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id)
    if (!row) return null
    return this.mapRow(row)
  }

  public createAdminUser(params: CreateAdminParams): AdminRecord {
    const { email, password, name, role = 'admin' } = params

    if (!email || !email.includes('@')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Valid email is required')
    }
    if (!password || password.length < 6) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 6 characters')
    }
    if (!name || name.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Admin name is required')
    }

    const existing = this.getAdminByEmail(email)
    if (existing) {
      throw new AppError(409, 'DUPLICATE_ADMIN', `Admin with email ${email} already exists`)
    }

    const id = params.id || `adm_${crypto.randomUUID()}`
    const { hash, salt } = AdminRepository.hashPassword(password)
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, salt, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email.trim().toLowerCase(), hash, salt, name.trim(), role, now, now)

    return this.getAdminById(id)!
  }

  public listAdmins(): SafeAdminRecord[] {
    const rows = this.db.prepare('SELECT * FROM admin_users ORDER BY created_at ASC').all()
    return rows.map((r) => this.toSafe(this.mapRow(r)))
  }
}
