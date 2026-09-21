import { SimpleZip } from './zip'
import {
  listCompletedSessions,
  getPhoto,
  getDerived,
  compositionDerivedId,
} from './photoStore'
import type { CompletedSessionRecord } from '../sync/types'

/**
 * Staff Export Service for kiosk photo sessions.
 *
 * Output ZIP structure:
 * - index.csv
 * - sessions/{sessionId}/original_1.jpg
 * - sessions/{sessionId}/thumb_1.jpg
 * - sessions/{sessionId}/composition.jpg
 * - sessions/{sessionId}/metadata.json
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, export triggers a browser zip download.
 *
 * Native iPadOS Mapping:
 * UIActivityViewController (AirDrop, Save to Files app, External USB-C drive export).
 */

export interface ExportFilterOptions {
  eventId?: string
  includeTestSessions?: boolean
  includeDeletedSessions?: boolean
  prioritizeUnsynced?: boolean
}

export interface ExportResult {
  success: boolean
  totalSessionsExported: number
  totalPhotosExported: number
  zipBlob?: Blob
  zipBytes?: Uint8Array
  csvContent?: string
  filename?: string
  error?: string
}

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return ''
  const str = String(field)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function generateStaffExportZip(
  options: ExportFilterOptions = {}
): Promise<ExportResult> {
  try {
    const allSessions = await listCompletedSessions()

    // 1. Apply default filters
    let filtered = allSessions.filter((session) => {
      // Exclude test sessions by default
      if (!options.includeTestSessions && session.kind === 'test') {
        return false
      }
      // Exclude deleted sessions by default
      const isDeleted = Boolean((session as CompletedSessionRecord & { deletedAt?: number }).deletedAt)
      if (!options.includeDeletedSessions && isDeleted) {
        return false
      }
      // Filter by eventId if provided
      if (options.eventId && session.packId && session.packId !== options.eventId) {
        return false
      }
      return true
    })

    // 2. Prioritize unsynced sessions if requested
    if (options.prioritizeUnsynced !== false) {
      filtered = filtered.sort((a, b) => {
        const aSynced = a.syncedAt ? 1 : 0
        const bSynced = b.syncedAt ? 1 : 0
        return aSynced - bSynced // unsynced (0) first
      })
    }

    const zip = new SimpleZip()
    let totalPhotosExported = 0

    // 3. Build CSV index rows
    const csvHeaders = ['sessionId', 'createdAt', 'mode', 'photoCount', 'isSynced', 'syncedAt', 'galleryUrl', 'kind']
    const csvRows: string[] = [csvHeaders.join(',')]

    for (const session of filtered) {
      const isSynced = Boolean(session.syncedAt)
      const row = [
        escapeCsvField(session.id),
        escapeCsvField(session.createdAt),
        escapeCsvField(session.mode),
        escapeCsvField(session.photoIds?.length || 0),
        escapeCsvField(isSynced),
        escapeCsvField(session.syncedAt || ''),
        escapeCsvField(session.galleryUrl || ''),
        escapeCsvField(session.kind),
      ]
      csvRows.push(row.join(','))

      // 4. Add session metadata.json
      const metaJson = JSON.stringify(session, null, 2)
      zip.addFile(`sessions/${session.id}/metadata.json`, metaJson)

      // 5. Add original and thumbnail photos
      if (Array.isArray(session.photoIds)) {
        for (let i = 0; i < session.photoIds.length; i++) {
          const photoId = session.photoIds[i]
          if (!photoId) continue
          const photoRecord = await getPhoto(photoId)
          if (photoRecord && photoRecord.original instanceof Blob) {
            const origBuffer = await photoRecord.original.arrayBuffer()
            zip.addFile(
              `sessions/${session.id}/${photoRecord.originalName || `original_${i + 1}.jpg`}`,
              new Uint8Array(origBuffer)
            )
            totalPhotosExported++
          }
          if (photoRecord && photoRecord.thumbnail instanceof Blob) {
            const thumbBuffer = await photoRecord.thumbnail.arrayBuffer()
            zip.addFile(
              `sessions/${session.id}/${photoRecord.thumbnailName || `thumb_${i + 1}.jpg`}`,
              new Uint8Array(thumbBuffer)
            )
          }
        }
      }

      // 6. Add composed print strip if present
      const compDerived = await getDerived(compositionDerivedId(session.id))
      if (compDerived && compDerived.blob instanceof Blob) {
        const compBuffer = await compDerived.blob.arrayBuffer()
        zip.addFile(`sessions/${session.id}/composition.jpg`, new Uint8Array(compBuffer))
      }
    }

    // 7. Add index.csv at root
    const csvContent = csvRows.join('\n')
    zip.addFile('index.csv', csvContent)

    const zipBytes = zip.buildUint8Array()
    const zipBlob = zip.buildBlob()
    const filename = `pehchaan_export_${options.eventId || 'all'}_${Date.now()}.zip`

    return {
      success: true,
      totalSessionsExported: filtered.length,
      totalPhotosExported,
      zipBlob,
      zipBytes,
      csvContent,
      filename,
    }
  } catch (err) {
    return {
      success: false,
      totalSessionsExported: 0,
      totalPhotosExported: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function triggerStaffExportDownload(options: ExportFilterOptions = {}): Promise<ExportResult> {
  const result = await generateStaffExportZip(options)
  if (!result.success || !result.zipBlob) {
    return result
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(result.zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename || `pehchaan_export_${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return result
}
