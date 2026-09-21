import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

public enum PrintStatus: Equatable, Sendable {
    case idle
    case preparing
    case completed
    case cancelled
    case failed(String)
    case unavailable(String)
}

@MainActor
public final class PrintManager: ObservableObject {
    public static let shared = PrintManager()

    @Published public var status: PrintStatus = .idle
    @Published public var isPrinting: Bool = false
    @Published public var statusMessage: String? = nil

    public init() {}

    /// Initiates native iPadOS AirPrint for the composed photo
    public func printImage(_ image: PlatformImage, jobName: String = "Pehchaan Photobooth") async -> Bool {
        #if canImport(UIKit)
        guard UIPrintInteractionController.isPrintingAvailable else {
            self.status = .unavailable("AirPrint is not available on this device")
            self.statusMessage = "AirPrint unavailable on device"
            return false
        }

        let printController = UIPrintInteractionController.shared
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .photo
        printInfo.jobName = jobName
        printInfo.duplex = .none

        printController.printInfo = printInfo
        printController.showsNumberOfCopies = true
        printController.showsPageRange = false
        printController.printingItem = image

        self.isPrinting = true
        self.status = .preparing
        self.statusMessage = nil

        return await withCheckedContinuation { continuation in
            let completionHandler: UIPrintInteractionController.CompletionHandler = { controller, completed, error in
                Task { @MainActor in
                    self.isPrinting = false
                    if completed {
                        self.status = .completed
                        self.statusMessage = "Sent to printer!"
                        continuation.resume(returning: true)
                    } else if let error = error {
                        let errMsg = error.localizedDescription
                        self.status = .failed(errMsg)
                        self.statusMessage = "Print failed: \(errMsg)"
                        continuation.resume(returning: false)
                    } else {
                        // User dismissed/cancelled printer picker
                        self.status = .cancelled
                        self.statusMessage = "Print cancelled"
                        continuation.resume(returning: false)
                    }
                }
            }

            // Correctly present on iPadOS using popover from active window
            if UIDevice.current.userInterfaceIdiom == .pad {
                if let windowScene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first(where: { $0.activationState == .foregroundActive }),
                   let keyWindow = windowScene.windows.first(where: { $0.isKeyWindow }),
                   let rootVC = keyWindow.rootViewController {
                    let targetRect = CGRect(x: keyWindow.bounds.midX - 1, y: keyWindow.bounds.midY - 1, width: 2, height: 2)
                    printController.present(from: targetRect, in: rootVC.view, animated: true, completionHandler: completionHandler)
                } else if let keyWindow = UIApplication.shared.windows.first(where: { $0.isKeyWindow }),
                          let rootVC = keyWindow.rootViewController {
                    let targetRect = CGRect(x: keyWindow.bounds.midX - 1, y: keyWindow.bounds.midY - 1, width: 2, height: 2)
                    printController.present(from: targetRect, in: rootVC.view, animated: true, completionHandler: completionHandler)
                } else {
                    printController.present(animated: true, completionHandler: completionHandler)
                }
            } else {
                printController.present(animated: true, completionHandler: completionHandler)
            }
        }
        #elseif canImport(AppKit)
        // macOS AppKit compilation support
        self.status = .unavailable("AirPrint is designed for iPadOS/iOS")
        self.statusMessage = "AirPrint unavailable on macOS"
        return false
        #else
        self.status = .unavailable("Printing is not available on this platform")
        self.statusMessage = "Printing unavailable"
        return false
        #endif
    }

    public func reset() {
        self.status = .idle
        self.isPrinting = false
        self.statusMessage = nil
    }
}
