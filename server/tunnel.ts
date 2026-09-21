import { spawn, type ChildProcess } from 'node:child_process'

export class PublicTunnelService {
  private tunnelProcess: ChildProcess | null = null
  private publicUrl: string | null = null
  private isStarting = false
  private port: number
  private listeners: ((url: string | null) => void)[] = []

  constructor(port: number = 3001) {
    this.port = port
  }

  public getPublicUrl(): string | null {
    return this.publicUrl || process.env.PUBLIC_URL || null
  }

  public isActive(): boolean {
    return Boolean(this.publicUrl)
  }

  public subscribe(cb: (url: string | null) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  private notify(url: string | null): void {
    this.publicUrl = url
    for (const cb of this.listeners) {
      try {
        cb(url)
      } catch {
        // Ignore listener error
      }
    }
  }

  public async startTunnel(): Promise<string | null> {
    if (this.publicUrl) return this.publicUrl
    if (this.isStarting) return null
    this.isStarting = true

    return new Promise((resolve) => {
      try {
        const proc = spawn('ssh', [
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'ServerAliveInterval=30',
          '-o', 'ServerAliveCountMax=3',
          '-R', `80:localhost:${this.port}`,
          'nokey@localhost.run',
        ])

        this.tunnelProcess = proc

        let resolved = false
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true
            this.isStarting = false
            resolve(this.publicUrl)
          }
        }, 12000)

        proc.stdout?.on('data', (data: Buffer) => {
          const text = data.toString()
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/) || text.match(/https:\/\/[a-zA-Z0-9.-]+\.localhost\.run/)
          if (match && match[0]) {
            const url = match[0]
            this.notify(url)
            console.log(`[Public Tunnel] Live public URL: ${url}`)
            if (!resolved) {
              resolved = true
              clearTimeout(timer)
              this.isStarting = false
              resolve(url)
            }
          }
        })

        proc.stderr?.on('data', () => {
          // Ignore ssh banner
        })

        proc.on('close', () => {
          this.tunnelProcess = null
          this.notify(null)
          this.isStarting = false
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            resolve(null)
          }
        })

        proc.on('error', (err) => {
          console.warn('[Public Tunnel] Error starting tunnel:', err.message)
          this.isStarting = false
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            resolve(null)
          }
        })
      } catch (err) {
        console.warn('[Public Tunnel] Failed to spawn tunnel:', err)
        this.isStarting = false
        resolve(null)
      }
    })
  }

  public stopTunnel(): void {
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill('SIGTERM')
      } catch {
        // Ignore
      }
      this.tunnelProcess = null
    }
    this.notify(null)
    this.isStarting = false
  }
}

export const publicTunnelService = new PublicTunnelService()
