import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { AssetStorage, StoredAssetData, StoredAssetResult } from './storage.js'
import { AppError } from '../errors/AppError.js'

export class LocalStorageAdapter implements AssetStorage {
  private baseDir: string

  constructor(baseDir: string = './data/storage') {
    this.baseDir = path.resolve(baseDir)
  }

  private resolveSafePath(key: string): string {
    if (key.includes('..') || path.isAbsolute(key) || /^[/\\]/.test(key)) {
      throw new AppError(400, 'INVALID_ASSET', 'Path traversal characters or absolute paths are not permitted in storage keys')
    }
    const fullPath = path.resolve(this.baseDir, key)
    if (!fullPath.startsWith(this.baseDir + path.sep)) {
      throw new AppError(400, 'INVALID_ASSET', 'Invalid storage key path traversal attempt')
    }
    return fullPath
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredAssetResult> {
    try {
      const filePath = this.resolveSafePath(key)
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(filePath, data)

      // Compute SHA-256 checksum
      const checksum = crypto.createHash('sha256').update(data).digest('hex')
      const metaPath = `${filePath}.meta.json`
      const meta = {
        contentType,
        byteSize: data.byteLength,
        checksum,
        createdAt: Date.now(),
      }
      await fs.writeFile(metaPath, JSON.stringify(meta), 'utf8')

      return {
        storageKey: key,
        byteSize: data.byteLength,
        checksum,
        contentType,
        url: `/api/assets/file/${encodeURIComponent(key)}`,
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError(500, 'STORAGE_FAILURE', `Failed to write asset to local storage: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async get(key: string): Promise<StoredAssetData | null> {
    try {
      const filePath = this.resolveSafePath(key)
      const data = await fs.readFile(filePath)

      let contentType = 'application/octet-stream'
      let checksum = crypto.createHash('sha256').update(data).digest('hex')

      try {
        const metaPath = `${filePath}.meta.json`
        const metaRaw = await fs.readFile(metaPath, 'utf8')
        const meta = JSON.parse(metaRaw)
        if (meta.contentType) contentType = meta.contentType
        if (meta.checksum) checksum = meta.checksum
      } catch {
        // Fallback to defaults
      }

      return {
        data,
        contentType,
        byteSize: data.byteLength,
        checksum,
      }
    } catch (err: unknown) {
      const nodeErr = err as { code?: string }
      if (nodeErr.code === 'ENOENT') {
        return null
      }
      throw new AppError(500, 'STORAGE_FAILURE', `Failed to read asset from local storage: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(key)
      await fs.unlink(filePath)
      try {
        await fs.unlink(`${filePath}.meta.json`)
      } catch {
        // Ignore meta deletion failure
      }
      return true
    } catch (err: unknown) {
      const nodeErr = err as { code?: string }
      if (nodeErr.code === 'ENOENT') return false
      throw new AppError(500, 'STORAGE_FAILURE', `Failed to delete asset from local storage: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(key)
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async getUrl(key: string): Promise<string> {
    return `/api/assets/file/${encodeURIComponent(key)}`
  }
}
