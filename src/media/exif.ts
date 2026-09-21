/**
 * EXIF & GPS metadata sanitization utilities for Pehchaan Photobooth media pipeline.
 *
 * Requirements:
 * - Strip all GPS / location metadata from original, thumbnail, and composed JPEGs.
 * - Never store or leak device coordinates, altitude, speed, or location timestamps.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this browser prototype, JPEG sanitization parses and strips APP1 EXIF GPS IFD blocks
 * and cleans canvas-generated JPEG streams.
 *
 * Native iPadOS Mapping:
 * CGImageDestination / CIContext with kCGImagePropertyGPSDictionary omitted or nil.
 */

// GPS IFD tag in Exif TIFF header is 0x8825 (34853)
const GPS_TAG_HIGH = 0x88
const GPS_TAG_LOW = 0x25

/**
 * Checks if a JPEG binary buffer contains EXIF GPS metadata.
 */
export function hasExifGps(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false
  }

  let offset = 2
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xff) {
      break
    }
    const marker = bytes[offset + 1]

    // Standalone markers
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }

    // SOS (Start of Scan) - image entropy data begins
    if (marker === 0xda) {
      break
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2 || offset + 2 + length > bytes.length) {
      break
    }

    // APP1 marker (0xFFE1) -> Exif
    if (marker === 0xe1) {
      const segment = bytes.subarray(offset + 4, offset + 2 + length)
      // Check for Exif header "Exif\0\0"
      if (
        segment.length > 6 &&
        segment[0] === 0x45 &&
        segment[1] === 0x78 &&
        segment[2] === 0x69 &&
        segment[3] === 0x66 &&
        segment[4] === 0x00 &&
        segment[5] === 0x00
      ) {
        // Search for GPS IFD pointer (0x8825) or "GPS" ASCII string in APP1 block
        for (let i = 6; i < segment.length - 1; i++) {
          if (
            (segment[i] === GPS_TAG_HIGH && segment[i + 1] === GPS_TAG_LOW) ||
            (segment[i] === 0x47 && segment[i + 1] === 0x50 && segment[i + 2] === 0x53)
          ) {
            return true
          }
        }
      }
    }

    offset += 2 + length
  }

  return false
}

/**
 * Strips EXIF GPS metadata from a JPEG byte buffer.
 * If APP1 contains GPS metadata, it rewrites the JPEG without the GPS tags.
 */
export function stripExifGps(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes
  }

  const cleanChunks: Uint8Array[] = [bytes.subarray(0, 2)] // SOI
  let offset = 2
  let modified = false

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      cleanChunks.push(bytes.subarray(offset))
      break
    }
    const marker = bytes[offset + 1]

    if (marker === 0xda) {
      // SOS: remainder is compressed image data
      cleanChunks.push(bytes.subarray(offset))
      break
    }

    if (marker === 0xd9) {
      // EOI
      cleanChunks.push(bytes.subarray(offset, offset + 2))
      break
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2 || offset + 2 + length > bytes.length) {
      cleanChunks.push(bytes.subarray(offset))
      break
    }

    // Check if APP1 (0xFFE1)
    if (marker === 0xe1) {
      const segment = bytes.subarray(offset + 4, offset + 2 + length)
      const isExif =
        segment.length > 6 &&
        segment[0] === 0x45 &&
        segment[1] === 0x78 &&
        segment[2] === 0x69 &&
        segment[3] === 0x66 &&
        segment[4] === 0x00 &&
        segment[5] === 0x00

      if (isExif) {
        // Strip APP1 containing GPS to guarantee zero location leakage
        modified = true
        offset += 2 + length
        continue
      }
    }

    cleanChunks.push(bytes.subarray(offset, offset + 2 + length))
    offset += 2 + length
  }

  if (!modified) {
    return bytes
  }

  let totalLength = 0
  for (const chunk of cleanChunks) {
    totalLength += chunk.length
  }
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const chunk of cleanChunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

/**
 * Sanitizes a JPEG Blob by stripping all GPS and location metadata.
 */
export async function sanitizeJpegBlob(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const cleanBytes = stripExifGps(bytes)
  return new Blob([cleanBytes], { type: 'image/jpeg' })
}
