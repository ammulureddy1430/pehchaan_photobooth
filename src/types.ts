import type { EventPack, PaymentMode } from './eventPack/types'

export type FlowStep = 'attract' | 'consent' | 'capture' | 'review' | 'final-review' | 'payment' | 'delivery'
export type ShotMode = 1 | 2 | 3
export type PhotoStatus = 'captured' | 'ready' | 'processing_failed'
export type DerivedKind = 'test-composition'
export type PhotoEffect = 'none' | 'black-and-white' | 'sepia'

export type PaymentStatus =
  | 'not_required'
  | 'pending'
  | 'initiated'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'verification_required'

export const STAGE_WIDTH = 820
export const STAGE_HEIGHT = 1180
export const STAGE_ASPECT = STAGE_WIDTH / STAGE_HEIGHT
export const DEFAULT_SHOT_MODE: ShotMode = 3

export type SessionKind = 'guest' | 'test'

export type BoothSession = {
  id: string
  mode: ShotMode
  currentShotIndex: number
  photoIds: Array<string | null>
  step: Exclude<FlowStep, 'attract'>
  retaking: boolean
  kind: SessionKind
  packSnapshot: EventPack
  revision: string
  consentAcceptedAt?: number | null
  consentVersion?: string | null
  shareOptIn?: boolean | null
  paymentRequired?: boolean
  paymentMode?: PaymentMode
  paymentStatus?: PaymentStatus
  paymentReference?: string | null
  paymentAmount?: number | null
}

export type PhotoRecord = {
  id: string
  sessionId: string
  shotNumber: number
  shotIndex: number
  createdAt: number
  sessionKind: SessionKind
  original: Blob
  thumbnail: Blob | null
  status: PhotoStatus
  originalName: string
  thumbnailName: string
  originalByteSize: number
  thumbnailByteSize: number
  uploadState?: 'uploaded' | 'queued' | 'failed_retryable' | 'local_only'
  deletedAt?: number | null
}

export type DerivedRecord = {
  id: string
  sessionId: string
  kind: DerivedKind
  sessionKind: SessionKind
  revision: string
  blob: Blob
  createdAt: number
  byteSize: number
  uploadState?: 'uploaded' | 'queued' | 'failed_retryable' | 'local_only'
  deletedAt?: number | null
}

export type StorageStats = {
  count: number
  bytes: number
}

export function originalFileName(shotNumber: number): string {
  return `original_${shotNumber}.jpg`
}

export function thumbnailFileName(shotNumber: number): string {
  return `thumb_${shotNumber}.jpg`
}
