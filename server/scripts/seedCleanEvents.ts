import { getDefaultDatabase } from '../db/database.js'
import { EventRepository } from '../db/repositories/eventRepository.js'
import { EventConfigurationRepository } from '../db/repositories/eventConfigurationRepository.js'
import { SchoolRepository } from '../db/repositories/schoolRepository.js'

export function seedCleanEvents() {
  const db = getDefaultDatabase()
  const eventRepo = new EventRepository(db)
  const configRepo = new EventConfigurationRepository(db)
  const schoolRepo = new SchoolRepository(db)

  const profile = schoolRepo.getProfile() || {
    schoolName: 'Pehchaan Model Academy',
    contactPerson: 'Dr. Rajesh Verma',
    email: 'admin@pehchaan.me',
    phone: '+91 98765 43210',
    address: 'Plot 42, Jubilee Hills, Hyderabad, Telangana 500033',
    logoUrl: null,
    staffPin: '482917',
  }

  // Clear existing events and associated records cleanly
  db.exec(`
    DELETE FROM payments;
    DELETE FROM deliveries;
    DELETE FROM assets;
    DELETE FROM sessions;
    DELETE FROM device_event_activations;
    DELETE FROM event_activities;
    DELETE FROM event_configurations;
    DELETE FROM events;
  `)

  // 1. Live Cultural Event with rich stats
  const { event: event1 } = eventRepo.createEvent({
    name: 'Annual Cultural Day 2026',
    schoolId: 'sch_default',
    eventDate: '2026-09-20',
    startTime: '10:00',
    endTime: '18:00',
    venue: 'School Main Auditorium',
    description: 'Annual inter-house music, dance, and cultural festival photobooth experience.',
  })
  eventRepo.updateEvent(event1.eventId, { status: 'live' })

  configRepo.saveConfiguration(event1, {
    branding: {
      schoolName: 'Pehchaan Model Academy',
      eventTitle: 'Annual Cultural Day 2026',
      eventSubtitle: 'Main Auditorium • Celebration Strip',
      accentColor: '#c6a15b',
    },
    photoSettings: {
      shotCount: 3,
      orientation: 'portrait_strip',
      mirrorOutput: true,
      blackAndWhiteEnabled: true,
      sepiaEnabled: true,
    },
    template: {
      templateId: 'classic-strip',
      background: '#0b0a09',
      overlayEnabled: true,
      customTitle: 'CULTURAL DAY 2026',
      customSubtitle: 'Pehchaan Model Academy',
    },
    delivery: {
      printEnabled: true,
      cloudQrEnabled: true,
      whatsappEnabled: false,
      emailEnabled: false,
    },
    payment: {
      mode: 'individual',
      amount: 99,
      currency: 'INR',
      upiId: 'pehchaan@okhdfcbank',
      merchantName: 'Pehchaan Model Academy',
      timeoutSeconds: 300,
    },
    privacy: {
      schoolMode: true,
      consentMode: 'notice',
      privacyNoticeText: 'Privacy Notice: Photos taken during this session are saved privately and never published without consent.',
      retentionHours: 72,
      publicGalleryEnabled: false,
    },
    staffPin: '482917',
  }, profile)

  // 2. Draft Sports Gala Event
  const { event: event2 } = eventRepo.createEvent({
    name: 'Inter-School Sports Gala 2026',
    schoolId: 'sch_default',
    eventDate: '2026-11-15',
    startTime: '08:30',
    endTime: '16:30',
    venue: 'Olympic Sports Complex Arena A',
    description: 'Regional inter-school athletic championships with sports finisher portrait strips.',
  })
  // Leaves as draft

  configRepo.saveConfiguration(event2, {
    branding: {
      schoolName: 'Pehchaan Model Academy',
      eventTitle: 'Inter-School Sports Gala 2026',
      eventSubtitle: 'Arena A • Sports Finisher Badge',
      accentColor: '#3b82f6',
    },
    photoSettings: {
      shotCount: 2,
      orientation: 'duo_grid',
      mirrorOutput: true,
      blackAndWhiteEnabled: true,
      sepiaEnabled: false,
    },
    template: {
      templateId: 'minimal-duo',
      background: '#0a101d',
      overlayEnabled: false,
      customTitle: 'SPORTS GALA 2026',
      customSubtitle: 'Champion Series',
    },
    delivery: {
      printEnabled: true,
      cloudQrEnabled: true,
      whatsappEnabled: false,
      emailEnabled: false,
    },
    payment: {
      mode: 'organizer',
      amount: 0,
      currency: 'INR',
      merchantName: 'Pehchaan Model Academy',
      timeoutSeconds: 300,
    },
    privacy: {
      schoolMode: true,
      consentMode: 'notice',
      privacyNoticeText: 'Privacy Notice: Sports gala souvenir photos are stored securely.',
      retentionHours: 72,
      publicGalleryEnabled: false,
    },
    staffPin: '482917',
  }, profile)

  // 3. Live Graduation Ceremony Gala
  const { event: event3 } = eventRepo.createEvent({
    name: 'Graduation Ceremony & Farewell Gala',
    schoolId: 'sch_default',
    eventDate: '2026-10-10',
    startTime: '17:00',
    endTime: '22:00',
    venue: 'Grand Heritage Lawn & Banquet',
    description: 'Graduation convocation and farewell gala banquet portrait photobooth.',
  })
  eventRepo.updateEvent(event3.eventId, { status: 'live' })

  configRepo.saveConfiguration(event3, {
    branding: {
      schoolName: 'Pehchaan Model Academy',
      eventTitle: 'Graduation & Farewell Gala 2026',
      eventSubtitle: 'Grand Heritage Banquet • Class of 2026',
      accentColor: '#c6a15b',
    },
    photoSettings: {
      shotCount: 1,
      orientation: 'single_hero',
      mirrorOutput: true,
      blackAndWhiteEnabled: false,
      sepiaEnabled: false,
    },
    template: {
      templateId: 'single-portrait',
      background: '#0d0d12',
      overlayEnabled: true,
      customTitle: 'CLASS OF 2026 GRADUATION',
      customSubtitle: 'Pehchaan Model Academy',
    },
    delivery: {
      printEnabled: true,
      cloudQrEnabled: true,
      whatsappEnabled: false,
      emailEnabled: false,
    },
    payment: {
      mode: 'organizer',
      amount: 0,
      currency: 'INR',
      merchantName: 'Pehchaan Model Academy',
      timeoutSeconds: 300,
    },
    privacy: {
      schoolMode: true,
      consentMode: 'notice',
      privacyNoticeText: 'Privacy Notice: Graduation keepsake portraits are saved in the private institutional registry.',
      retentionHours: 72,
      publicGalleryEnabled: false,
    },
    staffPin: '482917',
  }, profile)

  // Ensure default devices exist for metrics
  const now = Date.now()
  db.prepare(`
    INSERT OR IGNORE INTO devices (device_id, device_name, platform, app_version, status, registered_at, last_seen, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('kiosk_ipad_01', 'iPad Pro 12.9" (Main Lobby)', 'iPadOS 17.5', '0.1.0', 'active', now - 86400000, now, now)

  db.prepare(`
    INSERT OR IGNORE INTO devices (device_id, device_name, platform, app_version, status, registered_at, last_seen, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('kiosk_ipad_02', 'iPad Air 11" (Auditorium Wing)', 'iPadOS 17.5', '0.1.0', 'active', now - 86400000, now, now)

  // Link device activations
  const insertActivation = db.prepare(`
    INSERT OR IGNORE INTO device_event_activations (id, device_id, event_id, activation_token, activated_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertActivation.run('act_dev_01', 'kiosk_ipad_01', event1.eventId, 'act_tok_01', now - 3600000, now)
  insertActivation.run('act_dev_02', 'kiosk_ipad_01', event3.eventId, 'act_tok_02', now - 7200000, now)

  // Seed sample sessions, payments, deliveries, and photo assets
  const insertSession = db.prepare(`
    INSERT INTO sessions (session_id, event_id, device_id, shot_count, language, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, event_id, session_id, device_id, payment_reference, amount, currency, mode, status, provider, upi_id, merchant_name, created_at, updated_at, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertDelivery = db.prepare(`
    INSERT INTO deliveries (id, event_id, session_id, device_id, channel, status, recipient_masked, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertAsset = db.prepare(`
    INSERT INTO assets (asset_id, session_id, device_id, asset_role, shot_number, filename, content_type, byte_size, checksum, storage_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Event 1 (Cultural Day - 15 sessions)
  for (let i = 1; i <= 15; i++) {
    const sId = `ses_cult_${String(i).padStart(3, '0')}`
    const sTime = now - (15 - i) * 600000
    insertSession.run(sId, event1.eventId, 'kiosk_ipad_01', 3, 'en', 'completed', sTime, sTime)
    insertPayment.run(
      `pay_cult_${String(i).padStart(3, '0')}`,
      event1.eventId,
      sId,
      'kiosk_ipad_01',
      `PAY-UPI-CULT-${String(i).padStart(4, '0')}`,
      99,
      'INR',
      'individual',
      'successful',
      'mock_upi',
      'pehchaan@okhdfcbank',
      'Pehchaan Model Academy',
      sTime,
      sTime + 15000,
      sTime + 15000
    )
    insertDelivery.run(
      `del_cult_pr_${String(i).padStart(3, '0')}`,
      event1.eventId,
      sId,
      'kiosk_ipad_01',
      'print',
      'success',
      null,
      null,
      sTime + 20000,
      sTime + 20000
    )
    insertDelivery.run(
      `del_cult_qr_${String(i).padStart(3, '0')}`,
      event1.eventId,
      sId,
      'kiosk_ipad_01',
      'qr',
      'success',
      null,
      null,
      sTime + 22000,
      sTime + 22000
    )
    insertAsset.run(
      `ast_cult_comp_${String(i).padStart(3, '0')}`,
      sId,
      'kiosk_ipad_01',
      'composition',
      null,
      'composition.jpg',
      'image/jpeg',
      482000,
      `sha_cult_${i}_comp`,
      `uploads/${sId}/composition.jpg`,
      sTime + 10000
    )
  }

  // Event 3 (Graduation Gala - 8 sessions)
  for (let i = 1; i <= 8; i++) {
    const sId = `ses_grad_${String(i).padStart(3, '0')}`
    const sTime = now - (8 - i) * 900000
    insertSession.run(sId, event3.eventId, 'kiosk_ipad_01', 1, 'en', 'completed', sTime, sTime)
    insertPayment.run(
      `pay_grad_${String(i).padStart(3, '0')}`,
      event3.eventId,
      sId,
      'kiosk_ipad_01',
      `PAY-FREE-GRAD-${String(i).padStart(4, '0')}`,
      0,
      'INR',
      'organizer',
      'successful',
      'mock_upi',
      null,
      'Pehchaan Model Academy',
      sTime,
      sTime,
      sTime
    )
    insertDelivery.run(
      `del_grad_pr_${String(i).padStart(3, '0')}`,
      event3.eventId,
      sId,
      'kiosk_ipad_01',
      'print',
      'success',
      null,
      null,
      sTime + 18000,
      sTime + 18000
    )
    insertDelivery.run(
      `del_grad_qr_${String(i).padStart(3, '0')}`,
      event3.eventId,
      sId,
      'kiosk_ipad_01',
      'qr',
      'success',
      null,
      null,
      sTime + 20000,
      sTime + 20000
    )
    insertAsset.run(
      `ast_grad_comp_${String(i).padStart(3, '0')}`,
      sId,
      'kiosk_ipad_01',
      'composition',
      null,
      'composition.jpg',
      'image/jpeg',
      512000,
      `sha_grad_${i}_comp`,
      `uploads/${sId}/composition.jpg`,
      sTime + 10000
    )
  }

  console.log('✓ Successfully cleaned up and seeded 3 distinct demo events:')
  console.log(`  1. [${event1.eventId}] Annual Cultural Day 2026 (Live • 15 Sessions • ₹1,485 UPI)`)
  console.log(`  2. [${event2.eventId}] Inter-School Sports Gala 2026 (Draft • 0 Sessions)`)
  console.log(`  3. [${event3.eventId}] Graduation Ceremony & Farewell Gala (Live • 8 Sessions • Free)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedCleanEvents()
}
