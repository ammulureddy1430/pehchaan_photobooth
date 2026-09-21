import type Database from 'better-sqlite3'
import crypto from 'node:crypto'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db: Database.Database) => {
      db.exec(`
        -- Schema migrations table
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );

        -- Devices table
        CREATE TABLE IF NOT EXISTS devices (
          device_id TEXT PRIMARY KEY,
          device_name TEXT NOT NULL,
          platform TEXT NOT NULL,
          app_version TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          registered_at INTEGER NOT NULL,
          last_seen INTEGER NOT NULL,
          last_heartbeat INTEGER,
          revoked_at INTEGER,
          metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

        -- Events table
        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'live',
          event_pack_id TEXT,
          event_pack_version TEXT,
          event_pack_snapshot_json TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
        CREATE INDEX IF NOT EXISTS idx_events_pack_id ON events(event_pack_id);

        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE RESTRICT,
          device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE RESTRICT,
          shot_count INTEGER NOT NULL DEFAULT 3,
          language TEXT NOT NULL DEFAULT 'en',
          status TEXT NOT NULL DEFAULT 'completed',
          event_pack_version TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_event_id ON sessions(event_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

        -- Assets table
        CREATE TABLE IF NOT EXISTS assets (
          asset_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE RESTRICT,
          asset_role TEXT NOT NULL,
          shot_number INTEGER,
          filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          storage_key TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(session_id, filename),
          UNIQUE(session_id, asset_role, shot_number)
        );

        CREATE INDEX IF NOT EXISTS idx_assets_session_id ON assets(session_id);
        CREATE INDEX IF NOT EXISTS idx_assets_role ON assets(session_id, asset_role);
      `)
    },
  },
  {
    version: 2,
    name: '002_payments_schema',
    up: (db: Database.Database) => {
      db.exec(`
        -- Payments table
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE RESTRICT,
          device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE RESTRICT,
          payment_reference TEXT NOT NULL UNIQUE,
          amount REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'INR',
          mode TEXT NOT NULL DEFAULT 'individual',
          status TEXT NOT NULL DEFAULT 'pending',
          provider TEXT NOT NULL DEFAULT 'mock_upi',
          upi_id TEXT,
          merchant_name TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          verified_at INTEGER,
          error_message TEXT,
          metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_payments_event_id ON payments(event_id);
        CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);
        CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(payment_reference);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      `)
    },
  },
  {
    version: 3,
    name: '003_production_payments',
    up: (db: Database.Database) => {
      const tableInfo = db.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>
      const colNames = new Set(tableInfo.map((c) => c.name))

      if (!colNames.has('gateway_provider')) {
        db.exec("ALTER TABLE payments ADD COLUMN gateway_provider TEXT;")
      }
      if (!colNames.has('gateway_order_id')) {
        db.exec("ALTER TABLE payments ADD COLUMN gateway_order_id TEXT;")
      }
      if (!colNames.has('gateway_payment_id')) {
        db.exec("ALTER TABLE payments ADD COLUMN gateway_payment_id TEXT;")
      }
      if (!colNames.has('webhook_event_id')) {
        db.exec("ALTER TABLE payments ADD COLUMN webhook_event_id TEXT;")
      }
      if (!colNames.has('webhook_received_at')) {
        db.exec("ALTER TABLE payments ADD COLUMN webhook_received_at INTEGER;")
      }
      if (!colNames.has('expires_at')) {
        db.exec("ALTER TABLE payments ADD COLUMN expires_at INTEGER;")
      }
      if (!colNames.has('failure_reason')) {
        db.exec("ALTER TABLE payments ADD COLUMN failure_reason TEXT;")
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_payments_gateway_order_id ON payments(gateway_order_id);
        CREATE INDEX IF NOT EXISTS idx_payments_gateway_payment_id ON payments(gateway_payment_id);
        CREATE INDEX IF NOT EXISTS idx_payments_webhook_event_id ON payments(webhook_event_id);
        CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
      `)
    },
  },
  {
    version: 4,
    name: '004_admin_and_school_profile',
    up: (db: Database.Database) => {
      db.exec(`
        -- Admin users table
        CREATE TABLE IF NOT EXISTS admin_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

        -- School profile table
        CREATE TABLE IF NOT EXISTS school_profiles (
          id TEXT PRIMARY KEY,
          school_name TEXT NOT NULL,
          contact_person TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          address TEXT NOT NULL,
          logo_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)

      // Seed default admin if no admin exists
      const existingAdmin = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number }
      if (!existingAdmin || existingAdmin.count === 0) {
        const now = Date.now()
        const salt = 'c0a80101b2c3d4e5f60718293a4b5c6d'
        const passwordHash = crypto.pbkdf2Sync('AdminPassword123!', salt, 100000, 64, 'sha512').toString('hex')
        
        db.prepare(`
          INSERT INTO admin_users (id, email, password_hash, salt, name, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'admin_seed_01',
          'admin@pehchaan.me',
          passwordHash,
          salt,
          'Pehchaan Administrator',
          'admin',
          now,
          now
        )
      }

      // Seed default school profile if none exists
      const existingProfile = db.prepare('SELECT COUNT(*) as count FROM school_profiles').get() as { count: number }
      if (!existingProfile || existingProfile.count === 0) {
        const now = Date.now()
        db.prepare(`
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
      }
    },
  },
  {
    version: 5,
    name: '005_event_registration_schema',
    up: (db: Database.Database) => {
      const tableInfo = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>
      const colNames = new Set(tableInfo.map((c) => c.name))

      if (!colNames.has('school_id')) {
        db.exec("ALTER TABLE events ADD COLUMN school_id TEXT REFERENCES school_profiles(id);")
      }
      if (!colNames.has('description')) {
        db.exec("ALTER TABLE events ADD COLUMN description TEXT;")
      }
      if (!colNames.has('event_date')) {
        db.exec("ALTER TABLE events ADD COLUMN event_date TEXT;")
      }
      if (!colNames.has('start_time')) {
        db.exec("ALTER TABLE events ADD COLUMN start_time TEXT;")
      }
      if (!colNames.has('end_time')) {
        db.exec("ALTER TABLE events ADD COLUMN end_time TEXT;")
      }
      if (!colNames.has('venue')) {
        db.exec("ALTER TABLE events ADD COLUMN venue TEXT;")
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_events_school_id ON events(school_id);
        CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
      `)
    },
  },
  {
    version: 6,
    name: '006_event_configurations',
    up: (db: Database.Database) => {
      const adminInfo = db.prepare("PRAGMA table_info(admin_users)").all() as Array<{ name: string }>
      const adminCols = new Set(adminInfo.map((c) => c.name))
      if (!adminCols.has('school_id')) {
        db.exec("ALTER TABLE admin_users ADD COLUMN school_id TEXT REFERENCES school_profiles(id);")
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS event_configurations (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id) ON DELETE CASCADE,
          school_id TEXT REFERENCES school_profiles(id),
          branding_json TEXT,
          photo_settings_json TEXT,
          template_id TEXT NOT NULL DEFAULT 'classic-strip',
          template_customization_json TEXT,
          delivery_json TEXT,
          payment_json TEXT,
          privacy_json TEXT,
          event_pack_json TEXT,
          status TEXT NOT NULL DEFAULT 'incomplete',
          version INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_event_configurations_event_id ON event_configurations(event_id);
        CREATE INDEX IF NOT EXISTS idx_event_configurations_school_id ON event_configurations(school_id);
      `)
    },
  },
  {
    version: 7,
    name: '007_event_activation_schema',
    up: (db: Database.Database) => {
      const eventCols = new Set(
        (db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>).map((c) => c.name)
      )
      if (!eventCols.has('activation_token')) {
        db.exec("ALTER TABLE events ADD COLUMN activation_token TEXT;")
      }

      const deviceCols = new Set(
        (db.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>).map((c) => c.name)
      )
      if (!deviceCols.has('active_event_id')) {
        db.exec("ALTER TABLE devices ADD COLUMN active_event_id TEXT REFERENCES events(event_id);")
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS device_event_activations (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          activation_token TEXT,
          activated_at INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_activations_device_id ON device_event_activations(device_id);
        CREATE INDEX IF NOT EXISTS idx_activations_event_id ON device_event_activations(event_id);
      `)
    },
  },
  {
    version: 8,
    name: '008_event_dashboard_schema',
    up: (db: Database.Database) => {
      db.exec(`
        -- Deliveries tracking table
        CREATE TABLE IF NOT EXISTS deliveries (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
          session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
          device_id TEXT,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          recipient_masked TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_deliveries_event_id ON deliveries(event_id);
        CREATE INDEX IF NOT EXISTS idx_deliveries_session_id ON deliveries(session_id);
        CREATE INDEX IF NOT EXISTS idx_deliveries_channel ON deliveries(channel);
        CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
        CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at);

        -- Event activities / audit log table
        CREATE TABLE IF NOT EXISTS event_activities (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
          school_id TEXT,
          device_id TEXT,
          session_id TEXT,
          activity_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_activities_event_id ON event_activities(event_id);
        CREATE INDEX IF NOT EXISTS idx_activities_created_at ON event_activities(created_at);
        CREATE INDEX IF NOT EXISTS idx_activities_type ON event_activities(activity_type);
      `)
    },
  },
  {
    version: 9,
    name: '009_clean_readable_event_ids',
    up: (db: Database.Database) => {
      // Find all events with legacy long UUID-style IDs
      const events = db.prepare("SELECT event_id FROM events WHERE event_id LIKE 'evt_%' OR length(event_id) > 12").all() as Array<{ event_id: string }>
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

      for (const ev of events) {
        const oldId = ev.event_id
        let code = ''
        const bytes = crypto.randomBytes(6)
        for (let i = 0; i < 6; i++) {
          code += chars[bytes[i] % chars.length]
        }
        const newId = `PEH-${code}`

        // 1. Copy event row with newId
        db.prepare(`
          INSERT OR IGNORE INTO events (
            event_id, school_id, name, description, event_date, start_time, end_time, venue,
            status, event_pack_id, event_pack_version, event_pack_snapshot_json, activation_token, metadata_json, created_at, updated_at
          )
          SELECT ?, school_id, name, description, event_date, start_time, end_time, venue,
                 status, event_pack_id, event_pack_version, event_pack_snapshot_json, activation_token, metadata_json, created_at, updated_at
          FROM events WHERE event_id = ?
        `).run(newId, oldId)

        // 2. Remap child records to newId
        db.prepare('UPDATE OR IGNORE event_configurations SET event_id = ? WHERE event_id = ?').run(newId, oldId)
        db.prepare('UPDATE OR IGNORE sessions SET event_id = ? WHERE event_id = ?').run(newId, oldId)
        db.prepare('UPDATE OR IGNORE deliveries SET event_id = ? WHERE event_id = ?').run(newId, oldId)
        db.prepare('UPDATE OR IGNORE payments SET event_id = ? WHERE event_id = ?').run(newId, oldId)
        db.prepare('UPDATE OR IGNORE device_event_activations SET event_id = ? WHERE event_id = ?').run(newId, oldId)
        db.prepare('UPDATE OR IGNORE event_activities SET event_id = ? WHERE event_id = ?').run(newId, oldId)

        // 3. Delete old event row
        db.prepare('DELETE FROM events WHERE event_id = ?').run(oldId)
      }
    },
  },
  {
    version: 10,
    name: '010_staff_pin_configuration',
    up: (db: Database.Database) => {
      const configCols = new Set(
        (db.prepare("PRAGMA table_info(event_configurations)").all() as Array<{ name: string }>).map((c) => c.name)
      )
      if (!configCols.has('staff_pin')) {
        db.exec("ALTER TABLE event_configurations ADD COLUMN staff_pin TEXT DEFAULT '482917';")
      }

      const schoolCols = new Set(
        (db.prepare("PRAGMA table_info(school_profiles)").all() as Array<{ name: string }>).map((c) => c.name)
      )
      if (!schoolCols.has('staff_pin')) {
        db.exec("ALTER TABLE school_profiles ADD COLUMN staff_pin TEXT DEFAULT '482917';")
      }
    },
  },
  {
    version: 11,
    name: '011_inquiries_schema',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inquiries (
          id TEXT PRIMARY KEY,
          organisation TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          whatsapp_number TEXT NOT NULL,
          email TEXT,
          city TEXT NOT NULL,
          event_date_text TEXT,
          audience_band TEXT NOT NULL,
          setting TEXT NOT NULL,
          requirements TEXT,
          custom_wishes TEXT,
          status TEXT NOT NULL DEFAULT 'new',
          notes TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
        CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
        CREATE INDEX IF NOT EXISTS idx_inquiries_city ON inquiries(city);
      `)
    },
  },
]

export function runMigrations(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')

  // Create schema_migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  const getApplied = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
  const appliedRows = getApplied.all() as Array<{ version: number }>
  const appliedVersions = new Set(appliedRows.map((r) => r.version))

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      const applyTx = db.transaction(() => {
        migration.up(db)
        const insertMigration = db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        )
        insertMigration.run(migration.version, migration.name, Date.now())
      })
      applyTx()
    }
  }
}
