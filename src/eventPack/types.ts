import type { PhotoEffect, ShotMode } from '../types'

export type EventStatus = 'live' | 'paused' | 'ended'
export type PackLanguage = 'en' | 'hi'
export type PackFeatureFlag =
  | 'whatsappEnabled'
  | 'emailEnabled'
  | 'cloudQrEnabled'
  | 'printEnabled'

export type PackSlot = {
  id: string
  shotNumber: number
  x: number
  y: number
  width: number
  height: number
  fit: 'cover' | 'contain'
  effect?: PhotoEffect
}

export type PackText = {
  id: string
  text: string
  x: number
  y: number
  font: string
  color: string
  align: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

export type PackComposition = {
  id: string
  name: string
  width: number
  height: number
  background: string
  overlayEnabled: boolean
  slots: PackSlot[]
  texts: PackText[]
}

export type ConsentMode = 'none' | 'notice' | 'explicit' | 'explicitShare'

export type PaymentMode = 'organizer' | 'individual' | 'disabled'

export interface EventPackPaymentConfig {
  enabled?: boolean
  mode?: PaymentMode
  upiId?: string
  merchantName?: string
  amount?: number
  currency?: string
  timeoutSeconds?: number
}

export type EventPack = {
  id: string
  version: string
  eventName: string
  language: PackLanguage
  shotCount: ShotMode
  betweenShotPauseMs: number
  mirrorOutput: boolean
  blackAndWhiteEnabled: boolean
  sepiaEnabled: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  cloudQrEnabled: boolean
  printEnabled: boolean
  schoolMode?: boolean
  consentMode?: ConsentMode
  consentTextEn?: string
  consentTextHi?: string
  privacyNoticeText?: string
  retentionHours?: number
  publicGalleryEnabled?: boolean
  payment?: EventPackPaymentConfig
  schoolName?: string
  schoolLogoUrl?: string | null
  accentColor?: string
  primaryColor?: string
  secondaryColor?: string
  backgroundColor?: string
  eventSubtitle?: string
  countdownSeconds?: number
  staffPin?: string
  composition: PackComposition
  singleShotComposition?: PackComposition
}

export type PackValidationResult =
  | { ok: true; pack: EventPack }
  | { ok: false; errors: string[] }

