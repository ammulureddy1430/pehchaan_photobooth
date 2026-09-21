import type { AdminUser, SchoolProfile, DashboardStats, AdminEvent, CreateEventInput, UpdateEventInput } from '../types'
import { getStoredAdminToken, setStoredAdminToken, setStoredAdminUser, clearAdminSession } from './adminAuth'

export function getAdminApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if ((window as any).__PEHCHAAN_API_URL__) {
      return (window as any).__PEHCHAAN_API_URL__
    }
    const { protocol, hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//127.0.0.1:3001`
    }
    return `${protocol}//${hostname}:3001`
  }
  return 'http://127.0.0.1:3001'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getAdminApiBaseUrl()
  const token = getStoredAdminToken()

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('x-admin-token', token)
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    })
  } catch (err: any) {
    throw new Error(`Unable to connect to Pehchaan server (${baseUrl}). Please ensure backend is running.`)
  }

  if (res.status === 401) {
    clearAdminSession()
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const errorMsg = data?.error?.message || data?.message || `Request failed with status ${res.status}`
    const error = new Error(errorMsg)
    ;(error as any).status = res.status
    ;(error as any).code = data?.error?.code
    throw error
  }

  return data as T
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ token: string; admin: AdminUser }> {
  const data = await request<{ token: string; admin: AdminUser }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (data.token) {
    setStoredAdminToken(data.token)
  }
  if (data.admin) {
    setStoredAdminUser(data.admin)
  }
  return data
}

export async function adminGetMe(): Promise<{ admin: AdminUser }> {
  return request<{ admin: AdminUser }>('/api/admin/auth/me')
}

export async function adminLogout(): Promise<{ success: boolean }> {
  try {
    const res = await request<{ success: boolean }>('/api/admin/auth/logout', {
      method: 'POST',
    })
    clearAdminSession()
    return res
  } catch {
    clearAdminSession()
    return { success: true }
  }
}

export async function adminGetStats(): Promise<{ stats: DashboardStats }> {
  return request<{ stats: DashboardStats }>('/api/admin/stats')
}

export async function adminGetEvents(): Promise<{ events: AdminEvent[] }> {
  return request<{ events: AdminEvent[] }>('/api/admin/events')
}

export async function adminCreateEvent(
  data: CreateEventInput
): Promise<{ success: boolean; event: AdminEvent }> {
  return request<{ success: boolean; event: AdminEvent }>('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function adminGetEvent(
  eventId: string
): Promise<{ event: AdminEvent }> {
  return request<{ event: AdminEvent }>(`/api/admin/events/${encodeURIComponent(eventId)}`)
}

export async function adminUpdateEvent(
  eventId: string,
  data: UpdateEventInput
): Promise<{ success: boolean; event: AdminEvent }> {
  return request<{ success: boolean; event: AdminEvent }>(
    `/api/admin/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  )
}

export async function adminCancelEvent(
  eventId: string
): Promise<{ success: boolean; event: AdminEvent }> {
  return request<{ success: boolean; event: AdminEvent }>(
    `/api/admin/events/${encodeURIComponent(eventId)}/cancel`,
    {
      method: 'POST',
    }
  )
}

export async function adminGetProfile(): Promise<{ profile: SchoolProfile }> {
  return request<{ profile: SchoolProfile }>('/api/admin/profile')
}

export async function adminUpdateProfile(
  profile: Partial<Omit<SchoolProfile, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<{ success: boolean; profile: SchoolProfile }> {
  return request<{ success: boolean; profile: SchoolProfile }>('/api/admin/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
}

export async function adminGetEventConfig(
  eventId: string
): Promise<{ success: boolean; event: AdminEvent; config: import('../types').EventConfiguration; school: SchoolProfile }> {
  return request<{ success: boolean; event: AdminEvent; config: import('../types').EventConfiguration; school: SchoolProfile }>(
    `/api/admin/events/${encodeURIComponent(eventId)}/config`
  )
}

export async function adminSaveEventConfig(
  eventId: string,
  config: import('../types').SaveEventConfigInput
): Promise<{ success: boolean; config: import('../types').EventConfiguration; eventPack: Record<string, unknown> }> {
  return request<{ success: boolean; config: import('../types').EventConfiguration; eventPack: Record<string, unknown> }>(
    `/api/admin/events/${encodeURIComponent(eventId)}/config`,
    {
      method: 'PUT',
      body: JSON.stringify(config),
    }
  )
}

export async function adminUploadImage(
  imageBase64: string,
  filename = 'logo.png'
): Promise<{ success: boolean; url: string; storageKey: string }> {
  return request<{ success: boolean; url: string; storageKey: string }>('/api/admin/upload', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, filename }),
  })
}

export async function adminGetEventActivation(
  eventId: string
): Promise<import('../types').EventActivationData> {
  return request<import('../types').EventActivationData>(
    `/api/admin/events/${encodeURIComponent(eventId)}/activation`
  )
}

export async function adminRegenerateActivationToken(
  eventId: string
): Promise<{ success: boolean; eventId: string; activationToken: string }> {
  return request<{ success: boolean; eventId: string; activationToken: string }>(
    `/api/admin/events/${encodeURIComponent(eventId)}/activation/regenerate`,
    { method: 'POST' }
  )
}

export async function adminGetEventDashboard(
  eventId: string
): Promise<{ success: boolean } & import('../types').EventDashboardData> {
  return request<{ success: boolean } & import('../types').EventDashboardData>(
    `/api/admin/events/${encodeURIComponent(eventId)}/dashboard`
  )
}

export async function boothActivateEvent(
  eventId: string,
  token?: string,
  deviceId?: string
): Promise<import('../types').BoothActivationResult> {
  return request<import('../types').BoothActivationResult>('/api/booth/activate', {
    method: 'POST',
    body: JSON.stringify({ eventId, token, deviceId }),
  })
}

// Inquiries API
export async function adminGetInquiries(params?: {
  status?: string
  search?: string
  limit?: number
}): Promise<{ success: boolean; inquiries: import('../types').InquiryItem[]; stats: import('../types').InquiryStats }> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.search) query.set('search', params.search)
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString() ? `?${query.toString()}` : ''
  return request<{ success: boolean; inquiries: import('../types').InquiryItem[]; stats: import('../types').InquiryStats }>(
    `/api/admin/inquiries${qs}`
  )
}

export async function adminGetInquiry(
  id: string
): Promise<{ success: boolean; inquiry: import('../types').InquiryItem }> {
  return request<{ success: boolean; inquiry: import('../types').InquiryItem }>(
    `/api/admin/inquiries/${encodeURIComponent(id)}`
  )
}

export async function adminUpdateInquiry(
  id: string,
  data: Partial<import('../types').InquiryItem>
): Promise<{ success: boolean; inquiry: import('../types').InquiryItem }> {
  return request<{ success: boolean; inquiry: import('../types').InquiryItem }>(
    `/api/admin/inquiries/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  )
}

export async function adminCreateInquiry(
  data: Partial<import('../types').InquiryItem>
): Promise<{ success: boolean; inquiry: import('../types').InquiryItem }> {
  return request<{ success: boolean; inquiry: import('../types').InquiryItem }>(
    '/api/inquiries',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )
}

export async function adminDeleteInquiry(
  id: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/api/admin/inquiries/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  )
}

