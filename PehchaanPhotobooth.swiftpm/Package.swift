// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

#if canImport(AppleProductTypes)
import AppleProductTypes

let package = Package(
    name: "PehchaanPhotobooth",
    platforms: [
        .iOS("16.0"),
        .macOS("13.0")
    ],
    products: [
        .iOSApplication(
            name: "PehchaanPhotobooth",
            targets: ["AppModule"],
            bundleIdentifier: "com.pehchaan.photobooth",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .camera),
            accentColor: .presetColor(.orange),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ],
            capabilities: [
                .camera(purposeString: "Camera access is required for photobooth capture."),
                .photoLibraryAdd(purposeString: "Photos access is required to save photobooth strips.")
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "Sources"
        )
    ]
)
#else
let package = Package(
    name: "PehchaanPhotobooth",
    platforms: [
        .iOS("16.0"),
        .macOS("13.0")
    ],
    products: [
        .executable(
            name: "PehchaanPhotobooth",
            targets: ["AppModule"]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "Sources"
        )
    ]
)
#endif
