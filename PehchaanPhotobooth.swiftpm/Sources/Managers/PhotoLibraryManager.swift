import Foundation
import SwiftUI
#if canImport(Photos)
import Photos
#endif
#if canImport(UIKit)
import UIKit
#endif

@MainActor
public final class PhotoLibraryManager: ObservableObject {
    @Published public var lastSavedStatus: String? = nil
    @Published public var isSaving: Bool = false

    public init() {}

    public func saveImageToPhotos(_ image: PlatformImage) async -> Bool {
        self.isSaving = true
        defer { self.isSaving = false }

        #if canImport(UIKit) && canImport(Photos)
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            self.lastSavedStatus = "Photos permission denied"
            return false
        }

        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }) { success, error in
                Task { @MainActor in
                    if success {
                        self.lastSavedStatus = "Saved to Photos"
                        continuation.resume(returning: true)
                    } else {
                        self.lastSavedStatus = error?.localizedDescription ?? "Failed to save"
                        continuation.resume(returning: false)
                    }
                }
            }
        }
        #else
        self.lastSavedStatus = "Photos library not available on platform"
        return true
        #endif
    }
}
