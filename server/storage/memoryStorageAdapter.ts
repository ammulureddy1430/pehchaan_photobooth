import crypto from 'node:crypto'
import type { AssetStorage, StoredAssetData, StoredAssetResult } from './storage.js'

export class MemoryStorageAdapter implements AssetStorage {
  private store = new Map<string, { data: Buffer; contentType: string; checksum: string; createdAt: number }>()

  async put(key: string, data: Buffer, contentType: string): Promise<StoredAssetResult> {
    const checksum = crypto.createHash('sha256').update(data).digest('hex')
    this.store.set(key, {
      data: Buffer.from(data),
      contentType,
      checksum,
      createdAt: Date.now(),
    })

    return {
      storageKey: key,
      byteSize: data.byteLength,
      checksum,
      contentType,
      url: `/api/assets/file/${encodeURIComponent(key)}`,
    }
  }

  async get(key: string): Promise<StoredAssetData | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    return {
      data: Buffer.from(entry.data),
      contentType: entry.contentType,
      byteSize: entry.data.byteLength,
      checksum: entry.checksum,
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key)
  }

  async getUrl(key: string): Promise<string> {
    return `/api/assets/file/${encodeURIComponent(key)}`
  }

  clear(): void {
    this.store.clear()
  }
}
