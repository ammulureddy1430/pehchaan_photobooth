/**
 * Pure TypeScript ZIP file generator (PKZip 2.0 uncompressed format).
 * Runs seamlessly in both Browser and Node.js test environments without external dependencies.
 */

// CRC-32 table calculation
const CRC32_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC32_TABLE[i] = c
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dateToDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  const dosTime = (hours << 11) | (minutes << 5) | seconds
  return { time: dosTime, date: dosDate }
}

interface ZipEntry {
  name: string
  data: Uint8Array
  crc: number
  date: Date
}

export class SimpleZip {
  private entries: ZipEntry[] = []

  public addFile(name: string, content: Uint8Array | string | Blob | ArrayBuffer): void {
    let data: Uint8Array
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content)
    } else if (content instanceof Uint8Array) {
      data = content
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content)
    } else {
      // For Blob, caller should convert before adding or call addBlob
      throw new Error('For Blob content, use addBlobAsync')
    }

    // Normalize forward slashes for zip path consistency
    const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '')
    this.entries.push({
      name: cleanName,
      data,
      crc: crc32(data),
      date: new Date(),
    })
  }

  public async addBlob(name: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    this.addFile(name, new Uint8Array(buffer))
  }

  public buildUint8Array(): Uint8Array {
    const encoder = new TextEncoder()
    const localHeadersAndData: Uint8Array[] = []
    const centralDirectoryHeaders: Uint8Array[] = []
    const offsets: number[] = []

    let currentOffset = 0

    for (const entry of this.entries) {
      const nameBytes = encoder.encode(entry.name)
      const { time: dosTime, date: dosDate } = dateToDosDateTime(entry.date)
      const dataLen = entry.data.length

      offsets.push(currentOffset)

      // Local Header (30 bytes + name length)
      const localHeader = new Uint8Array(30 + nameBytes.length)
      const view = new DataView(localHeader.buffer)
      view.setUint32(0, 0x04034b50, true) // Local header signature
      view.setUint16(4, 20, true) // Version needed (2.0)
      view.setUint16(6, 0x0800, true) // Flags (UTF-8 filename)
      view.setUint16(8, 0, true) // Compression: none (store)
      view.setUint16(10, dosTime, true)
      view.setUint16(12, dosDate, true)
      view.setUint32(14, entry.crc, true)
      view.setUint32(18, dataLen, true) // Compressed size
      view.setUint32(22, dataLen, true) // Uncompressed size
      view.setUint16(26, nameBytes.length, true)
      view.setUint16(28, 0, true) // Extra field length
      localHeader.set(nameBytes, 30)

      localHeadersAndData.push(localHeader)
      localHeadersAndData.push(entry.data)

      currentOffset += localHeader.length + dataLen
    }

    const centralDirStartOffset = currentOffset
    let centralDirSize = 0

    // Central Directory Headers
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]
      const offset = offsets[i]
      const nameBytes = encoder.encode(entry.name)
      const { time: dosTime, date: dosDate } = dateToDosDateTime(entry.date)
      const dataLen = entry.data.length

      const cdHeader = new Uint8Array(46 + nameBytes.length)
      const view = new DataView(cdHeader.buffer)
      view.setUint32(0, 0x02014b50, true) // Central dir signature
      view.setUint16(4, 20, true) // Version made by
      view.setUint16(6, 20, true) // Version needed
      view.setUint16(8, 0x0800, true) // Flags (UTF-8)
      view.setUint16(10, 0, true) // Compression: store
      view.setUint16(12, dosTime, true)
      view.setUint16(14, dosDate, true)
      view.setUint32(16, entry.crc, true)
      view.setUint32(20, dataLen, true)
      view.setUint32(24, dataLen, true)
      view.setUint16(28, nameBytes.length, true)
      view.setUint16(30, 0, true) // Extra field len
      view.setUint16(32, 0, true) // Comment len
      view.setUint16(34, 0, true) // Disk start
      view.setUint16(36, 0, true) // Internal attrs
      view.setUint32(38, 0, true) // External attrs
      view.setUint32(42, offset, true) // Offset of local header
      cdHeader.set(nameBytes, 46)

      centralDirectoryHeaders.push(cdHeader)
      centralDirSize += cdHeader.length
    }

    // End of Central Directory Record (22 bytes)
    const eocd = new Uint8Array(22)
    const eocdView = new DataView(eocd.buffer)
    eocdView.setUint32(0, 0x06054b50, true) // EOCD signature
    eocdView.setUint16(4, 0, true) // Disk number
    eocdView.setUint16(6, 0, true) // Central dir disk
    eocdView.setUint16(8, this.entries.length, true) // Entries on this disk
    eocdView.setUint16(10, this.entries.length, true) // Total entries
    eocdView.setUint32(12, centralDirSize, true)
    eocdView.setUint32(16, centralDirStartOffset, true)
    eocdView.setUint16(20, 0, true) // Comment length

    // Assemble final buffer
    const totalSize = currentOffset + centralDirSize + 22
    const output = new Uint8Array(totalSize)
    let pos = 0

    for (const chunk of localHeadersAndData) {
      output.set(chunk, pos)
      pos += chunk.length
    }
    for (const chunk of centralDirectoryHeaders) {
      output.set(chunk, pos)
      pos += chunk.length
    }
    output.set(eocd, pos)

    return output
  }

  public buildBlob(): Blob {
    const bytes = this.buildUint8Array()
    return new Blob([bytes], { type: 'application/zip' })
  }
}
