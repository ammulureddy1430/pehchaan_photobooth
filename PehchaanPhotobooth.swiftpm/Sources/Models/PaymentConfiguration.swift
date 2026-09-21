import Foundation

// MARK: - Payment Mode

public enum PaymentMode: Equatable, Sendable {
    case organizer
    case individual
    case disabled
    case unknown(String)

    public var rawValue: String {
        switch self {
        case .organizer:
            return "organizer"
        case .individual:
            return "individual"
        case .disabled:
            return "disabled"
        case .unknown(let raw):
            return raw
        }
    }
}

// MARK: - Payment Configuration

public struct PaymentConfiguration: Equatable, Sendable {
    public let mode: PaymentMode
    public let rawMode: String
    public let amount: Double
    public let currency: String
    public let upiId: String
    public let merchantName: String
    public let timeoutSeconds: Int

    /// Payment is strictly required ONLY for individual mode.
    /// Organizer, disabled, unknown, or nil modes do not require guest payment.
    public var requiresPayment: Bool {
        return mode == .individual
    }

    /// Human-readable payment mode description
    public var modeDisplayName: String {
        switch mode {
        case .organizer:
            return "Organizer Sponsored (Free for Guests)"
        case .individual:
            return "Individual Pay-Per-Session"
        case .disabled:
            return "Disabled"
        case .unknown(let raw):
            return "Unknown (\(raw))"
        }
    }

    /// Formatted amount with currency symbol or code (e.g. ₹99)
    public var formattedAmount: String {
        let symbol: String
        switch currency.uppercased() {
        case "INR":
            symbol = "₹"
        case "USD":
            symbol = "$"
        case "EUR":
            symbol = "€"
        case "GBP":
            symbol = "£"
        default:
            symbol = "\(currency) "
        }

        if amount == Double(Int64(amount)) {
            return "\(symbol)\(Int64(amount))"
        } else {
            return "\(symbol)\(String(format: "%.2f", amount))"
        }
    }

    public init(
        from config: PaymentConfig?,
        defaultMerchantName: String? = nil
    ) {
        let raw = (config?.mode ?? "organizer").trimmingCharacters(in: .whitespacesAndNewlines)
        self.rawMode = raw
        let normalized = raw.lowercased()

        switch normalized {
        case "individual":
            self.mode = .individual
        case "organizer":
            self.mode = .organizer
        case "disabled":
            self.mode = .disabled
        case "":
            self.mode = .organizer
        default:
            print("[PaymentConfiguration] Safe warning: Unknown payment mode '\(raw)'. Treating as no guest payment required.")
            self.mode = .unknown(raw)
        }

        self.amount = max(0, config?.amount ?? 0.0)
        self.currency = (config?.currency ?? "INR").trimmingCharacters(in: .whitespacesAndNewlines)
        self.upiId = (config?.upiId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        let merchant = (config?.merchantName ?? defaultMerchantName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.merchantName = merchant.isEmpty ? "Pehchaan Model Academy" : merchant
        self.timeoutSeconds = max(0, config?.timeoutSeconds ?? 300)
    }

    public init(
        mode: PaymentMode = .organizer,
        rawMode: String = "organizer",
        amount: Double = 0,
        currency: String = "INR",
        upiId: String = "",
        merchantName: String = "Pehchaan Model Academy",
        timeoutSeconds: Int = 300
    ) {
        self.mode = mode
        self.rawMode = rawMode
        self.amount = amount
        self.currency = currency
        self.upiId = upiId
        self.merchantName = merchantName
        self.timeoutSeconds = timeoutSeconds
    }
}

// MARK: - Convenience Extensions

extension EventPack {
    public var paymentConfiguration: PaymentConfiguration {
        PaymentConfiguration(from: self.payment, defaultMerchantName: self.schoolName)
    }
}

extension EventPackManager {
    public var paymentConfiguration: PaymentConfiguration {
        eventPack.paymentConfiguration
    }
}
