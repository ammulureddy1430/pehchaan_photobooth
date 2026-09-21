import type { BoothSession, PhotoRecord } from '../types'
import type { OutboxItem, CompletedSessionRecord } from './types'
import { getOrCreateLocalDeviceId } from '../api/deviceIdentity'
import { compositionDerivedId, putOutboxItems, saveCompletedSession } from '../lib/photoStore'

export function createOutboxItemsForSession(
  session: BoothSession,
  photos: PhotoRecord[],
  hasComposition: boolean = true
): OutboxItem[] {
  const deviceId = getOrCreateLocalDeviceId()
  const rawId = session.packSnapshot.id || 'default'
  const eventId = rawId.startsWith('pack_')
    ? rawId.replace(/^pack_/, '')
    : (rawId.startsWith('evt_') ? rawId.replace(/^evt_/, '') : rawId)
  const now = Date.now()

  const items: OutboxItem[] = []

  // 1. SESSION_CREATE item (Unique and stable ID)
  const sessionItem: OutboxItem = {
    id: `outbox_sess_${session.id}`,
    op: 'SESSION_CREATE',
    status: 'PENDING',
    sessionId: session.id,
    eventId,
    deviceId,
    retryCount: 0,
    nextRetryAt: now,
    createdAt: now,
    updatedAt: now,
    sessionPayload: {
      shotCount: session.mode,
      language: session.packSnapshot.language,
      status: 'completed',
      eventPackVersion: session.packSnapshot.version,
      metadata: {
        kind: session.kind,
        packId: session.packSnapshot.id,
        eventName: session.packSnapshot.eventName,
        completedAt: now,
      },
    },
  }
  items.push(sessionItem)

  // 2. Original Photo assets
  for (const photo of photos) {
    if (!photo) continue
    const origItem: OutboxItem = {
      id: `outbox_ast_${photo.id}_orig`,
      op: 'ASSET_UPLOAD',
      status: 'PENDING',
      sessionId: session.id,
      eventId,
      deviceId,
      assetId: `ast_${photo.id}_orig`,
      assetRole: 'original',
      shotNumber: photo.shotNumber,
      filename: photo.originalName || `original_${photo.shotNumber}.jpg`,
      contentType: 'image/jpeg',
      localPhotoId: photo.id,
      retryCount: 0,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now,
    }
    items.push(origItem)

    // Thumbnail asset
    if (photo.thumbnail) {
      const thumbItem: OutboxItem = {
        id: `outbox_ast_${photo.id}_thumb`,
        op: 'ASSET_UPLOAD',
        status: 'PENDING',
        sessionId: session.id,
        eventId,
        deviceId,
        assetId: `ast_${photo.id}_thumb`,
        assetRole: 'thumbnail',
        shotNumber: photo.shotNumber,
        filename: photo.thumbnailName || `thumb_${photo.shotNumber}.jpg`,
        contentType: 'image/jpeg',
        localPhotoId: photo.id,
        retryCount: 0,
        nextRetryAt: now,
        createdAt: now,
        updatedAt: now,
      }
      items.push(thumbItem)
    }
  }

  // 3. Composed Strip asset
  if (hasComposition) {
    const composedItem: OutboxItem = {
      id: `outbox_ast_${session.id}_comp`,
      op: 'ASSET_UPLOAD',
      status: 'PENDING',
      sessionId: session.id,
      eventId,
      deviceId,
      assetId: `ast_${session.id}_comp`,
      assetRole: 'composed',
      shotNumber: null,
      filename: 'composed.jpg',
      contentType: 'image/jpeg',
      localDerivedId: compositionDerivedId(session.id),
      retryCount: 0,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now,
    }
    items.push(composedItem)
  }

  return items
}

export async function enqueueSessionForSync(
  session: BoothSession,
  photos: PhotoRecord[],
  hasComposition: boolean = true
): Promise<OutboxItem[]> {
  const completedRecord: CompletedSessionRecord = {
    id: session.id,
    mode: session.mode,
    photoIds: session.photoIds.filter((id): id is string => Boolean(id)),
    kind: session.kind,
    packId: session.packSnapshot.id,
    packVersion: session.packSnapshot.version,
    language: session.packSnapshot.language,
    createdAt: Date.now(),
    syncedAt: null,
    paymentRequired: session.paymentRequired ?? (session.packSnapshot.payment?.mode === 'individual'),
    paymentMode: session.paymentMode ?? session.packSnapshot.payment?.mode ?? 'organizer',
    paymentStatus: session.paymentStatus ?? (session.packSnapshot.payment?.mode === 'individual' ? 'pending' : 'not_required'),
    paymentReference: session.paymentReference ?? null,
    paymentAmount: session.paymentAmount ?? session.packSnapshot.payment?.amount ?? null,
  }

  const items = createOutboxItemsForSession(session, photos, hasComposition)

  try {
    await saveCompletedSession(completedRecord)
    await putOutboxItems(items)
  } catch (error) {
    console.error('[OutboxManager] Failed to persist outbox items to IndexedDB:', error)
  }

  return items
}
