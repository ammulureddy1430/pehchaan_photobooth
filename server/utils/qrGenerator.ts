/**
 * Lightweight, zero-dependency QR Code Generator for Server (ISO/IEC 18004 compliant subset).
 * Generates clean SVG markup or SVG data URLs for URL and text payloads.
 */

// GF(256) Galois Field operations with primitive polynomial 0x11D (285)
const GF_EXP: number[] = new Array(512)
const GF_LOG: number[] = new Array(256)

;(function initGF() {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_EXP[i + 255] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 256) {
      x ^= 0x11d
    }
  }
  GF_LOG[0] = 0
})()

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0
  return GF_EXP[GF_LOG[x] + GF_LOG[y]]
}

function gfPolyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0)
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j])
    }
  }
  return result
}

function getGeneratorPoly(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    poly = gfPolyMul(poly, [1, GF_EXP[i]])
  }
  return poly
}

function calculateECC(data: number[], eccLength: number): number[] {
  const gen = getGeneratorPoly(eccLength)
  const info = data.concat(new Array(eccLength).fill(0))

  for (let i = 0; i < data.length; i++) {
    const lead = info[i]
    if (lead !== 0) {
      for (let j = 0; j < gen.length; j++) {
        info[i + j] ^= gfMul(gen[j], lead)
      }
    }
  }

  return info.slice(data.length)
}

// Version specifications (Versions 1 to 6 - capable of URLs up to ~130 chars with Level M ECC)
interface VersionSpec {
  version: number
  totalCodewords: number
  eccCodewords: number
  blocks: { count: number; dataCodewords: number }[]
  alignmentPatterns: number[]
}

const VERSION_SPECS: VersionSpec[] = [
  // Version 1 (21x21)
  { version: 1, totalCodewords: 26, eccCodewords: 10, blocks: [{ count: 1, dataCodewords: 16 }], alignmentPatterns: [] },
  // Version 2 (25x25)
  { version: 2, totalCodewords: 44, eccCodewords: 16, blocks: [{ count: 1, dataCodewords: 28 }], alignmentPatterns: [6, 18] },
  // Version 3 (29x29)
  { version: 3, totalCodewords: 70, eccCodewords: 26, blocks: [{ count: 1, dataCodewords: 44 }], alignmentPatterns: [6, 22] },
  // Version 4 (33x33)
  { version: 4, totalCodewords: 100, eccCodewords: 36, blocks: [{ count: 2, dataCodewords: 32 }], alignmentPatterns: [6, 26] },
  // Version 5 (37x37)
  { version: 5, totalCodewords: 134, eccCodewords: 48, blocks: [{ count: 2, dataCodewords: 43 }], alignmentPatterns: [6, 30] },
  // Version 6 (41x41)
  { version: 6, totalCodewords: 172, eccCodewords: 64, blocks: [{ count: 4, dataCodewords: 27 }], alignmentPatterns: [6, 34] },
]

function getBestVersion(dataLength: number): VersionSpec {
  const neededBytes = dataLength + 2
  for (const spec of VERSION_SPECS) {
    let totalData = 0
    for (const b of spec.blocks) {
      totalData += b.count * b.dataCodewords
    }
    if (totalData >= neededBytes) {
      return spec
    }
  }
  return VERSION_SPECS[VERSION_SPECS.length - 1]
}

export class QrCodeMatrix {
  public readonly versionSpec: VersionSpec
  public readonly size: number
  public readonly modules: boolean[][]
  private isFunction: boolean[][]

  constructor(versionSpec: VersionSpec) {
    this.versionSpec = versionSpec
    this.size = versionSpec.version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
  }

  public setFunction(r: number, c: number, val: boolean) {
    this.modules[r][c] = val
    this.isFunction[r][c] = true
  }

  public isFunc(r: number, c: number): boolean {
    return this.isFunction[r][c]
  }
}

function buildFinderPattern(matrix: QrCodeMatrix, top: number, left: number) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isBlack =
        r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      matrix.setFunction(top + r, left + c, isBlack)
    }
  }
  // Separators
  for (let i = 0; i < 8; i++) {
    if (top + 7 < matrix.size && left + i < matrix.size) matrix.setFunction(top + 7, left + i, false)
    if (top + i < matrix.size && left + 7 < matrix.size) matrix.setFunction(top + i, left + 7, false)
    if (top - 1 >= 0 && left + i < matrix.size) matrix.setFunction(top - 1, left + i, false)
    if (top + i < matrix.size && left - 1 >= 0) matrix.setFunction(top + i, left - 1, false)
  }
}

function buildAlignmentPattern(matrix: QrCodeMatrix, centerR: number, centerC: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)
      matrix.setFunction(centerR + r, centerC + c, isBlack)
    }
  }
}

function addTimingPatterns(matrix: QrCodeMatrix) {
  for (let i = 8; i < matrix.size - 8; i++) {
    if (!matrix.isFunc(6, i)) matrix.setFunction(6, i, i % 2 === 0)
    if (!matrix.isFunc(i, 6)) matrix.setFunction(i, 6, i % 2 === 0)
  }
  // Dark module
  matrix.setFunction(matrix.size - 8, 8, true)
}

function encodeData(text: string, spec: VersionSpec): number[] {
  const bytes: number[] = Array.from(Buffer.from(text, 'utf-8'))

  const bitBuffer: number[] = []
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1)
    }
  }

  pushBits(0b0100, 4)
  pushBits(bytes.length, 8)
  for (const b of bytes) {
    pushBits(b, 8)
  }

  let totalDataCapacity = 0
  for (const blk of spec.blocks) {
    totalDataCapacity += blk.count * blk.dataCodewords
  }
  const totalBits = totalDataCapacity * 8

  const termLen = Math.min(4, totalBits - bitBuffer.length)
  for (let i = 0; i < termLen; i++) bitBuffer.push(0)

  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0)

  const codewords: number[] = []
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let byteVal = 0
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitBuffer[i + b]
    }
    codewords.push(byteVal)
  }

  const padPatterns = [0xec, 0x11]
  let padIdx = 0
  while (codewords.length < totalDataCapacity) {
    codewords.push(padPatterns[padIdx % 2])
    padIdx++
  }

  const dataBlocks: number[][] = []
  const eccBlocks: number[][] = []
  let offset = 0
  const eccPerBlock = Math.floor(spec.eccCodewords / spec.blocks.reduce((s, b) => s + b.count, 0))

  for (const b of spec.blocks) {
    for (let c = 0; c < b.count; c++) {
      const blkData = codewords.slice(offset, offset + b.dataCodewords)
      offset += b.dataCodewords
      dataBlocks.push(blkData)
      eccBlocks.push(calculateECC(blkData, eccPerBlock))
    }
  }

  const interleaved: number[] = []
  const maxDataLen = Math.max(...dataBlocks.map((d) => d.length))
  for (let i = 0; i < maxDataLen; i++) {
    for (const d of dataBlocks) {
      if (i < d.length) interleaved.push(d[i])
    }
  }

  for (let i = 0; i < eccPerBlock; i++) {
    for (const e of eccBlocks) {
      if (i < e.length) interleaved.push(e[i])
    }
  }

  return interleaved
}

const FORMAT_INFO_M_MASK0 = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0]

function placeData(matrix: QrCodeMatrix, codewords: number[]) {
  const bits: number[] = []
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) {
      bits.push((cw >> b) & 1)
    }
  }

  let bitIdx = 0
  let right = matrix.size - 1
  let upward = true

  while (right > 0) {
    if (right === 6) right--

    for (let step = 0; step < matrix.size; step++) {
      const r = upward ? matrix.size - 1 - step : step

      for (let c = 0; c < 2; c++) {
        const col = right - c
        if (!matrix.isFunc(r, col)) {
          let bit = 0
          if (bitIdx < bits.length) {
            bit = bits[bitIdx++]
          }
          const mask = (r + col) % 2 === 0
          matrix.modules[r][col] = (bit ^ (mask ? 1 : 0)) === 1
        }
      }
    }
    right -= 2
    upward = !upward
  }
}

function applyFormatInfo(matrix: QrCodeMatrix) {
  const bits = FORMAT_INFO_M_MASK0
  const size = matrix.size

  for (let i = 0; i < 6; i++) matrix.setFunction(8, i, bits[i] === 1)
  matrix.setFunction(8, 7, bits[6] === 1)
  matrix.setFunction(8, 8, bits[7] === 1)
  matrix.setFunction(7, 8, bits[8] === 1)
  for (let i = 0; i < 6; i++) matrix.setFunction(5 - i, 8, bits[9 + i] === 1)

  for (let i = 0; i < 7; i++) matrix.setFunction(size - 1 - i, 8, bits[i] === 1)
  for (let i = 0; i < 8; i++) matrix.setFunction(8, size - 8 + i, bits[7 + i] === 1)
}

export function generateQrMatrix(text: string): boolean[][] {
  const spec = getBestVersion(text.length)
  const matrix = new QrCodeMatrix(spec)

  buildFinderPattern(matrix, 0, 0)
  buildFinderPattern(matrix, 0, matrix.size - 7)
  buildFinderPattern(matrix, matrix.size - 7, 0)

  if (spec.alignmentPatterns.length > 0) {
    const coords = spec.alignmentPatterns
    for (const r of coords) {
      for (const c of coords) {
        if (
          (r === 6 && c === 6) ||
          (r === 6 && c === coords[coords.length - 1] && coords.length === 2 && matrix.isFunc(0, matrix.size - 7)) ||
          (r === coords[coords.length - 1] && c === 6 && coords.length === 2 && matrix.isFunc(matrix.size - 7, 0))
        ) {
          continue
        }
        if (!matrix.isFunc(r, c)) {
          buildAlignmentPattern(matrix, r, c)
        }
      }
    }
  }

  addTimingPatterns(matrix)
  applyFormatInfo(matrix)
  const codewords = encodeData(text, spec)
  placeData(matrix, codewords)

  return matrix.modules
}

export function generateQrSvg(text: string, options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}): string {
  const modules = generateQrMatrix(text)
  const moduleCount = modules.length
  const margin = options.margin ?? 4
  const fgColor = options.fgColor || '#000000'
  const bgColor = options.bgColor || '#ffffff'
  const totalSize = moduleCount + margin * 2

  const rects: string[] = []
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (modules[r][c]) {
        rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${fgColor}" />`)
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${bgColor}" />
  ${rects.join('\n  ')}
</svg>`
}

export function generateQrDataUrl(text: string, options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}): string {
  const svg = generateQrSvg(text, options)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
