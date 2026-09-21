export interface StoredAssetResult {
  storageKey: string
  byteSize: number
  checksum: string
  contentType: string
  url: string
}

export interface StoredAssetData {
  data: Buffer
  contentType: string
  byteSize: number
  checksum: string
}

export interface AssetStorage {
  put(key: string, data: Buffer, contentType: string): Promise<StoredAssetResult>
  get(key: string): Promise<StoredAssetData | null>
  delete(key: string): Promise<boolean>
  exists(key: string): Promise<boolean>
  getUrl(key: string): Promise<string>
}
