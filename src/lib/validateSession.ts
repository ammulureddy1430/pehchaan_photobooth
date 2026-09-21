import { validateEventPack } from '../eventPack/validatePack'
import { supportsShotMode } from '../eventPack/compositionFromPack'
import type { EventPack } from '../eventPack/types'
import type { BoothSession } from '../types'

export function validateSession(raw: unknown, legacyPack?: EventPack): BoothSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !s.id || s.id.length > 200 ||
      (s.mode !== 1 && s.mode !== 3) || !Number.isInteger(s.currentShotIndex) ||
      typeof s.currentShotIndex !== 'number' || s.currentShotIndex < 0 || s.currentShotIndex >= s.mode ||
      !Array.isArray(s.photoIds) || s.photoIds.length !== s.mode ||
      !s.photoIds.every(id => id === null || (typeof id === 'string' && id.length > 0 && id.length <= 200)) ||
      !['consent', 'capture', 'review', 'final-review', 'payment', 'delivery'].includes(String(s.step)) || typeof s.retaking !== 'boolean' ||
      (s.kind !== undefined && s.kind !== 'guest' && s.kind !== 'test')) return null
  const ids = s.photoIds.filter(id => id !== null)
  if (new Set(ids).size !== ids.length) return null
  const index = s.currentShotIndex
  if (s.step === 'consent') {
    if (index !== 0 || ids.length > 0) return null
  } else {
    if (s.photoIds.slice(0, index).some(id => id === null)) return null
    if (s.photoIds.slice(index + 1).some(id => id !== null)) return null
    if (s.step !== 'capture' && (!s.photoIds[index] || s.retaking)) return null
    if (s.step === 'capture' && Boolean(s.photoIds[index]) !== s.retaking) return null
    if ((s.step === 'final-review' || s.step === 'payment' || s.step === 'delivery') && index !== s.mode - 1) return null
    if (s.step === 'review' && index === s.mode - 1) return null
  }
  const pack = validateEventPack(s.packSnapshot === undefined ? legacyPack : s.packSnapshot)
  if (!pack.ok || !supportsShotMode(pack.pack, s.mode)) return null
  if (s.revision !== undefined && (typeof s.revision !== 'string' || !s.revision || s.revision.length > 200)) return null
  return {
    id: s.id, mode: s.mode, currentShotIndex: index,
    photoIds: s.photoIds as Array<string | null>, step: s.step as BoothSession['step'],
    retaking: s.retaking, kind: s.kind === 'test' ? 'test' : 'guest',
    packSnapshot: pack.pack, revision: typeof s.revision === 'string' ? s.revision : 'legacy',
    consentAcceptedAt: typeof s.consentAcceptedAt === 'number' ? s.consentAcceptedAt : null,
    consentVersion: typeof s.consentVersion === 'string' ? s.consentVersion : null,
    shareOptIn: typeof s.shareOptIn === 'boolean' ? s.shareOptIn : false,
    paymentRequired: typeof s.paymentRequired === 'boolean' ? s.paymentRequired : false,
    paymentMode: typeof s.paymentMode === 'string' ? (s.paymentMode as any) : 'organizer',
    paymentStatus: typeof s.paymentStatus === 'string' ? (s.paymentStatus as any) : 'not_required',
    paymentReference: typeof s.paymentReference === 'string' ? s.paymentReference : null,
    paymentAmount: typeof s.paymentAmount === 'number' ? s.paymentAmount : null,
  }
}
