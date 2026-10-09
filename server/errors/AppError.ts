export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PAYMENT_REQUIRED'
  | 'MISSING_DEVICE_TOKEN'
  | 'INVALID_DEVICE_TOKEN'
  | 'DEVICE_REVOKED'
  | 'DEVICE_NOT_FOUND'
  | 'EVENT_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'ASSET_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'DUPLICATE_RESOURCE'
  | 'VALIDATION_ERROR'
  | 'INVALID_ASSET'
  | 'STORAGE_FAILURE'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'MISSING_ADMIN_TOKEN'
  | 'INVALID_ADMIN_TOKEN'
  | 'ADMIN_NOT_FOUND'
  | 'DUPLICATE_ADMIN'
  | 'TOKEN_EXPIRED'
  | 'EVENT_CANCELLED'
  | 'CONFIG_INCOMPLETE'
  | 'EVENT_PACK_INVALID'
  | 'INVALID_ACTIVATION_TOKEN'
  | 'PAYMENT_NOT_REQUIRED'
  | 'INVALID_AMOUNT'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly details?: unknown

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode
    message: string
    status: number
    details?: unknown
  }
}

export function formatErrorResponse(err: unknown): { status: number; body: ErrorResponseBody } {
  if (isAppError(err)) {
    return {
      status: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          status: err.statusCode,
          details: err.details,
        },
      },
    }
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred'
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message,
        status: 500,
      },
    },
  }
}
