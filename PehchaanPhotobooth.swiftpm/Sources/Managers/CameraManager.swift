import Foundation
import SwiftUI
import Combine

#if canImport(AVFoundation)
import AVFoundation
#endif

#if canImport(UIKit)
import UIKit
public typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
public typealias PlatformImage = NSImage
#endif

@MainActor
public final class CameraManager: NSObject, ObservableObject {
    @Published public var isReady: Bool = true
    @Published public var isCapturing: Bool = false
    @Published public var countdownValue: Int = 0
    @Published public var capturedImages: [PlatformImage] = []
    @Published public var currentShotIndex: Int = 0
    @Published public var targetShotCount: Int = 2
    @Published public var cameraPermissionGranted: Bool = true

    public override init() {
        super.init()
    }

    public func configureForSession(shotCount: Int) {
        self.targetShotCount = shotCount
        self.capturedImages = []
        self.currentShotIndex = 0
        self.isCapturing = false
    }

    public func addSampleShot(index: Int) {
        #if canImport(UIKit)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 1000))
        let img = renderer.image { ctx in
            let colors: [UIColor] = [
                UIColor(red: 0.85, green: 0.45, blue: 0.25, alpha: 1.0),
                UIColor(red: 0.25, green: 0.55, blue: 0.75, alpha: 1.0),
                UIColor(red: 0.45, green: 0.65, blue: 0.35, alpha: 1.0)
            ]
            let color = colors[index % colors.count]
            color.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 800, height: 1000))

            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 48, weight: .bold),
                .foregroundColor: UIColor.white
            ]
            let str = "SHOT \(index + 1)"
            (str as NSString).draw(at: CGPoint(x: 300, y: 460), withAttributes: attrs)
        }
        self.capturedImages.append(img)
        #endif
    }

    public func reset() {
        self.capturedImages = []
        self.currentShotIndex = 0
        self.isCapturing = false
        self.countdownValue = 0
    }
}
