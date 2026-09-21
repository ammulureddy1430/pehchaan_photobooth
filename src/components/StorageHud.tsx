import { formatBytes } from '../lib/format'
import type { StorageStats } from '../types'
import './StorageHud.css'

type StorageHudProps = {
  stats: StorageStats
  message: string | null
}

export function StorageHud({ stats, message }: StorageHudProps) {
  return (
    <div className="storage-hud">
      <span>
        {stats.count} · {formatBytes(stats.bytes)}
      </span>
      {message && <span className="storage-hud-alert" role="alert">{message}</span>}
    </div>
  )
}
