import Foundation
import SwiftUI

// MARK: - EventPack Core Model

public struct EventPack: Codable, Identifiable, Sendable {
    public let id: String
    public let version: String
    public let eventName: String
    public let language: String
    public let shotCount: Int
    public let betweenShotPauseMs: Int
    public let mirrorOutput: Bool
    public let blackAndWhiteEnabled: Bool
    public let sepiaEnabled: Bool
    public let whatsappEnabled: Bool
    public let emailEnabled: Bool
    public let cloudQrEnabled: Bool
    public let printEnabled: Bool
    public let schoolMode: Bool?
    public let consentMode: String?
    public let consentTextEn: String?
    public let consentTextHi: String?
    public let privacyNoticeText: String?
    public let retentionHours: Int?
    public let publicGalleryEnabled: Bool?
    public let schoolName: String?
    public let schoolLogoUrl: String?
    public let accentColor: String?
    public let primaryColor: String?
    public let secondaryColor: String?
    public let backgroundColor: String?
    public let eventSubtitle: String?
    public let countdownSeconds: Int?
    public let staffPin: String?
    public let composition: PackComposition
    public let singleShotComposition: PackComposition?
    public let cardBack: CardBackConfig?
    public let payment: PaymentConfig?
    public let branding: BrandingConfig?
    public let photoSettings: PhotoSettingsConfig?
    public let delivery: DeliveryConfig?
    public let privacy: PrivacyConfig?

    public init(
        id: String = "pack_default",
        version: String = "1.0.0",
        eventName: String = "Photobooth Event",
        language: String = "en",
        shotCount: Int = 2,
        betweenShotPauseMs: Int = 0,
        mirrorOutput: Bool = true,
        blackAndWhiteEnabled: Bool = true,
        sepiaEnabled: Bool = true,
        whatsappEnabled: Bool = false,
        emailEnabled: Bool = false,
        cloudQrEnabled: Bool = true,
        printEnabled: Bool = true,
        schoolMode: Bool? = true,
        consentMode: String? = "notice",
        consentTextEn: String? = nil,
        consentTextHi: String? = nil,
        privacyNoticeText: String? = "Privacy Notice: Photos taken during this session are saved privately.",
        retentionHours: Int? = 72,
        publicGalleryEnabled: Bool? = false,
        schoolName: String? = "Pehchaan Model Academy",
        schoolLogoUrl: String? = nil,
        accentColor: String? = "#d97706",
        primaryColor: String? = "#d97706",
        secondaryColor: String? = "#1c1b18",
        backgroundColor: String? = "#fffdf5",
        eventSubtitle: String? = "Annual Photobooth Experience",
        countdownSeconds: Int? = 3,
        staffPin: String? = "482917",
        composition: PackComposition,
        singleShotComposition: PackComposition? = nil,
        cardBack: CardBackConfig? = nil,
        payment: PaymentConfig? = nil,
        branding: BrandingConfig? = nil,
        photoSettings: PhotoSettingsConfig? = nil,
        delivery: DeliveryConfig? = nil,
        privacy: PrivacyConfig? = nil
    ) {
        self.id = id
        self.version = version
        self.eventName = eventName
        self.language = language
        self.shotCount = shotCount
        self.betweenShotPauseMs = betweenShotPauseMs
        self.mirrorOutput = mirrorOutput
        self.blackAndWhiteEnabled = blackAndWhiteEnabled
        self.sepiaEnabled = sepiaEnabled
        self.whatsappEnabled = whatsappEnabled
        self.emailEnabled = emailEnabled
        self.cloudQrEnabled = cloudQrEnabled
        self.printEnabled = printEnabled
        self.schoolMode = schoolMode
        self.consentMode = consentMode
        self.consentTextEn = consentTextEn
        self.consentTextHi = consentTextHi
        self.privacyNoticeText = privacyNoticeText
        self.retentionHours = retentionHours
        self.publicGalleryEnabled = publicGalleryEnabled
        self.schoolName = schoolName
        self.schoolLogoUrl = schoolLogoUrl
        self.accentColor = accentColor
        self.primaryColor = primaryColor
        self.secondaryColor = secondaryColor
        self.backgroundColor = backgroundColor
        self.eventSubtitle = eventSubtitle
        self.countdownSeconds = countdownSeconds
        self.staffPin = staffPin
        self.composition = composition
        self.singleShotComposition = singleShotComposition
        self.cardBack = cardBack
        self.payment = payment
        self.branding = branding
        self.photoSettings = photoSettings
        self.delivery = delivery
        self.privacy = privacy
    }
}

// MARK: - Composition Model

public struct PackComposition: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let width: Double
    public let height: Double
    public let background: String
    public let overlayEnabled: Bool
    public let slots: [PackSlot]
    public let texts: [PackText]

    public init(
        id: String = "comp-default",
        name: String = "Default Composition",
        width: Double = 400,
        height: Double = 1200,
        background: String = "#fffdf5",
        overlayEnabled: Bool = true,
        slots: [PackSlot] = [],
        texts: [PackText] = []
    ) {
        self.id = id
        self.name = name
        self.width = width
        self.height = height
        self.background = background
        self.overlayEnabled = overlayEnabled
        self.slots = slots
        self.texts = texts
    }
}

// MARK: - Slot Model

public struct PackSlot: Codable, Identifiable, Sendable {
    public let id: String
    public let shotNumber: Int
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public let fit: String
    public let effect: String?

    public init(
        id: String,
        shotNumber: Int,
        x: Double,
        y: Double,
        width: Double,
        height: Double,
        fit: String = "cover",
        effect: String? = "none"
    ) {
        self.id = id
        self.shotNumber = shotNumber
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.fit = fit
        self.effect = effect
    }
}

// MARK: - Text Model

public struct PackText: Codable, Identifiable, Sendable {
    public let id: String
    public let text: String
    public let x: Double
    public let y: Double
    public let font: String
    public let color: String
    public let align: String?
    public let baseline: String?

    public init(
        id: String,
        text: String,
        x: Double,
        y: Double,
        font: String = "500 16px sans-serif",
        color: String = "#d97706",
        align: String? = "center",
        baseline: String? = "middle"
    ) {
        self.id = id
        self.text = text
        self.x = x
        self.y = y
        self.font = font
        self.color = color
        self.align = align
        self.baseline = baseline
    }
}

// MARK: - Config & Metadata Sub-models

public struct BrandingConfig: Codable, Sendable {
    public let schoolLogoUrl: String?
    public let schoolName: String?
    public let eventTitle: String?
    public let eventSubtitle: String?
    public let useDefaultSchoolLogo: Bool?
    public let accentColor: String?
}

public struct PhotoSettingsConfig: Codable, Sendable {
    public let shotCount: Int?
    public let orientation: String?
    public let mirrorOutput: Bool?
    public let blackAndWhiteEnabled: Bool?
    public let sepiaEnabled: Bool?
    public let betweenShotPauseMs: Int?
    public let retentionHours: Int?
}

public struct DeliveryConfig: Codable, Sendable {
    public let printEnabled: Bool?
    public let cloudQrEnabled: Bool?
    public let whatsappEnabled: Bool?
    public let emailEnabled: Bool?
}

public struct PrivacyConfig: Codable, Sendable {
    public let schoolMode: Bool?
    public let consentMode: String?
    public let privacyNoticeText: String?
    public let retentionHours: Int?
    public let publicGalleryEnabled: Bool?
}

public struct CardBackConfig: Codable, Sendable {
    public let enabled: Bool?
    public let headline: String?
    public let message: String?
    public let showQr: Bool?
    public let bgColor: String?
    public let textColor: String?
    public let style: String?
    public let showLines: Bool?
}

public struct PaymentConfig: Codable, Sendable {
    public let enabled: Bool?
    public let mode: String?
    public let amount: Double?
    public let currency: String?
    public let upiId: String?
    public let merchantName: String?
    public let timeoutSeconds: Int?

    public init(
        enabled: Bool? = nil,
        mode: String? = "organizer",
        amount: Double? = 0,
        currency: String? = "INR",
        upiId: String? = nil,
        merchantName: String? = nil,
        timeoutSeconds: Int? = 300
    ) {
        self.enabled = enabled
        self.mode = mode
        self.amount = amount
        self.currency = currency
        self.upiId = upiId
        self.merchantName = merchantName
        self.timeoutSeconds = timeoutSeconds
    }
}

// MARK: - Backend Pack Response Wrapper

public struct BackendPackResponse: Codable, Sendable {
    public let eventPack: EventPack?
    public let config: NestedConfig?
    public let shotCount: Int?
    public let composition: PackComposition?
    public let eventId: String?
    public let name: String?
    public let staffPin: String?
    public let branding: BrandingConfig?
    public let photoSettings: PhotoSettingsConfig?
    public let delivery: DeliveryConfig?
    public let privacy: PrivacyConfig?
    public let payment: PaymentConfig?

    public struct NestedConfig: Codable, Sendable {
        public let eventPack: EventPack?
        public let composition: PackComposition?
        public let payment: PaymentConfig?
    }

    /// Extracts the resolved EventPack from either root or nested structures
    public func resolvePack(fallbackEventId: String = "evt_idem") -> EventPack {
        let resolvedPayment = payment ?? config?.payment ?? eventPack?.payment ?? config?.eventPack?.payment
        if let directPack = eventPack {
            if directPack.payment == nil, let resolvedPayment = resolvedPayment {
                return directPack.with(payment: resolvedPayment)
            }
            return directPack
        }
        if let nestedPack = config?.eventPack {
            if nestedPack.payment == nil, let resolvedPayment = resolvedPayment {
                return nestedPack.with(payment: resolvedPayment)
            }
            return nestedPack
        }
        // Construct from root fields if flattened
        let resolvedComposition = composition ?? config?.composition ?? EventPack.defaultFallbackPack.composition
        return EventPack(
            id: eventId ?? fallbackEventId,
            version: "1.0.0",
            eventName: name ?? branding?.eventTitle ?? "Photobooth Event",
            language: "en",
            shotCount: shotCount ?? photoSettings?.shotCount ?? resolvedComposition.slots.count,
            betweenShotPauseMs: photoSettings?.betweenShotPauseMs ?? 0,
            mirrorOutput: photoSettings?.mirrorOutput ?? true,
            blackAndWhiteEnabled: photoSettings?.blackAndWhiteEnabled ?? true,
            sepiaEnabled: photoSettings?.sepiaEnabled ?? true,
            whatsappEnabled: delivery?.whatsappEnabled ?? false,
            emailEnabled: delivery?.emailEnabled ?? false,
            cloudQrEnabled: delivery?.cloudQrEnabled ?? true,
            printEnabled: delivery?.printEnabled ?? true,
            schoolMode: privacy?.schoolMode ?? true,
            consentMode: privacy?.consentMode ?? "notice",
            privacyNoticeText: privacy?.privacyNoticeText ?? "Privacy Notice: Photos taken during this session are saved privately.",
            retentionHours: privacy?.retentionHours ?? 72,
            publicGalleryEnabled: privacy?.publicGalleryEnabled ?? false,
            schoolName: branding?.schoolName ?? "Pehchaan Model Academy",
            schoolLogoUrl: branding?.schoolLogoUrl,
            accentColor: branding?.accentColor ?? "#d97706",
            eventSubtitle: branding?.eventSubtitle ?? "Annual Photobooth Experience",
            staffPin: staffPin ?? "482917",
            composition: resolvedComposition,
            payment: resolvedPayment,
            branding: branding,
            photoSettings: photoSettings,
            delivery: delivery,
            privacy: privacy
        )
    }
}

// MARK: - EventPack Mutation Helper

extension EventPack {
    public func with(payment: PaymentConfig?) -> EventPack {
        EventPack(
            id: self.id,
            version: self.version,
            eventName: self.eventName,
            language: self.language,
            shotCount: self.shotCount,
            betweenShotPauseMs: self.betweenShotPauseMs,
            mirrorOutput: self.mirrorOutput,
            blackAndWhiteEnabled: self.blackAndWhiteEnabled,
            sepiaEnabled: self.sepiaEnabled,
            whatsappEnabled: self.whatsappEnabled,
            emailEnabled: self.emailEnabled,
            cloudQrEnabled: self.cloudQrEnabled,
            printEnabled: self.printEnabled,
            schoolMode: self.schoolMode,
            consentMode: self.consentMode,
            consentTextEn: self.consentTextEn,
            consentTextHi: self.consentTextHi,
            privacyNoticeText: self.privacyNoticeText,
            retentionHours: self.retentionHours,
            publicGalleryEnabled: self.publicGalleryEnabled,
            schoolName: self.schoolName,
            schoolLogoUrl: self.schoolLogoUrl,
            accentColor: self.accentColor,
            primaryColor: self.primaryColor,
            secondaryColor: self.secondaryColor,
            backgroundColor: self.backgroundColor,
            eventSubtitle: self.eventSubtitle,
            countdownSeconds: self.countdownSeconds,
            staffPin: self.staffPin,
            composition: self.composition,
            singleShotComposition: self.singleShotComposition,
            cardBack: self.cardBack,
            payment: payment ?? self.payment,
            branding: self.branding,
            photoSettings: self.photoSettings,
            delivery: self.delivery,
            privacy: self.privacy
        )
    }
}

// MARK: - Fallback Default Pack

extension EventPack {
    public static var defaultFallbackPack: EventPack {
        EventPack(
            id: "pack_evt_idem",
            version: "1.0.0",
            eventName: "Photobooth Event",
            language: "en",
            shotCount: 2,
            betweenShotPauseMs: 0,
            mirrorOutput: true,
            blackAndWhiteEnabled: true,
            sepiaEnabled: true,
            whatsappEnabled: false,
            emailEnabled: false,
            cloudQrEnabled: true,
            printEnabled: true,
            schoolMode: true,
            consentMode: "notice",
            privacyNoticeText: "Privacy Notice: Photos taken during this session are saved privately and never published without consent.",
            retentionHours: 72,
            publicGalleryEnabled: false,
            schoolName: "Pehchaan Model Academy",
            schoolLogoUrl: nil,
            accentColor: "#d97706",
            primaryColor: "#d97706",
            secondaryColor: "#1c1b18",
            backgroundColor: "#fffdf5",
            eventSubtitle: "Annual Photobooth Experience",
            countdownSeconds: 3,
            staffPin: "482917",
            composition: PackComposition(
                id: "comp-little-keepsake",
                name: "Photobooth Event",
                width: 400,
                height: 1200,
                background: "#fffdf5",
                overlayEnabled: true,
                slots: [
                    PackSlot(id: "slot-1", shotNumber: 1, x: 24, y: 40, width: 352, height: 440, fit: "cover", effect: "none"),
                    PackSlot(id: "slot-2", shotNumber: 2, x: 24, y: 500, width: 352, height: 440, fit: "cover", effect: "black-and-white")
                ],
                texts: [
                    PackText(id: "branding-title", text: "PHOTOBOOTH EVENT", x: 200, y: 1040, font: "600 36px serif", color: "#d97706", align: "center", baseline: "middle"),
                    PackText(id: "branding-sub", text: "ANNUAL PHOTOBOOTH EXPERIENCE", x: 200, y: 1090, font: "500 16px sans-serif", color: "#c6a15b", align: "center", baseline: "middle")
                ]
            ),
            payment: PaymentConfig(
                enabled: false,
                mode: "organizer",
                amount: 0,
                currency: "INR",
                upiId: "",
                merchantName: "Pehchaan Model Academy",
                timeoutSeconds: 300
            )
        )
    }
}

// MARK: - Color & Font Helpers

public extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 255, 253, 245)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
