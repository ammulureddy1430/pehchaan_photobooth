import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from './migrations.js'

let defaultDbInstance: Database.Database | null = null

export interface DatabaseOptions {
  dbPath?: string
  memory?: boolean
}

export function createDatabase(options: DatabaseOptions = {}): Database.Database {
  let db: Database.Database

  if (options.memory || options.dbPath === ':memory:') {
    db = new Database(':memory:')
  } else {
    const rawPath = options.dbPath || process.env.DATABASE_PATH || './data/pehchaan.db'
    const fullPath = path.resolve(rawPath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    db = new Database(fullPath)
  }

  runMigrations(db)
  return db
}

export function getDefaultDatabase(): Database.Database {
  if (!defaultDbInstance) {
    defaultDbInstance = createDatabase()
  }
  return defaultDbInstance
}

export function closeDefaultDatabase(): void {
  if (defaultDbInstance) {
    defaultDbInstance.close()
    defaultDbInstance = null
  }
}
