import type { PhotoEffect, ShotMode } from '../types'
import { getFallbackPack } from './fallbackPack'
import type {
  EventPack,
  PackComposition,
  PackLanguage,
  PackSlot,
  PackText,
  PackValidationResult,
} from './types'

const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/
const ALIGN_VALUES = new Set(['left', 'right', 'center', 'start', 'end'])
const BASELINE_VALUES = new Set([
  'top',
  'hanging',
  'middle',
  'alphabetic',
  'ideographic',
  'bottom',
])
const FIT_VALUES = new Set(['cover', 'contain'])
const EFFECT_VALUES = new Set<PhotoEffect>(['none', 'black-and-white', 'sepia'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isShotCount(value: unknown): value is ShotMode {
  return value === 1 || value === 2 || value === 3
}

function isLanguage(value: unknown): value is PackLanguage {
  return value === 'en' || value === 'hi'
}

function readString(value: unknown, field: string, errors: string[], min = 1, max = 120): string | null {
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string.`)
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) {
    errors.push(`${field} must be between ${min} and ${max} characters.`)
    return null
  }

  return trimmed
}

function readSlot(raw: unknown, shotCount: ShotMode, errors: string[], index: number): PackSlot | null {
  if (!isRecord(raw)) {
    errors.push(`composition.slots[${index}] must be an object.`)
    return null
  }

  const id = readString(raw.id, `composition.slots[${index}].id`, errors)
  const shotNumber = raw.shotNumber
  if (!isFiniteNumber(shotNumber) || shotNumber < 1 || shotNumber > shotCount || !Number.isInteger(shotNumber)) {
    errors.push(`composition.slots[${index}].shotNumber must be an integer from 1 to ${shotCount}.`)
  }

  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!isFiniteNumber(raw[key])) {
      errors.push(`composition.slots[${index}].${key} must be a number.`)
    }
  }

  if (typeof raw.fit !== 'string' || !FIT_VALUES.has(raw.fit)) {
    errors.push(`composition.slots[${index}].fit must be cover or contain.`)
  }

  if (raw.effect !== undefined && (typeof raw.effect !== 'string' || !EFFECT_VALUES.has(raw.effect as PhotoEffect))) {
    errors.push(`composition.slots[${index}].effect must be none, black-and-white, or sepia.`)
  }

  if (!id || !isFiniteNumber(raw.shotNumber) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.width) || !isFiniteNumber(raw.height) || raw.fit !== 'cover' && raw.fit !== 'contain') {
    return null
  }

  if (raw.width <= 0 || raw.height <= 0) {
    errors.push(`composition.slots[${index}] size must be greater than 0.`)
    return null
  }

  return {
    id,
    shotNumber: raw.shotNumber,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    fit: raw.fit,
    effect: raw.effect === 'black-and-white' || raw.effect === 'sepia' || raw.effect === 'none' ? raw.effect : 'none',
  }
}

function readText(raw: unknown, errors: string[], index: number): PackText | null {
  if (!isRecord(raw)) {
    errors.push(`composition.texts[${index}] must be an object.`)
    return null
  }

  const id = readString(raw.id, `composition.texts[${index}].id`, errors)
  const text = readString(raw.text, `composition.texts[${index}].text`, errors, 1, 80)
  const font = readString(raw.font, `composition.texts[${index}].font`, errors, 1, 160)
  const color = readString(raw.color, `composition.texts[${index}].color`, errors, 1, 32)

  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
    errors.push(`composition.texts[${index}] x and y must be numbers.`)
  }

  if (typeof raw.align !== 'string' || !ALIGN_VALUES.has(raw.align)) {
    errors.push(`composition.texts[${index}].align is not supported.`)
  }

  if (raw.baseline !== undefined && (typeof raw.baseline !== 'string' || !BASELINE_VALUES.has(raw.baseline))) {
    errors.push(`composition.texts[${index}].baseline is not supported.`)
  }

  if (!id || !text || !font || !color || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || typeof raw.align !== 'string') {
    return null
  }

  return {
    id,
    text,
    x: raw.x,
    y: raw.y,
    font,
    color,
    align: raw.align as CanvasTextAlign,
    baseline: typeof raw.baseline === 'string' ? (raw.baseline as CanvasTextBaseline) : undefined,
  }
}

function readComposition(raw: unknown, shotCount: ShotMode, errors: string[]): PackComposition | null {
  if (!isRecord(raw)) {
    errors.push('composition is required.')
    return null
  }

  const id = readString(raw.id, 'composition.id', errors)
  const name = readString(raw.name, 'composition.name', errors)
  const background = readString(raw.background, 'composition.background', errors)

  if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height) || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 100 || raw.height < 100 || raw.width > 4096 || raw.height > 4096 || raw.width * raw.height > 12_000_000) {
    errors.push('composition dimensions must be integers from 100 to 4096, with at most 12 million pixels.')
  }

  if (!isBoolean(raw.overlayEnabled)) {
    errors.push('composition.overlayEnabled must be true or false.')
  }

  if (!Array.isArray(raw.slots) || raw.slots.length !== shotCount) {
    errors.push(`composition.slots must contain exactly ${shotCount} slot(s).`)
  }

  if (!Array.isArray(raw.texts)) {
    errors.push('composition.texts must be an array.')
  }

  const slots = Array.isArray(raw.slots)
    ? raw.slots
        .map((slot, index) => readSlot(slot, shotCount, errors, index))
        .filter((slot): slot is PackSlot => Boolean(slot))
    : []

  for (const slot of slots) {
    if (slot.x < 0 || slot.y < 0 || (isFiniteNumber(raw.width) && slot.x + slot.width > raw.width) || (isFiniteNumber(raw.height) && slot.y + slot.height > raw.height)) {
      errors.push('composition slots must fit entirely inside the canvas.')
    }
  }
  if (new Set(slots.map(slot => slot.id)).size !== slots.length) errors.push('Slot IDs must be unique.')
  const shotNumbers = slots.map((slot) => slot.shotNumber)
  if (new Set(shotNumbers).size !== slots.length) {
    errors.push('composition.slots must use unique shot numbers.')
  }

  const texts = Array.isArray(raw.texts)
    ? raw.texts
        .map((text, index) => readText(text, errors, index))
        .filter((text): text is PackText => Boolean(text))
    : []

  if (
    !id ||
    !name ||
    !background ||
    !isFiniteNumber(raw.width) ||
    !isFiniteNumber(raw.height) ||
    !isBoolean(raw.overlayEnabled) ||
    slots.length !== shotCount
  ) {
    return null
  }

  return {
    id,
    name,
    width: raw.width,
    height: raw.height,
    background,
    overlayEnabled: raw.overlayEnabled,
    slots,
    texts,
  }
}

export function validateEventPack(input: unknown): PackValidationResult {
  const errors: string[] = []

  if (!isRecord(input)) {
    return { ok: false, errors: ['Event Pack must be a JSON object.'] }
  }

  const id = readString(input.id, 'id', errors)
  const version = readString(input.version, 'version', errors, 1, 20)
  if (version && !VERSION_PATTERN.test(version)) {
    errors.push('version must look like 1.0 or 1.0.0.')
  }

  const eventName = readString(input.eventName, 'eventName', errors)
  if (!isLanguage(input.language)) {
    errors.push('language must be en or hi.')
  }
  if (!isShotCount(input.shotCount)) {
    errors.push('shotCount must be 1, 2, or 3.')
  }
  if (!isFiniteNumber(input.betweenShotPauseMs) || input.betweenShotPauseMs < 0 || input.betweenShotPauseMs > 10000) {
    errors.push('betweenShotPauseMs must be between 0 and 10000.')
  }

  for (const flag of [
    'mirrorOutput',
    'blackAndWhiteEnabled',
    'sepiaEnabled',
    'whatsappEnabled',
    'emailEnabled',
    'cloudQrEnabled',
    'printEnabled',
  ] as const) {
    if (input[flag] !== undefined && !isBoolean(input[flag])) {
      errors.push(`${flag} must be true or false.`)
    }
  }

  const schoolMode = Boolean(input.schoolMode)
  let consentMode: 'none' | 'notice' | 'explicit' | 'explicitShare' = 'none'
  if (
    input.consentMode === 'explicitShare' ||
    input.consentMode === 'explicit' ||
    input.consentMode === 'notice' ||
    input.consentMode === 'none'
  ) {
    consentMode = input.consentMode
  } else if (schoolMode) {
    consentMode = 'notice'
  }
  if (schoolMode && consentMode === 'none') {
    consentMode = 'notice'
  }

  const consentTextEn = typeof input.consentTextEn === 'string' ? input.consentTextEn.trim() : undefined
  const consentTextHi = typeof input.consentTextHi === 'string' ? input.consentTextHi.trim() : undefined
  const privacyNoticeText = typeof input.privacyNoticeText === 'string' && input.privacyNoticeText.trim().length > 0
    ? input.privacyNoticeText.trim()
    : 'Privacy Notice: Photos taken during this session are saved privately and never published without consent.'
  const retentionHours = typeof input.retentionHours === 'number' && input.retentionHours > 0 ? input.retentionHours : 72

  let payment: import('./types').EventPackPaymentConfig = {
    enabled: true,
    mode: 'organizer',
    amount: 0,
    currency: 'INR',
    timeoutSeconds: 300,
  }

  if (input.payment !== undefined && input.payment !== null) {
    if (!isRecord(input.payment)) {
      errors.push('payment must be an object.')
    } else {
      const mode = input.payment.mode
      if (mode !== undefined && mode !== 'organizer' && mode !== 'individual' && mode !== 'disabled') {
        errors.push('payment.mode must be organizer, individual, or disabled.')
      }

      const enabled = input.payment.enabled !== undefined ? Boolean(input.payment.enabled) : (mode !== 'disabled')
      const targetMode: import('./types').PaymentMode = (mode === 'individual' || mode === 'disabled' || mode === 'organizer')
        ? mode
        : 'organizer'

      if (targetMode === 'individual') {
        const upiId = typeof input.payment.upiId === 'string' ? input.payment.upiId.trim() : ''
        const merchantName = typeof input.payment.merchantName === 'string' ? input.payment.merchantName.trim() : ''
        const amount = typeof input.payment.amount === 'number' && Number.isFinite(input.payment.amount) ? input.payment.amount : null

        if (!upiId || !upiId.includes('@')) {
          errors.push('payment.upiId is required and must be a valid UPI ID (e.g. name@bank).')
        }
        if (!merchantName) {
          errors.push('payment.merchantName is required for individual UPI payment.')
        }
        if (amount === null || amount <= 0) {
          errors.push('payment.amount must be a positive number for individual UPI payment.')
        }

        const timeoutSeconds = typeof input.payment.timeoutSeconds === 'number' && input.payment.timeoutSeconds > 0
          ? Math.floor(input.payment.timeoutSeconds)
          : 300

        const currency = typeof input.payment.currency === 'string' && input.payment.currency.trim()
          ? input.payment.currency.trim().toUpperCase()
          : 'INR'

        payment = {
          enabled,
          mode: 'individual',
          upiId,
          merchantName,
          amount: amount || 0,
          currency,
          timeoutSeconds,
        }
      } else {
        payment = {
          enabled,
          mode: targetMode,
          amount: 0,
          currency: 'INR',
          timeoutSeconds: 300,
        }
      }
    }
  }

  const composition = isShotCount(input.shotCount)
    ? readComposition(input.composition, input.shotCount, errors)
    : null

  const singleShotComposition = input.singleShotComposition === undefined
    ? undefined : readComposition(input.singleShotComposition, 1, errors)

  if (composition) {
    for (const slot of composition.slots) {
      if (slot.effect === 'black-and-white' && input.blackAndWhiteEnabled === false) {
        errors.push('A slot uses black-and-white, but blackAndWhiteEnabled is false.')
      }
      if (slot.effect === 'sepia' && input.sepiaEnabled === false) {
        errors.push('A slot uses sepia, but sepiaEnabled is false.')
      }
    }
  }

  if (
    errors.length > 0 ||
    !id ||
    !version ||
    !eventName ||
    !composition ||
    !isLanguage(input.language) ||
    !isShotCount(input.shotCount) ||
    !isFiniteNumber(input.betweenShotPauseMs)
  ) {
    return { ok: false, errors }
  }

  // Respect configured delivery channels and enforce schoolMode restrictions
  const whatsappEnabled = schoolMode ? false : Boolean(input.whatsappEnabled)
  const emailEnabled = schoolMode ? false : Boolean(input.emailEnabled)
  const cloudQrEnabled = schoolMode ? false : (input.cloudQrEnabled !== undefined ? Boolean(input.cloudQrEnabled) : true)
  const publicGalleryEnabled = schoolMode ? false : Boolean(input.publicGalleryEnabled ?? false)

  const schoolName = typeof input.schoolName === 'string' ? input.schoolName.trim() : undefined
  const schoolLogoUrl = typeof input.schoolLogoUrl === 'string' ? input.schoolLogoUrl.trim() : (input.schoolLogoUrl === null ? null : undefined)
  const accentColor = typeof input.accentColor === 'string' ? input.accentColor.trim() : undefined
  const primaryColor = typeof input.primaryColor === 'string' ? input.primaryColor.trim() : undefined
  const secondaryColor = typeof input.secondaryColor === 'string' ? input.secondaryColor.trim() : undefined
  const backgroundColor = typeof input.backgroundColor === 'string' ? input.backgroundColor.trim() : undefined
  const eventSubtitle = typeof input.eventSubtitle === 'string' ? input.eventSubtitle.trim() : undefined
  const countdownSeconds = typeof input.countdownSeconds === 'number' && input.countdownSeconds > 0 ? input.countdownSeconds : undefined
  const staffPin = typeof input.staffPin === 'string' && /^\d{6}$/.test(input.staffPin.trim()) ? input.staffPin.trim() : undefined

  return {
    ok: true,
    pack: {
      id,
      version,
      eventName,
      language: input.language,
      shotCount: input.shotCount,
      betweenShotPauseMs: input.betweenShotPauseMs,
      mirrorOutput: Boolean(input.mirrorOutput),
      blackAndWhiteEnabled: Boolean(input.blackAndWhiteEnabled),
      sepiaEnabled: Boolean(input.sepiaEnabled),
      whatsappEnabled,
      emailEnabled,
      cloudQrEnabled,
      printEnabled: Boolean(input.printEnabled),
      schoolMode,
      consentMode,
      consentTextEn,
      consentTextHi,
      privacyNoticeText,
      retentionHours,
      publicGalleryEnabled,
      payment,
      schoolName,
      schoolLogoUrl,
      accentColor,
      primaryColor,
      secondaryColor,
      backgroundColor,
      eventSubtitle,
      countdownSeconds,
      staffPin,
      composition,
      ...(singleShotComposition ? { singleShotComposition } : {}),
    },
  }
}

export function parseEventPackJson(text: string): PackValidationResult {
  try {
    return validateEventPack(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] }
  }
}

export function ensureValidPack(input: unknown): EventPack {
  const result = validateEventPack(input)
  if (result.ok) {
    return result.pack
  }

  return getFallbackPack()
}
