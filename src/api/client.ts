import type {
  ApiDeviceInfo,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  ApiEventInfo,
  CreateEventRequest,
  CreateEventResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  SessionWithAssetsResponse,
  ApiAssetInfo,
  CreateAssetRequest,
  CreateAssetResponse,
  ApiErrorResponse,
} from './types.js'
import { getLocalDeviceToken, setLocalDeviceToken } from './deviceIdentity.js'

export class ApiClientError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ApiClientConfig {
  baseUrl?: string
  getToken?: () => string | null
  setToken?: (token: string) => void
}

export function isSecureEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url)
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local') ||
      /^192\.168\./.test(parsed.hostname) ||
      /^10\./.test(parsed.hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(parsed.hostname)

    // Local development and local LAN booth endpoints may use http, remote cloud endpoints must use https
    if (!isLocal && parsed.protocol !== 'https:') {
      return false
    }
    return true
  } catch {
    return false
  }
}

export class PehchaanApiClient {
  private baseUrl: string
  private getToken: () => string | null
  private setToken: (token: string) => void

  constructor(config: ApiClientConfig = {}) {
    const defaultBrowserUrl = typeof window !== 'undefined'
      ? (window as any).__PEHCHAAN_API_URL__ || `${window.location.protocol}//${window.location.hostname || 'localhost'}:3001`
      : 'http://localhost:3001'
    const url = config.baseUrl || defaultBrowserUrl
    
    // Validate secure protocol
    if (!isSecureEndpoint(url)) {
      throw new ApiClientError(
        400,
        'INSECURE_ENDPOINT',
        `Insecure endpoint '${url}' rejected. Remote cloud endpoints must use HTTPS.`
      )
    }

    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
    this.getToken = config.getToken || getLocalDeviceToken
    this.setToken = config.setToken || setLocalDeviceToken
  }

  public getBaseUrl(): string {
    return this.baseUrl
  }

  public setBaseUrl(url: string): void {
    if (!isSecureEndpoint(url)) {
      throw new ApiClientError(
        400,
        'INSECURE_ENDPOINT',
        `Insecure endpoint '${url}' rejected. Remote cloud endpoints must use HTTPS.`
      )
    }
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
  }

  public getGalleryUrl(sessionId: string): string {
    return `${this.baseUrl}/gallery/${encodeURIComponent(sessionId)}`
  }

  public async getServerInfo(): Promise<{
    status: string
    time: number
    primaryLanIp?: string
    lanIps?: string[]
    port?: string
    publicUrl?: string | null
    baseUrl?: string
  }> {
    return this.request<{
      status: string
      time: number
      primaryLanIp?: string
      lanIps?: string[]
      port?: string
      publicUrl?: string | null
      baseUrl?: string
    }>('/api/server-info', {
      method: 'GET',
    })
  }

  public async getTunnelStatus(): Promise<{ active: boolean; publicUrl: string | null }> {
    return this.request<{ active: boolean; publicUrl: string | null }>('/api/tunnel', {
      method: 'GET',
    })
  }

  public async startTunnel(): Promise<{ success: boolean; publicUrl: string | null }> {
    return this.request<{ success: boolean; publicUrl: string | null }>('/api/tunnel/start', {
      method: 'POST',
    })
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers = new Headers(options.headers || {})

    const token = this.getToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    const contentType = response.headers.get('content-type') || ''
    let data: any = null

    if (contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch {
        // Fallback
      }
    }

    if (!response.ok) {
      if (data && typeof data === 'object' && 'error' in data) {
        const errObj = (data as ApiErrorResponse).error
        throw new ApiClientError(
          response.status,
          errObj.code || 'HTTP_ERROR',
          errObj.message || `Request failed with status ${response.status}`,
          errObj.details
        )
      }

      throw new ApiClientError(
        response.status,
        `HTTP_${response.status}`,
        `Request to ${path} failed with HTTP ${response.status}`
      )
    }

    return data as T
  }

  // ----------------------------------------------------
  // DEVICE APIS
  // ----------------------------------------------------

  async registerDevice(req: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    const result = await this.request<RegisterDeviceResponse>('/api/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })

    if (result.token) {
      this.setToken(result.token)
    }

    return result
  }

  async getDevice(deviceId: string): Promise<ApiDeviceInfo> {
    const result = await this.request<{ device: ApiDeviceInfo }>(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'GET',
    })
    return result.device
  }

  async listDevices(): Promise<ApiDeviceInfo[]> {
    const result = await this.request<{ devices: ApiDeviceInfo[] }>('/api/devices', {
      method: 'GET',
    })
    return result.devices
  }

  async revokeDevice(deviceId: string): Promise<ApiDeviceInfo> {
    const result = await this.request<{ success: boolean; device: ApiDeviceInfo }>(
      `/api/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        method: 'POST',
      }
    )
    return result.device
  }

  async heartbeat(deviceId: string, req: HeartbeatRequest = {}): Promise<HeartbeatResponse> {
    return this.request<HeartbeatResponse>(`/api/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  // ----------------------------------------------------
  // EVENT APIS
  // ----------------------------------------------------

  async createEvent(req: CreateEventRequest): Promise<CreateEventResponse> {
    return this.request<CreateEventResponse>('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  async getEvent(eventId: string): Promise<ApiEventInfo> {
    const result = await this.request<{ event: ApiEventInfo }>(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'GET',
    })
    return result.event
  }

  async listEvents(): Promise<ApiEventInfo[]> {
    const result = await this.request<{ events: ApiEventInfo[] }>('/api/events', {
      method: 'GET',
    })
    return result.events
  }

  async activateEvent(req: { eventId: string; token?: string; deviceId?: string }): Promise<any> {
    return this.request<any>('/api/booth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  async getEventPack(eventId: string, options: { token?: string; deviceToken?: string; adminToken?: string } = {}): Promise<any> {
    const headers: Record<string, string> = {}
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`
    if (options.deviceToken) headers['x-device-token'] = options.deviceToken
    if (options.adminToken) headers['x-admin-token'] = options.adminToken

    return this.request<any>(`/api/events/${encodeURIComponent(eventId)}/pack`, {
      method: 'GET',
      headers,
    })
  }

  // ----------------------------------------------------
  // SESSION APIS
  // ----------------------------------------------------

  async createSession(eventId: string, req: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.request<CreateSessionResponse>(`/api/events/${encodeURIComponent(eventId)}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  async getSession(sessionId: string): Promise<SessionWithAssetsResponse> {
    return this.request<SessionWithAssetsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    })
  }

  // ----------------------------------------------------
  // ASSET APIS
  // ----------------------------------------------------

  async createAsset(
    sessionId: string,
    meta: CreateAssetRequest,
    data: Blob | ArrayBuffer | Uint8Array
  ): Promise<CreateAssetResponse> {
    let arrayBuffer: ArrayBuffer
    if (data instanceof Blob) {
      arrayBuffer = await data.arrayBuffer()
    } else if (data instanceof ArrayBuffer) {
      arrayBuffer = data
    } else {
      arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    }

    const uint8 = new Uint8Array(arrayBuffer)
    let binary = ''
    const len = uint8.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i])
    }
    const dataBase64 = btoa(binary)

    const payload = {
      ...meta,
      dataBase64,
      contentType: meta.contentType || (data instanceof Blob ? data.type : 'image/jpeg') || 'image/jpeg',
    }

    return this.request<CreateAssetResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  async getAsset(assetId: string): Promise<ApiAssetInfo> {
    const result = await this.request<{ asset: ApiAssetInfo }>(`/api/assets/${encodeURIComponent(assetId)}`, {
      method: 'GET',
    })
    return result.asset
  }

  async listSessionAssets(sessionId: string): Promise<ApiAssetInfo[]> {
    const result = await this.request<{ assets: ApiAssetInfo[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/assets`, {
      method: 'GET',
    })
    return result.assets
  }

  // ----------------------------------------------------
  // PAYMENT APIS
  // ----------------------------------------------------

  async createPayment(req: {
    eventId: string
    sessionId: string
    amount: number
    currency?: string
    mode?: string
    upiId?: string
    merchantName?: string
    paymentReference?: string
  }): Promise<{ payment: any; paymentReference: string; status: string; upiUri: string }> {
    return this.request<{ payment: any; paymentReference: string; status: string; upiUri: string }>('/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  async getPayment(paymentReference: string): Promise<{ payment: any; status: string; paymentReference: string }> {
    return this.request<{ payment: any; status: string; paymentReference: string }>(
      `/v1/payments/${encodeURIComponent(paymentReference)}`,
      { method: 'GET' }
    )
  }

  async verifyPayment(paymentReference: string): Promise<{ verified: boolean; status: string; paymentReference: string; verifiedAt?: number }> {
    return this.request<{ verified: boolean; status: string; paymentReference: string; verifiedAt?: number }>(
      `/v1/payments/${encodeURIComponent(paymentReference)}/verify`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
  }

  async cancelPayment(paymentReference: string): Promise<{ status: string; paymentReference: string; payment: any }> {
    return this.request<{ status: string; paymentReference: string; payment: any }>(
      `/v1/payments/${encodeURIComponent(paymentReference)}/cancel`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
  }

  async getPaymentSummary(eventId: string): Promise<{ summary: any }> {
    return this.request<{ summary: any }>(`/api/payments/summary/${encodeURIComponent(eventId)}`, {
      method: 'GET',
    })
  }
}

export const apiClient = new PehchaanApiClient()
