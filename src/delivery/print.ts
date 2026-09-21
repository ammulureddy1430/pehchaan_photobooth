import { getDerived, compositionDerivedId, getCompletedSession, getPhotosByIds } from '../lib/photoStore'
import type { PrintRequest, PrintResult } from './types'

/**
 * Service for photo printing.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, printing is handled via a dedicated hidden iframe and standard browser print dialog.
 * In the final native iPadOS application, this service will map directly to AirPrint
 * via UIPrintInteractionController.shared.
 */
export class PrintService {
  /**
   * Triggers printing of the composed photo strip for a session.
   * Printing never deletes or modifies the local photo records.
   */
  public async printSession(request: PrintRequest, enabled: boolean = true): Promise<PrintResult> {
    const { sessionId } = request

    if (!enabled) {
      return {
        success: false,
        status: 'DISABLED',
        error: 'Printing is disabled in the current Event Pack.',
      }
    }

    if (!sessionId) {
      return {
        success: false,
        status: 'FAILED',
        error: 'sessionId is required for printing.',
      }
    }

    try {
      // Retrieve the composed photo strip or raw photo from IndexedDB
      let printBlob: Blob | null = null
      const compDerived = await getDerived(compositionDerivedId(sessionId))
      if (compDerived && compDerived.blob instanceof Blob) {
        printBlob = compDerived.blob
      } else {
        const completedRecord = await getCompletedSession(sessionId)
        if (completedRecord?.photoIds && completedRecord.photoIds.length > 0) {
          const photos = await getPhotosByIds(completedRecord.photoIds)
          if (photos.length > 0 && photos[0].original instanceof Blob) {
            printBlob = photos[0].original
          }
        }
      }


      if (!printBlob) {
        return {
          success: false,
          status: 'FAILED',
          error: `Photo not found for session ${sessionId}.`,
        }
      }

      // Execute browser-compatible print
      await this.executeBrowserPrint(printBlob, sessionId)


      return {
        success: true,
        status: 'COMPLETED',
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        status: 'FAILED',
        error: `Print failed: ${errorMsg}`,
      }
    }
  }

  private executeBrowserPrint(blob: Blob, sessionId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        // Node.js test environment
        resolve()
        return
      }

      try {
        const imageUrl = URL.createObjectURL(blob)
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'

        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document
        if (!doc) {
          URL.revokeObjectURL(imageUrl)
          document.body.removeChild(iframe)
          resolve()
          return
        }

        doc.open()
        doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>Pehchaan Print - ${sessionId}</title>
  <style>
    @page { margin: 0; size: auto; }
    body { margin: 0; display: flex; align-items: center; justify-content: center; background: #fff; }
    img { max-width: 100%; height: auto; display: block; }
  </style>
</head>
<body>
  <img src="${imageUrl}" alt="Pehchaan Print" onload="window.print();" />
</body>
</html>`)
        doc.close()

        // Clean up after print dialog finishes or times out
        setTimeout(() => {
          try {
            document.body.removeChild(iframe)
            URL.revokeObjectURL(imageUrl)
          } catch {
            // Ignore cleanup errors
          }
          resolve()
        }, 2000)
      } catch (err) {
        console.error('[PrintService] Browser print execution error:', err)
        resolve()
      }
    })
  }
}

export const printService = new PrintService()
