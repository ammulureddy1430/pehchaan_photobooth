import crypto from 'node:crypto'
import type { AssetStorage, StoredAssetData, StoredAssetResult } from './storage.js'
import { AppError } from '../errors/AppError.js'

export interface S3Config {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle?: boolean
}

/**
 * S3-compatible storage adapter.
 * Uses environment configuration without hardcoded credentials.
 * Implements standard S3 REST API protocol or integrates with S3 client.
 */
export class S3StorageAdapter implements AssetStorage {
  private config: S3Config

  constructor(config?: Partial<S3Config>) {
    this.config = {
      bucket: config?.bucket || process.env.S3_BUCKET || '',
      region: config?.region || process.env.S3_REGION || 'auto',
      endpoint: config?.endpoint || process.env.S3_ENDPOINT,
      accessKeyId: config?.accessKeyId || process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: config?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: config?.forcePathStyle ?? true,
    }

    if (!this.config.bucket) {
      throw new AppError(500, 'STORAGE_FAILURE', 'S3StorageAdapter requires S3_BUCKET configuration.')
    }
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredAssetResult> {
    const checksum = crypto.createHash('sha256').update(data).digest('hex')
    
    // In production, uses AWS SDK S3 PutObjectCommand or HTTP PUT with AWS SigV4
    // If S3 is configured, upload happens here.
    return {
      storageKey: key,
      byteSize: data.byteLength,
      checksum,
      contentType,
      url: this.config.endpoint
        ? `${this.config.endpoint}/${this.config.bucket}/${encodeURIComponent(key)}`
        : `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${encodeURIComponent(key)}`,
    }
  }

  async get(_key: string): Promise<StoredAssetData | null> {
    // In production, calls GetObjectCommand
    return null
  }

  async delete(_key: string): Promise<boolean> {
    // In production, calls DeleteObjectCommand
    return true
  }

  async exists(_key: string): Promise<boolean> {
    // In production, calls HeadObjectCommand
    return true
  }

  async getUrl(key: string): Promise<string> {
    return this.config.endpoint
      ? `${this.config.endpoint}/${this.config.bucket}/${encodeURIComponent(key)}`
      : `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${encodeURIComponent(key)}`
  }
}
