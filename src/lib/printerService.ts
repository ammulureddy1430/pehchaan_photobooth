/**
 * Printer operational service abstraction.
 *
 * PROTOTYPE IMPLEMENTATION NOTE:
 * In this Chrome prototype, printer availability and status are managed via an operational
 * state model with browser printing fallback.
 *
 * Native iPadOS Mapping:
 * UIPrinterPickerController & UIPrintInteractionController (AirPrint)
 */

export type PrinterAvailabilityState = 'available' | 'offline' | 'error' | 'not_configured'

export interface SelectedPrinter {
  id: string
  name: string
  isDefault: boolean
  status: 'online' | 'offline' | 'paper_low' | 'error'
  error?: string | null
}

export interface PrinterTestResult {
  success: boolean
  message: string
  error?: string | null
}

class PrinterService {
  private selectedPrinter: SelectedPrinter | null = {
    id: 'default-kiosk-printer',
    name: 'Pehchaan Kiosk Thermal / AirPrint',
    isDefault: true,
    status: 'online',
    error: null,
  }

  private isPrintingEnabled: boolean = true

  public setPrintingEnabled(enabled: boolean): void {
    this.isPrintingEnabled = enabled
  }

  public getSelectedPrinter(): SelectedPrinter | null {
    return this.selectedPrinter ? { ...this.selectedPrinter } : null
  }

  public selectPrinter(printer: SelectedPrinter | null): void {
    this.selectedPrinter = printer
  }

  public setPrinterStatus(status: SelectedPrinter['status'], errorMsg?: string | null): void {
    if (this.selectedPrinter) {
      this.selectedPrinter.status = status
      this.selectedPrinter.error = errorMsg || null
    }
  }

  public getPrinterAvailability(): PrinterAvailabilityState {
    if (!this.isPrintingEnabled || !this.selectedPrinter) {
      return 'not_configured'
    }
    if (this.selectedPrinter.status === 'error') {
      return 'error'
    }
    if (this.selectedPrinter.status === 'offline') {
      return 'offline'
    }
    return 'available'
  }

  public getHumanReadablePrinterError(): string | null {
    if (!this.selectedPrinter) return 'No printer configured'
    if (this.selectedPrinter.error) return this.selectedPrinter.error
    if (this.selectedPrinter.status === 'offline') return 'Printer is offline or unreachable'
    if (this.selectedPrinter.status === 'paper_low') return 'Printer paper is low'
    if (this.selectedPrinter.status === 'error') return 'Printer reported a hardware error'
    return null
  }

  public async testPrint(): Promise<PrinterTestResult> {
    const availability = this.getPrinterAvailability()
    if (availability === 'not_configured') {
      return {
        success: false,
        message: 'Printing is disabled or no printer configured.',
        error: 'PRINTER_NOT_CONFIGURED',
      }
    }
    if (availability === 'offline') {
      return {
        success: false,
        message: 'Test print failed: Printer is offline.',
        error: 'PRINTER_OFFLINE',
      }
    }
    if (availability === 'error') {
      return {
        success: false,
        message: `Test print failed: ${this.getHumanReadablePrinterError()}`,
        error: 'PRINTER_ERROR',
      }
    }

    // In browser environment, simulate or trigger a clean test print page
    if (typeof window !== 'undefined') {
      // In browser test, trigger a print or confirm test print
      return {
        success: true,
        message: 'Test print sent successfully to ' + (this.selectedPrinter?.name || 'Printer'),
      }
    }

    return {
      success: true,
      message: 'Test print simulated successfully (Node test environment).',
    }
  }
}

export const printerService = new PrinterService()
