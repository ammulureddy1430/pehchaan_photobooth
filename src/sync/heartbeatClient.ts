import { apiClient, ApiClientError, PehchaanApiClient } from '../api/client'
import { getLocalDeviceId, getLocalDeviceToken } from '../api/deviceIdentity'

export interface HeartbeatOptions {
  intervalMs?: number
  client?: PehchaanApiClient
  deviceId?: string
}

export class HeartbeatClient {
  private timer: any = null
  private intervalMs: number
  private client: PehchaanApiClient
  private configuredDeviceId?: string
  private isRevoked = false
  private running = false

  constructor(options: HeartbeatOptions = {}) {
    this.intervalMs = options.intervalMs || 60000 // 60s default
    this.client = options.client || apiClient
    this.configuredDeviceId = options.deviceId
  }

  public start(): void {
    if (this.running) return
    this.running = true

    // Send initial heartbeat
    void this.sendHeartbeat()

    // Setup periodic interval
    this.timer = setInterval(() => {
      void this.sendHeartbeat()
    }, this.intervalMs)
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.running = false
  }

  public resetRevocation(): void {
    this.isRevoked = false
  }

  public async sendHeartbeat(): Promise<boolean> {
    if (this.isRevoked) return false

    const token = getLocalDeviceToken()
    if (!token) return false // Not registered yet

    const deviceId = this.configuredDeviceId || getLocalDeviceId()

    try {
      let batteryLevel: number | undefined
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery()
          batteryLevel = battery.level
        } catch {
          // Ignore battery API error
        }
      }

      await this.client.heartbeat(deviceId, {
        appVersion: '0.1.0',
        batteryLevel,
        status: 'active',
      })
      return true
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === 'DEVICE_REVOKED' || err.status === 403)) {
        this.isRevoked = true
        this.stop()
      }
      // Offline / transient error: simply ignored without queueing up
      return false
    }
  }
}

export const heartbeatClient = new HeartbeatClient()
