export type StorageErrorCode = 'unavailable' | 'quota' | 'failed'

export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(code: StorageErrorCode, message: string) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError
}

export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error
  }

  const name = error instanceof DOMException ? error.name : ''

  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new StorageError(
      'quota',
      'This device does not have enough storage to save the photo. Free some space, then try again.',
    )
  }

  if (typeof indexedDB === 'undefined') {
    return new StorageError(
      'unavailable',
      'Photo storage is not available in this browser.',
    )
  }

  return new StorageError(
    'failed',
    'Device storage could not complete the operation. Please retry; if it continues, reload the booth.',
  )
}

export function messageFromUnknown(error: unknown, fallback: string): string {
  if (error instanceof StorageError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
