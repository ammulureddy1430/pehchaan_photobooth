import SwiftUI
import CoreImage

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

public typealias PaymentSettings = PaymentConfiguration

public enum PaymentViewState: Equatable {
    case generating
    case ready
    case paid
    case failed(String)
    case serverUnavailable(String)
    case expired
    case cancelled
}

public struct PaymentView: View {
    public let paymentConfig: PaymentConfiguration
    public let sessionId: String
    public var serverBaseUrl: String
    public var onSuccess: () -> Void
    public var onCancel: () -> Void

    @State private var viewState: PaymentViewState = .generating
    @State private var qrImage: PlatformImage? = nil
    @State private var paymentReference: String = ""
    @State private var paymentId: String = ""
    @State private var backendMerchantName: String = ""
    @State private var backendAmount: Double = 0
    @State private var backendCurrency: String = "INR"
    @State private var upiUri: String = ""
    @State private var isPolling: Bool = false
    @State private var pollTask: Task<Void, Never>? = nil

    public init(
        paymentConfig: PaymentConfiguration,
        sessionId: String = UUID().uuidString,
        serverBaseUrl: String = "http://192.168.29.48:3001",
        onSuccess: @escaping () -> Void = {},
        onCancel: @escaping () -> Void
    ) {
        self.paymentConfig = paymentConfig
        self.sessionId = sessionId
        self.serverBaseUrl = serverBaseUrl
        self.onSuccess = onSuccess
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(spacing: 20) {
            Spacer()

            switch viewState {
            case .generating:
                generatingView

            case .ready:
                qrReadyView

            case .paid:
                paidSuccessView

            case .failed(let reason):
                failedView(reason: reason)

            case .serverUnavailable(let message):
                serverUnavailableView(message: message)

            case .expired:
                expiredView

            case .cancelled:
                cancelledView
            }

            Spacer()

            // Bottom Actions (Cancel / Return to Final Photo)
            if viewState != .paid {
                Button(action: handleCancelTap) {
                    Text("CANCEL")
                        .font(.system(size: 16, weight: .bold))
                        .tracking(0.5)
                        .foregroundColor(Color(hex: "#78716c"))
                        .frame(maxWidth: 480)
                        .padding(.vertical, 14)
                        .background(Color.white)
                        .cornerRadius(16)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                        )
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: "#fcfaf6").ignoresSafeArea())
        .task {
            await createBackendPaymentTransaction()
        }
        .onDisappear {
            stopPolling()
        }
    }

    // MARK: - State 1: Generating Transaction

    private var generatingView: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#d97706").opacity(0.12))
                    .frame(width: 88, height: 88)

                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "#d97706")))
                    .scaleEffect(1.6)
            }

            Text("INITIALIZING PAYMENT")
                .font(.system(size: 24, weight: .black, design: .serif))
                .tracking(1.5)
                .foregroundColor(Color(hex: "#1c1917"))

            Text("Contacting payment server to create secure UPI transaction...")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Color(hex: "#78716c"))
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 24)
    }

    // MARK: - State 2: QR Ready & Waiting for Payment

    private var qrReadyView: some View {
        VStack(spacing: 20) {
            // Header: PAYMENT REQUIRED
            VStack(spacing: 6) {
                Text("PAYMENT REQUIRED")
                    .font(.system(size: 13, weight: .bold))
                    .tracking(2)
                    .foregroundColor(Color(hex: "#d97706"))

                Text(displayMerchantName)
                    .font(.system(size: 24, weight: .black, design: .serif))
                    .foregroundColor(Color(hex: "#1c1917"))
            }

            // QR & Details Card
            VStack(spacing: 16) {
                // Price Pill
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Amount Due")
                            .font(.system(size: 12, weight: .semibold))
                            .textCase(.uppercase)
                            .foregroundColor(Color(hex: "#a8a29e"))
                        Text(displayFormattedAmount)
                            .font(.system(size: 32, weight: .heavy, design: .rounded))
                            .foregroundColor(Color(hex: "#1c1917"))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Currency")
                            .font(.system(size: 12, weight: .semibold))
                            .textCase(.uppercase)
                            .foregroundColor(Color(hex: "#a8a29e"))
                        Text(displayCurrency)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Color(hex: "#1c1917"))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(Color(hex: "#fcf8ee"))
                .cornerRadius(14)

                // Dynamic QR Code Display
                ZStack {
                    #if canImport(UIKit)
                    if let image = qrImage {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 220, height: 220)
                            .padding(12)
                            .background(Color.white)
                            .cornerRadius(16)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                            )
                    } else {
                        Rectangle()
                            .fill(Color(hex: "#f5f5f4"))
                            .frame(width: 220, height: 220)
                            .cornerRadius(16)
                            .overlay(ProgressView())
                    }
                    #elseif canImport(AppKit)
                    if let image = qrImage {
                        Image(nsImage: image)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 220, height: 220)
                            .padding(12)
                            .background(Color.white)
                            .cornerRadius(16)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                            )
                    } else {
                        Rectangle()
                            .fill(Color(hex: "#f5f5f4"))
                            .frame(width: 220, height: 220)
                            .cornerRadius(16)
                            .overlay(ProgressView())
                    }
                    #endif
                }

                Text("Scan using any UPI app")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "#44403c"))

                Text("Google Pay • PhonePe • Paytm • BHIM • Cred • Any Bank UPI")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "#a8a29e"))
                    .multilineTextAlignment(.center)

                // Live Polling Waiting Indicator
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color(hex: "#d97706"))
                        .frame(width: 10, height: 10)
                        .opacity(0.9)

                    Text("WAITING FOR PAYMENT")
                        .font(.system(size: 13, weight: .bold))
                        .tracking(1.0)
                        .foregroundColor(Color(hex: "#b45309"))

                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "#d97706")))
                        .scaleEffect(0.8)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color(hex: "#fef3c7"))
                .cornerRadius(20)

                if !paymentReference.isEmpty {
                    Text("Ref: \(paymentReference)")
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundColor(Color(hex: "#a8a29e"))
                }
            }
            .padding(24)
            .frame(maxWidth: 480)
            .background(Color.white)
            .cornerRadius(24)
            .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color(hex: "#f0ede6"), lineWidth: 1.5)
            )
            .padding(.horizontal, 24)
        }
    }

    // MARK: - State 3: Paid Success

    private var paidSuccessView: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#10b981").opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(Color(hex: "#10b981"))
            }

            VStack(spacing: 8) {
                Text("PAYMENT SUCCESS")
                    .font(.system(size: 28, weight: .black, design: .serif))
                    .tracking(1.5)
                    .foregroundColor(Color(hex: "#065f46"))

                Text("Payment of \(displayFormattedAmount) Verified Successfully!")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Color(hex: "#047857"))
                    .multilineTextAlignment(.center)

                Text("Your photo delivery is now unlocked.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "#6b7280"))
                    .multilineTextAlignment(.center)
            }

            Button(action: onSuccess) {
                HStack(spacing: 10) {
                    Text("CONTINUE TO DELIVERY")
                        .font(.system(size: 18, weight: .heavy))
                        .tracking(1.0)
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 20))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "#10b981"), Color(hex: "#059669")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .cornerRadius(16)
                .shadow(color: Color(hex: "#10b981").opacity(0.35), radius: 10, x: 0, y: 5)
            }
            .padding(.top, 8)
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
        .padding(.horizontal, 24)
    }

    // MARK: - State 4: Server Unavailable (Security Enforcement: NO Local QR Fallback)

    private func serverUnavailableView(message: String) -> some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#ef4444").opacity(0.12))
                    .frame(width: 88, height: 88)

                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 44))
                    .foregroundColor(Color(hex: "#ef4444"))
            }

            Text("PAYMENT SERVER UNAVAILABLE")
                .font(.system(size: 22, weight: .black, design: .serif))
                .tracking(1.0)
                .foregroundColor(Color(hex: "#991b1b"))
                .multilineTextAlignment(.center)

            Text(message.isEmpty ? "Please check the connection and retry.\nYour captured photos are safely preserved." : "\(message)\nPlease check the connection and retry.")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "#78716c"))
                .multilineTextAlignment(.center)

            Button(action: {
                Task {
                    await createBackendPaymentTransaction()
                }
            }) {
                Text("RETRY CONNECTION")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(hex: "#1c1917"))
                    .cornerRadius(14)
            }
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 24)
    }

    // MARK: - State 5: Failed

    private func failedView(reason: String) -> some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#ef4444").opacity(0.15))
                    .frame(width: 88, height: 88)

                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(Color(hex: "#ef4444"))
            }

            Text("PAYMENT FAILED")
                .font(.system(size: 24, weight: .black, design: .serif))
                .tracking(1.5)
                .foregroundColor(Color(hex: "#991b1b"))

            Text(reason)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "#78716c"))
                .multilineTextAlignment(.center)

            Button(action: {
                Task {
                    await createBackendPaymentTransaction()
                }
            }) {
                Text("RETRY PAYMENT")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(hex: "#d97706"))
                    .cornerRadius(14)
            }
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 24)
    }

    // MARK: - State 6: Expired

    private var expiredView: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#f59e0b").opacity(0.15))
                    .frame(width: 88, height: 88)

                Image(systemName: "clock.badge.exclamationmark")
                    .font(.system(size: 44))
                    .foregroundColor(Color(hex: "#d97706"))
            }

            Text("PAYMENT EXPIRED")
                .font(.system(size: 24, weight: .black, design: .serif))
                .tracking(1.5)
                .foregroundColor(Color(hex: "#92400e"))

            Text("The payment request timed out. Please tap retry to generate a new transaction.")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "#78716c"))
                .multilineTextAlignment(.center)

            Button(action: {
                Task {
                    await createBackendPaymentTransaction()
                }
            }) {
                Text("RETRY PAYMENT")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(hex: "#d97706"))
                    .cornerRadius(14)
            }
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 24)
    }

    // MARK: - State 7: Cancelled

    private var cancelledView: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color(hex: "#6b7280").opacity(0.15))
                    .frame(width: 88, height: 88)

                Image(systemName: "slash.circle")
                    .font(.system(size: 44))
                    .foregroundColor(Color(hex: "#4b5563"))
            }

            Text("PAYMENT CANCELLED")
                .font(.system(size: 24, weight: .black, design: .serif))
                .tracking(1.5)
                .foregroundColor(Color(hex: "#1f2937"))

            Text("Payment was cancelled. Tap retry to restart the payment.")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "#78716c"))
                .multilineTextAlignment(.center)

            Button(action: {
                Task {
                    await createBackendPaymentTransaction()
                }
            }) {
                Text("RETRY PAYMENT")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(hex: "#1c1917"))
                    .cornerRadius(14)
            }
        }
        .padding(32)
        .frame(maxWidth: 480)
        .background(Color.white)
        .cornerRadius(24)
        .shadow(color: Color.black.opacity(0.06), radius: 18, x: 0, y: 8)
        .padding(.horizontal, 24)
    }

    // MARK: - Actions & Network Logic

    private func handleCancelTap() {
        stopPolling()
        onCancel()
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        isPolling = false
    }

    /// Creates authoritative payment transaction on backend.
    /// Unwraps the nested `json["payment"]` dictionary returned by backend.
    /// Strictly NO local fallback QR is generated if this request fails.
    private func createBackendPaymentTransaction() async {
        stopPolling()
        withAnimation { viewState = .generating }

        let endpoint = "\(cleanBaseUrl)/v1/sessions/\(sessionId)/payment/create"
        guard let url = URL(string: endpoint) else {
            withAnimation { viewState = .serverUnavailable("Invalid endpoint URL") }
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)
        request.timeoutInterval = 8.0

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpRes = response as? HTTPURLResponse else {
                withAnimation { viewState = .serverUnavailable("Invalid server response") }
                return
            }

            guard httpRes.statusCode == 200 || httpRes.statusCode == 201 else {
                var serverErrorMsg = "Server returned status \(httpRes.statusCode)"
                if let errJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let errorObj = errJson["error"] as? [String: Any],
                   let msg = errorObj["message"] as? String {
                    serverErrorMsg = msg
                }
                withAnimation { viewState = .serverUnavailable(serverErrorMsg) }
                return
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                withAnimation { viewState = .serverUnavailable("Could not parse payment response JSON") }
                return
            }

            // Unwraps nested "payment" dictionary: json["payment"] as [String: Any]
            let payment: [String: Any] = (json["payment"] as? [String: Any]) ?? json

            let qrUri = payment["qrUri"] as? String
            let qrImageUrl = payment["qrImageUrl"] as? String
            let paymentReference = (payment["paymentReference"] as? String) ?? ""
            let paymentId = (payment["paymentId"] as? String) ?? ""
            let status = (payment["status"] as? String) ?? "pending"
            let merchantName = (payment["merchantName"] as? String) ?? paymentConfig.merchantName
            let amount = extractDouble(from: payment["amount"]) ?? paymentConfig.amount
            let currency = (payment["currency"] as? String) ?? paymentConfig.currency

            let uri = (qrUri != nil && !qrUri!.isEmpty) ? qrUri! : (qrImageUrl ?? "")

            self.paymentReference = paymentReference
            self.paymentId = paymentId
            self.upiUri = uri
            self.backendMerchantName = merchantName
            self.backendAmount = amount
            self.backendCurrency = currency

            if status == "paid" || status == "success" {
                withAnimation { viewState = .paid }
                return
            }

            guard !uri.isEmpty else {
                withAnimation { viewState = .serverUnavailable("Payment server did not return a QR URI.") }
                return
            }

            // Generate native QR code image directly from backend-returned qrUri
            if let generated = generateQRCodeImage(from: uri) {
                self.qrImage = generated
                withAnimation { viewState = .ready }
                startPolling()
            } else {
                withAnimation { viewState = .serverUnavailable("Unable to render QR code from server URI.") }
            }
        } catch {
            withAnimation { viewState = .serverUnavailable(error.localizedDescription) }
        }
    }

    private func startPolling() {
        guard !isPolling else { return }
        isPolling = true

        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000) // Poll every 2.5 seconds
                if Task.isCancelled { break }

                let statusEndpoint = "\(cleanBaseUrl)/v1/sessions/\(sessionId)/payment/status"
                guard let url = URL(string: statusEndpoint) else { continue }

                do {
                    let (data, response) = try await URLSession.shared.data(from: url)
                    guard let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 else { continue }

                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        let paymentDict: [String: Any] = (json["payment"] as? [String: Any]) ?? json
                        let status = (paymentDict["status"] as? String) ?? ""

                        if status == "paid" || status == "success" {
                            await MainActor.run {
                                stopPolling()
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                                    viewState = .paid
                                }
                            }
                            break
                        } else if status == "failed" {
                            let reason = (paymentDict["failureReason"] as? String) ?? "Payment failed"
                            await MainActor.run {
                                stopPolling()
                                withAnimation {
                                    viewState = .failed(reason)
                                }
                            }
                            break
                        } else if status == "expired" {
                            await MainActor.run {
                                stopPolling()
                                withAnimation {
                                    viewState = .expired
                                }
                            }
                            break
                        } else if status == "cancelled" {
                            await MainActor.run {
                                stopPolling()
                                withAnimation {
                                    viewState = .cancelled
                                }
                            }
                            break
                        }
                    }
                } catch {
                    // Non-fatal network timeout during polling, continue next tick
                }
            }
        }
    }

    private func extractDouble(from value: Any?) -> Double? {
        if let d = value as? Double {
            return d
        }
        if let i = value as? Int {
            return Double(i)
        }
        if let n = value as? NSNumber {
            return n.doubleValue
        }
        if let s = value as? String, let parsed = Double(s) {
            return parsed
        }
        return nil
    }

    private var cleanBaseUrl: String {
        var base = serverBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.hasSuffix("/") {
            base.removeLast()
        }
        return base
    }

    private var displayMerchantName: String {
        if !backendMerchantName.isEmpty {
            return backendMerchantName
        }
        return paymentConfig.merchantName.isEmpty ? "Pehchaan Photobooth" : paymentConfig.merchantName
    }

    private var displayCurrency: String {
        return backendCurrency.isEmpty ? paymentConfig.currency : backendCurrency
    }

    private var displayFormattedAmount: String {
        let amt = backendAmount > 0 ? backendAmount : paymentConfig.amount
        let curr = displayCurrency
        let symbol = curr.uppercased() == "INR" ? "₹" : "\(curr) "
        if amt == Double(Int64(amt)) {
            return "\(symbol)\(Int64(amt))"
        } else {
            return "\(symbol)\(String(format: "%.2f", amt))"
        }
    }

    private func generateQRCodeImage(from string: String) -> PlatformImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        let data = Data(string.utf8)
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")

        guard let outputImage = filter.outputImage else { return nil }
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: transform)

        let context = CIContext()
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }

        #if canImport(UIKit)
        return UIImage(cgImage: cgImage)
        #elseif canImport(AppKit)
        return NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
        #else
        return nil
        #endif
    }
}
