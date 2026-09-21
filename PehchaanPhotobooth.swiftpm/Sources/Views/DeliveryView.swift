import SwiftUI
import CoreImage
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Server Info Response Model

private struct ServerInfoPayload: Decodable, Sendable {
    let status: String?
    let primaryLanIp: String?
    let lanIps: [String]?
    let publicUrl: String?
    let baseUrl: String?
}

// MARK: - Delivery View

public struct DeliveryView: View {
    public let sessionId: String
    public let eventPack: EventPack
    public let capturedImages: [PlatformImage]
    public let composedImage: PlatformImage?
    @ObservedObject var photoLibraryManager: PhotoLibraryManager
    @StateObject private var printManager = PrintManager.shared
    public let outboxManager: OutboxManager?
    public var onFinish: () -> Void

    // Local transient states (never persisted permanently)
    @State private var hasSavedToPhotos: Bool = false
    @State private var qrImage: PlatformImage? = nil
    @State private var resolvedGalleryUrl: String? = nil
    @State private var isLoadingQR: Bool = false
    @State private var qrErrorMessage: String? = nil

    // WhatsApp delivery state
    @State private var whatsAppPhoneInput: String = ""
    @State private var isSendingWhatsApp: Bool = false
    @State private var whatsAppSuccessMessage: String? = nil
    @State private var whatsAppError: String? = nil

    // Email delivery state
    @State private var emailInput: String = ""
    @State private var emailSuccessMessage: String? = nil
    @State private var emailError: String? = nil

    // Auto-Reset Countdown State
    private let defaultTimeoutSeconds: Int = 45
    @State private var timeRemaining: Int = 45
    @State private var timerTask: Task<Void, Never>? = nil

    public init(
        sessionId: String = UUID().uuidString,
        eventPack: EventPack,
        capturedImages: [PlatformImage],
        composedImage: PlatformImage? = nil,
        photoLibraryManager: PhotoLibraryManager,
        outboxManager: OutboxManager? = nil,
        onFinish: @escaping () -> Void
    ) {
        self.sessionId = sessionId
        self.eventPack = eventPack
        self.capturedImages = capturedImages
        self.composedImage = composedImage
        self.photoLibraryManager = photoLibraryManager
        self.outboxManager = outboxManager
        self.onFinish = onFinish
    }

    /// WhatsApp is strictly enabled ONLY when flag is ON and schoolMode is OFF
    private var isWhatsAppAvailable: Bool {
        return eventPack.whatsappEnabled && (eventPack.schoolMode != true)
    }

    /// Email is enabled when flag is ON
    private var isEmailAvailable: Bool {
        return eventPack.emailEnabled
    }

    public var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 50))
                        .foregroundColor(Color(hex: eventPack.accentColor ?? "#d97706"))

                    Text("Your Keepsake is Ready!")
                        .font(.system(size: 32, weight: .bold, design: .serif))
                        .foregroundColor(Color(hex: "#1c1917"))

                    Text("Scan below, save to Photos, or share instantly")
                        .font(.system(size: 15))
                        .foregroundColor(Color(hex: "#78716c"))
                }
                .padding(.top, 20)

                // Main Content Grid (Composed Preview + Delivery Hub)
                HStack(alignment: .top, spacing: 28) {
                    // 1. Composed Keepsake Preview (Left)
                    if let displayImage = composedImage ?? capturedImages.first {
                        VStack(spacing: 10) {
                            #if canImport(UIKit)
                            Image(uiImage: displayImage)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 320)
                                .cornerRadius(14)
                                .shadow(color: Color.black.opacity(0.14), radius: 12, x: 0, y: 5)
                            #elseif canImport(AppKit)
                            Image(nsImage: displayImage)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 320)
                                .cornerRadius(14)
                                .shadow(color: Color.black.opacity(0.14), radius: 12, x: 0, y: 5)
                            #endif

                            Text("Official Photo Keepsake")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(hex: "#78716c"))
                        }
                    }

                    // 2. Dynamic Cloud QR Code Card (respects cloudQrEnabled)
                    if eventPack.cloudQrEnabled {
                        VStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(Color.white)
                                    .frame(width: 200, height: 200)
                                    .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 4)

                                if isLoadingQR {
                                    VStack(spacing: 10) {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: eventPack.accentColor ?? "#d97706")))
                                            .scaleEffect(1.1)
                                        Text("Preparing QR Code...")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(Color(hex: "#78716c"))
                                    }
                                } else if let qr = qrImage {
                                    #if canImport(UIKit)
                                    Image(uiImage: qr)
                                        .interpolation(.none)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(width: 170, height: 170)
                                        .padding(6)
                                    #elseif canImport(AppKit)
                                    Image(nsImage: qr)
                                        .interpolation(.none)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(width: 170, height: 170)
                                        .padding(6)
                                    #endif
                                } else {
                                    VStack(spacing: 8) {
                                        Image(systemName: "qrcode.viewfinder")
                                            .font(.system(size: 36))
                                            .foregroundColor(Color(hex: "#d97706"))
                                        Text("QR Unavailable")
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundColor(Color(hex: "#44403c"))
                                        Text(qrErrorMessage ?? "Server unreachable")
                                            .font(.system(size: 11))
                                            .foregroundColor(Color(hex: "#78716c"))
                                            .multilineTextAlignment(.center)
                                            .padding(.horizontal, 8)
                                    }
                                    .padding(12)
                                }
                            }

                            VStack(spacing: 3) {
                                Text("Scan for Digital Copy")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Color(hex: "#1c1917"))
                                Text(resolvedGalleryUrl != nil ? "Point phone camera to open gallery" : "Instant digital download")
                                    .font(.system(size: 11))
                                    .foregroundColor(Color(hex: "#78716c"))
                            }
                        }
                        .frame(width: 200)
                    }

                    // 3. Sharing & Delivery Hub (Right Column)
                    VStack(spacing: 12) {
                        // Action Buttons: Save to Photos & AirPrint
                        HStack(spacing: 10) {
                            // Save to Photos Button
                            Button(action: {
                                resetInactivityTimer()
                                saveToPhotos()
                            }) {
                                HStack(spacing: 6) {
                                    Image(systemName: hasSavedToPhotos ? "checkmark.circle.fill" : "square.and.arrow.down.fill")
                                    Text(hasSavedToPhotos ? "Saved!" : "Save to Photos")
                                }
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 13)
                                .background(hasSavedToPhotos ? Color(hex: "#16a34a") : Color(hex: "#d97706"))
                                .cornerRadius(12)
                            }
                            .disabled(hasSavedToPhotos || photoLibraryManager.isSaving)

                            // Native iPadOS AirPrint Button (respects printEnabled)
                            if eventPack.printEnabled {
                                Button(action: {
                                    resetInactivityTimer()
                                    triggerAirPrint()
                                }) {
                                    HStack(spacing: 6) {
                                        if printManager.isPrinting {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "#1c1917")))
                                            Text("Preparing...")
                                        } else if printManager.status == .completed {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundColor(Color(hex: "#16a34a"))
                                            Text("Sent to Print!")
                                        } else {
                                            Image(systemName: "printer.fill")
                                            Text("Print Strip")
                                        }
                                    }
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(printManager.status == .completed ? Color(hex: "#15803d") : Color(hex: "#1c1917"))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 13)
                                    .background(printManager.status == .completed ? Color(hex: "#dcfce7") : Color.white)
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(printManager.status == .completed ? Color(hex: "#86efac") : Color(hex: "#d6d3d1"), lineWidth: 1.5)
                                    )
                                }
                                .disabled(printManager.isPrinting)
                            }
                        }

                        // Status message for Print cancellation, failure or unavailable state
                        if let msg = printManager.statusMessage, printManager.status != .completed {
                            Text(msg)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(printManager.status == .cancelled ? Color(hex: "#78716c") : Color(hex: "#dc2626"))
                                .multilineTextAlignment(.center)
                        }

                        // WhatsApp Delivery Card (Strictly only when enabled AND schoolMode == false)
                        if isWhatsAppAvailable {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack(spacing: 6) {
                                    Image(systemName: "message.fill")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color(hex: "#16a34a"))
                                    Text("Send to WhatsApp")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(Color(hex: "#1c1917"))
                                }

                                HStack(spacing: 8) {
                                    TextField("10-digit mobile number", text: $whatsAppPhoneInput)
                                        #if canImport(UIKit)
                                        .keyboardType(.phonePad)
                                        #endif
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                        .background(Color(hex: "#f5f5f4"))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(whatsAppError != nil ? Color.red : Color(hex: "#e7e5e4"), lineWidth: 1)
                                        )

                                    Button(action: {
                                        resetInactivityTimer()
                                        sendWhatsApp()
                                    }) {
                                        if isSendingWhatsApp {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                                .frame(width: 50, height: 34)
                                        } else {
                                            Text("Send")
                                                .font(.system(size: 13, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(.horizontal, 14)
                                                .padding(.vertical, 8)
                                        }
                                    }
                                    .background(Color(hex: "#16a34a"))
                                    .cornerRadius(8)
                                    .disabled(isSendingWhatsApp || whatsAppPhoneInput.trimmingCharacters(in: .whitespaces).isEmpty)
                                }

                                if let msg = whatsAppSuccessMessage {
                                    Text(msg)
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundColor(Color(hex: "#15803d"))
                                } else if let err = whatsAppError {
                                    Text(err)
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(hex: "#dc2626"))
                                }
                            }
                            .padding(12)
                            .background(Color.white)
                            .cornerRadius(12)
                            .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
                        }

                        // Email Delivery Card (respects emailEnabled)
                        if isEmailAvailable {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack(spacing: 6) {
                                    Image(systemName: "envelope.fill")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color(hex: eventPack.accentColor ?? "#d97706"))
                                    Text("Send to Email")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(Color(hex: "#1c1917"))
                                }

                                HStack(spacing: 8) {
                                    TextField("guest@example.com", text: $emailInput)
                                        #if canImport(UIKit)
                                        .keyboardType(.emailAddress)
                                        .autocapitalization(.none)
                                        #endif
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                        .background(Color(hex: "#f5f5f4"))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(emailError != nil ? Color.red : Color(hex: "#e7e5e4"), lineWidth: 1)
                                        )

                                    Button(action: {
                                        resetInactivityTimer()
                                        sendEmail()
                                    }) {
                                        Text("Open")
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundColor(.white)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 8)
                                    }
                                    .background(Color(hex: eventPack.accentColor ?? "#d97706"))
                                    .cornerRadius(8)
                                    .disabled(emailInput.trimmingCharacters(in: .whitespaces).isEmpty)
                                }

                                if let msg = emailSuccessMessage {
                                    Text(msg)
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundColor(Color(hex: "#15803d"))
                                } else if let err = emailError {
                                    Text(err)
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(hex: "#dc2626"))
                                }
                            }
                            .padding(12)
                            .background(Color.white)
                            .cornerRadius(12)
                            .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
                        }
                    }
                    .frame(minWidth: 260, maxWidth: 320)
                }
                .padding(20)
                .background(Color.white)
                .cornerRadius(22)
                .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 6)
                .padding(.horizontal, 24)

                // Auto-Reset Inactivity Banner
                HStack(spacing: 8) {
                    Image(systemName: "timer")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: "#d97706"))
                    Text("Returning to camera in \(timeRemaining) seconds...")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "#78716c"))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(Color.white)
                .cornerRadius(20)
                .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)

                // Done / Finish Button
                Button(action: handleManualFinish) {
                    Text("Finish Session")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(Color(hex: "#78716c"))
                        .padding(.vertical, 13)
                        .padding(.horizontal, 42)
                        .background(Color.white)
                        .cornerRadius(30)
                        .overlay(
                            RoundedRectangle(cornerRadius: 30)
                                .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                        )
                }
                .padding(.bottom, 24)
            }
        }
        .simultaneousGesture(TapGesture().onEnded { resetInactivityTimer() })
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: "#fcfaf6").ignoresSafeArea())
        .task {
            startInactivityTimer()
            if eventPack.cloudQrEnabled {
                await loadDynamicQRCode()
            }
        }
        .onDisappear {
            cancelInactivityTimer()
        }
    }

    // MARK: - Auto-Reset & Inactivity Timer

    private func startInactivityTimer() {
        cancelInactivityTimer()
        timeRemaining = defaultTimeoutSeconds
        timerTask = Task { @MainActor in
            while !Task.isCancelled && timeRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { break }
                timeRemaining -= 1
            }
            if !Task.isCancelled && timeRemaining <= 0 {
                handleAutoReset()
            }
        }
    }

    private func resetInactivityTimer() {
        timeRemaining = defaultTimeoutSeconds
    }

    private func cancelInactivityTimer() {
        timerTask?.cancel()
        timerTask = nil
    }

    private func handleAutoReset() {
        cancelInactivityTimer()
        cleanupTransientData()
        onFinish()
    }

    private func handleManualFinish() {
        cancelInactivityTimer()
        cleanupTransientData()
        onFinish()
    }

    private func cleanupTransientData() {
        whatsAppPhoneInput = ""
        emailInput = ""
        whatsAppSuccessMessage = nil
        whatsAppError = nil
        emailSuccessMessage = nil
        emailError = nil
        qrImage = nil
        resolvedGalleryUrl = nil
        printManager.reset()
    }

    // MARK: - Dynamic QR Code Resolution & Telemetry

    private func loadDynamicQRCode() async {
        guard qrImage == nil else { return }
        isLoadingQR = true
        qrErrorMessage = nil

        let serverInfo = await fetchServerInfo()
        if let targetUrl = resolveGalleryUrl(from: serverInfo, sessionId: sessionId) {
            self.resolvedGalleryUrl = targetUrl
            if let generated = generateQRCode(from: targetUrl) {
                self.qrImage = generated
                self.isLoadingQR = false

                // Record QR preparation telemetry
                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "qr",
                    status: "success"
                )
                return
            } else {
                self.qrErrorMessage = "Failed to render QR image"
            }
        } else {
            self.qrErrorMessage = "Could not reach server for digital gallery link"
        }
        self.isLoadingQR = false

        // Record QR preparation failure telemetry
        outboxManager?.recordDelivery(
            eventId: eventPack.id,
            sessionId: sessionId,
            channel: "qr",
            status: "failed",
            errorMessage: qrErrorMessage
        )
    }

    private func fetchServerInfo() async -> ServerInfoPayload? {
        let endpoints = [
            "http://192.168.29.48:3001/api/server-info",
            "http://localhost:3001/api/server-info"
        ]
        for urlString in endpoints {
            guard let url = URL(string: urlString) else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.timeoutInterval = 3.5
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                    if let decoded = try? JSONDecoder().decode(ServerInfoPayload.self, from: data) {
                        return decoded
                    }
                }
            } catch {
                // Continue to fallback endpoint
            }
        }
        return nil
    }

    private func resolveGalleryUrl(from info: ServerInfoPayload?, sessionId: String) -> String? {
        guard let info = info else { return nil }

        // 1. Prefer active public/tunnel URL if available and starts with http/https
        if let pub = info.publicUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
           !pub.isEmpty,
           pub.lowercased().starts(with: "http") {
            let cleanPub = pub.hasSuffix("/") ? String(pub.dropLast()) : pub
            return "\(cleanPub)/gallery/\(sessionId)"
        }

        // 2. Otherwise use baseUrl if provided and starts with http/https
        if let base = info.baseUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
           !base.isEmpty,
           base.lowercased().starts(with: "http") {
            let cleanBase = base.hasSuffix("/") ? String(base.dropLast()) : base
            return "\(cleanBase)/gallery/\(sessionId)"
        }

        // 3. Otherwise construct from primaryLanIp
        if let ip = info.primaryLanIp?.trimmingCharacters(in: .whitespacesAndNewlines),
           !ip.isEmpty {
            return "http://\(ip):3001/gallery/\(sessionId)"
        }

        return nil
    }

    private func generateQRCode(from urlString: String) -> PlatformImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        let data = Data(urlString.utf8)
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")

        guard let outputImage = filter.outputImage else { return nil }
        let transform = CGAffineTransform(scaleX: 12, y: 12)
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

    // MARK: - Validation & Masking Helpers

    private func validatePhoneNumber(_ raw: String) -> (valid: Bool, normalized: String?, error: String?) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned = trimmed.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "(", with: "")
            .replacingOccurrences(of: ")", with: "")
            .replacingOccurrences(of: ".", with: "")

        if cleaned.isEmpty {
            return (false, nil, "Phone number cannot be empty")
        }

        if cleaned.hasPrefix("+") {
            let digits = String(cleaned.dropFirst())
            guard digits.count >= 10 && digits.count <= 15, digits.allSatisfy({ $0.isNumber }) else {
                return (false, nil, "International number must have 10-15 digits following '+'")
            }
            return (true, "+\(digits)", nil)
        }

        // 10-digit Indian national mobile number (starting with 6-9)
        if cleaned.count == 10 && cleaned.allSatisfy({ $0.isNumber }) {
            guard let first = cleaned.first, "6789".contains(first) else {
                return (false, nil, "10-digit mobile number must start with 6, 7, 8, or 9")
            }
            return (true, "+91\(cleaned)", nil)
        }

        // 11 to 15 digits without plus
        if cleaned.count >= 11 && cleaned.count <= 15 && cleaned.allSatisfy({ $0.isNumber }) {
            return (true, "+\(cleaned)", nil)
        }

        return (false, nil, "Please enter a valid 10-digit mobile number (e.g. 9876543210)")
    }

    private func validateEmailAddress(_ raw: String) -> (valid: Bool, normalized: String?, error: String?) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trimmed.isEmpty {
            return (false, nil, "Email address cannot be empty")
        }
        let emailRegex = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        let predicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        guard predicate.evaluate(with: trimmed) else {
            return (false, nil, "Please enter a valid email address (e.g. name@example.com)")
        }
        return (true, trimmed, nil)
    }

    private func maskPhoneNumber(_ raw: String) -> String {
        let digits = raw.filter { $0.isNumber }
        if digits.count >= 10 {
            let prefix = digits.prefix(4)
            let suffix = digits.suffix(2)
            return "+\(prefix)****\(suffix)"
        }
        return "***"
    }

    private func maskEmailAddress(_ raw: String) -> String {
        let parts = raw.split(separator: "@")
        guard parts.count == 2 else { return "***" }
        let name = String(parts[0])
        let domain = String(parts[1])
        let firstChar = name.prefix(1)
        return "\(firstChar)****@\(domain)"
    }

    // MARK: - Actions

    private func saveToPhotos() {
        guard let imageToSave = composedImage ?? capturedImages.first else { return }
        Task {
            let success = await photoLibraryManager.saveImageToPhotos(imageToSave)
            if success {
                hasSavedToPhotos = true
                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "export",
                    status: "success"
                )
            } else {
                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "export",
                    status: "failed",
                    errorMessage: photoLibraryManager.lastSavedStatus
                )
            }
        }
    }

    private func triggerAirPrint() {
        guard let imageToPrint = composedImage ?? capturedImages.first else { return }
        Task {
            let jobTitle = "\(eventPack.eventName) Keepsake"
            let success = await printManager.printImage(imageToPrint, jobName: jobTitle)
            if success {
                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "print",
                    status: "success"
                )
            } else if printManager.status != .cancelled {
                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "print",
                    status: "failed",
                    errorMessage: printManager.statusMessage
                )
            }
        }
    }

    private func sendWhatsApp() {
        let validation = validatePhoneNumber(whatsAppPhoneInput)
        guard validation.valid, let normalized = validation.normalized else {
            whatsAppError = validation.error ?? "Invalid phone number"
            whatsAppSuccessMessage = nil
            return
        }

        whatsAppError = nil
        whatsAppSuccessMessage = nil
        isSendingWhatsApp = true

        Task {
            let endpoints = [
                "http://192.168.29.48:3001/api/deliver/whatsapp",
                "http://localhost:3001/api/deliver/whatsapp"
            ]

            var sentSuccessfully = false
            var serverMessage: String? = nil
            var serverError: String? = nil

            let customHost: String? = {
                if let resolved = resolvedGalleryUrl, let url = URL(string: resolved), let host = url.host {
                    return url.port != nil ? "\(host):\(url.port!)" : host
                }
                return nil
            }()

            var payload: [String: Any] = [
                "sessionId": sessionId,
                "phoneNumber": normalized,
                "eventName": eventPack.eventName
            ]
            if let host = customHost {
                payload["customHost"] = host
            }

            guard let jsonData = try? JSONSerialization.data(withJSONObject: payload) else {
                whatsAppError = "Failed to encode delivery request"
                isSendingWhatsApp = false
                return
            }

            for endpoint in endpoints {
                guard let url = URL(string: endpoint) else { continue }
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.timeoutInterval = 6.0
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = jsonData

                do {
                    let (data, response) = try await URLSession.shared.data(for: request)
                    if let httpResponse = response as? HTTPURLResponse {
                        if httpResponse.statusCode == 200 {
                            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                               let msg = json["message"] as? String {
                                serverMessage = msg
                            } else {
                                serverMessage = "✓ Sent to guest WhatsApp (\(normalized))"
                            }
                            sentSuccessfully = true
                            break
                        } else if httpResponse.statusCode == 402 {
                            serverError = "Payment required: delivery locked until payment is verified"
                            break
                        } else if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                                  let err = json["error"] as? String {
                            serverError = err
                        }
                    }
                } catch {
                    // Try next fallback endpoint
                }
            }

            let maskedRecipient = maskPhoneNumber(normalized)
            if sentSuccessfully {
                whatsAppSuccessMessage = serverMessage ?? "✓ Sent to guest WhatsApp (\(normalized))"
                whatsAppError = nil

                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "whatsapp",
                    status: "success",
                    recipientMasked: maskedRecipient
                )
            } else {
                whatsAppError = serverError ?? "Could not send WhatsApp message. Please check network connection."
                whatsAppSuccessMessage = nil

                outboxManager?.recordDelivery(
                    eventId: eventPack.id,
                    sessionId: sessionId,
                    channel: "whatsapp",
                    status: "failed",
                    recipientMasked: maskedRecipient,
                    errorMessage: whatsAppError
                )
            }
            isSendingWhatsApp = false
        }
    }

    private func sendEmail() {
        let validation = validateEmailAddress(emailInput)
        guard validation.valid, let normalized = validation.normalized else {
            emailError = validation.error ?? "Invalid email address"
            emailSuccessMessage = nil
            return
        }

        emailError = nil
        let subject = "Your Photo from \(eventPack.eventName)"
        let link = resolvedGalleryUrl ?? "http://localhost:3001/gallery/\(sessionId)"
        let body = "Hello,\n\nThank you for visiting \(eventPack.eventName)! You can view and download your photobooth portrait at the following link:\n\n\(link)\n\nEnjoy your photo!"

        guard let encodedSubject = subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let encodedBody = body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let mailtoUrl = URL(string: "mailto:\(normalized)?subject=\(encodedSubject)&body=\(encodedBody)") else {
            emailError = "Could not format email link"
            return
        }

        #if canImport(UIKit)
        UIApplication.shared.open(mailtoUrl)
        emailSuccessMessage = "✓ Email app opened with photo link"
        #elseif canImport(AppKit)
        NSWorkspace.shared.open(mailtoUrl)
        emailSuccessMessage = "✓ Email app opened with photo link"
        #endif

        // Telemetry recorded as pending / client handoff
        outboxManager?.recordDelivery(
            eventId: eventPack.id,
            sessionId: sessionId,
            channel: "email",
            status: "pending",
            recipientMasked: maskEmailAddress(normalized)
        )
    }
}
