import type { AdminUser } from '../types'

const TOKEN_KEY = 'pehchaan_admin_token'
const USER_KEY = 'pehchaan_admin_user'

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredAdminToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Ignore storage quota issues
  }
}

export function clearStoredAdminToken(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore
  }
}

export function getStoredAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AdminUser
  } catch {
    return null
  }
}

export function setStoredAdminUser(user: AdminUser): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Ignore
  }
}

export function clearStoredAdminUser(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(USER_KEY)
  } catch {
    // Ignore
  }
}

export function clearAdminSession(): void {
  clearStoredAdminToken()
  clearStoredAdminUser()
}
