import type { AssetStorage } from './storage.js'
import { LocalStorageAdapter } from './localStorageAdapter.js'
import { MemoryStorageAdapter } from './memoryStorageAdapter.js'
import { S3StorageAdapter } from './s3StorageAdapter.js'

export interface StorageOptions {
  type?: 'local' | 'memory' | 's3' | 'auto'
  baseDir?: string
}

let defaultStorageInstance: AssetStorage | null = null

export function createStorage(options: StorageOptions = {}): AssetStorage {
  const type = options.type || (process.env.STORAGE_TYPE as 'local' | 'memory' | 's3') || 'auto'

  if (type === 'memory' || process.env.NODE_ENV === 'test') {
    return new MemoryStorageAdapter()
  }

  if (type === 's3' || (type === 'auto' && process.env.S3_BUCKET)) {
    try {
      return new S3StorageAdapter()
    } catch {
      // If S3 config is incomplete, fallback to local disk
      return new LocalStorageAdapter(options.baseDir || process.env.STORAGE_DIR || './data/storage')
    }
  }

  return new LocalStorageAdapter(options.baseDir || process.env.STORAGE_DIR || './data/storage')
}

export function getDefaultStorage(): AssetStorage {
  if (!defaultStorageInstance) {
    defaultStorageInstance = createStorage()
  }
  return defaultStorageInstance
}

export function setDefaultStorage(storage: AssetStorage): void {
  defaultStorageInstance = storage
}
