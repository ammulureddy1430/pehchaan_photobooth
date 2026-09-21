import SwiftUI

public enum BoothFlowState {
    case attract
    case consent
    case capture
    case composition
    case payment
    case delivery
}

public struct ContentView: View {
    @StateObject private var eventPackManager = EventPackManager.shared
    @StateObject private var cameraManager = CameraManager()
    @StateObject private var photoLibraryManager = PhotoLibraryManager()
    @StateObject private var outboxManager = OutboxManager()
    @StateObject private var networkMonitor = NetworkMonitor.shared

    @State private var flowState: BoothFlowState = .attract
    @State private var showStaffSheet: Bool = false
    @State private var currentSessionId: String = UUID().uuidString
    @State private var composedImage: PlatformImage? = nil

    public init() {}

    public var body: some View {
        ZStack {
            // Main Flow Controller
            switch flowState {
            case .attract:
                AttractView(
                    eventPack: eventPackManager.eventPack,
                    onStart: handleStartSession
                )

            case .consent:
                ConsentView(
                    eventPack: eventPackManager.eventPack,
                    onAccept: {
                        flowState = .capture
                    },
                    onCancel: {
                        flowState = .attract
                    }
                )

            case .capture:
                CaptureView(
                    cameraManager: cameraManager,
                    totalShots: eventPackManager.eventPack.shotCount,
                    onCaptureComplete: {
                        flowState = .composition
                    }
                )

            case .composition:
                CompositionView(
                    composition: eventPackManager.eventPack.composition,
                    capturedImages: cameraManager.capturedImages,
                    paymentConfig: eventPackManager.paymentConfiguration,
                    onComplete: { rendered in
                        self.composedImage = rendered
                        recordSession()
                        withAnimation(.easeInOut(duration: 0.25)) {
                            if eventPackManager.paymentConfiguration.requiresPayment {
                                flowState = .payment
                            } else {
                                flowState = .delivery
                            }
                        }
                    },
                    onRetake: {
                        cameraManager.reset()
                        composedImage = nil
                        withAnimation(.easeInOut(duration: 0.25)) {
                            flowState = .capture
                        }
                    }
                )

            case .payment:
                PaymentView(
                    paymentConfig: eventPackManager.paymentConfiguration,
                    sessionId: currentSessionId,
                    onSuccess: {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            flowState = .delivery
                        }
                    },
                    onCancel: {
                        // Return safely to CompositionView without losing photos or resetting session
                        withAnimation(.easeInOut(duration: 0.25)) {
                            flowState = .composition
                        }
                    }
                )

            case .delivery:
                DeliveryView(
                    sessionId: currentSessionId,
                    eventPack: eventPackManager.eventPack,
                    capturedImages: cameraManager.capturedImages,
                    composedImage: composedImage,
                    photoLibraryManager: photoLibraryManager,
                    outboxManager: outboxManager,
                    onFinish: {
                        cameraManager.reset()
                        composedImage = nil
                        currentSessionId = UUID().uuidString
                        withAnimation(.easeInOut(duration: 0.25)) {
                            flowState = .attract
                        }
                    }
                )
            }

            // Top Status & Staff Access Bar (Non-blocking overlay aligned to top)
            VStack(spacing: 8) {
                HStack(spacing: 12) {
                    // Staff Button
                    Button(action: { showStaffSheet = true }) {
                        HStack(spacing: 6) {
                            Image(systemName: "gearshape.fill")
                            Text("Staff")
                        }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.85))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.45))
                        .cornerRadius(20)
                    }

                    // Online / Offline Indicator
                    HStack(spacing: 6) {
                        Circle()
                            .fill(networkMonitor.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(networkMonitor.isConnected ? "Live Sync" : "Offline Mode")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.white.opacity(0.85))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.35))
                    .cornerRadius(20)

                    Spacer()

                    // Event Label
                    Text(eventPackManager.eventPack.eventName)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color.white.opacity(0.9))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.45))
                        .cornerRadius(20)
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)

                // Prominent Loading Banner when Event Pack is being fetched
                if eventPackManager.isLoading {
                    HStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        Text("Updating Event Configuration from Server...")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Color(hex: "#d97706").opacity(0.95))
                    .cornerRadius(12)
                    .shadow(radius: 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 8)
                }

                // Error Notice if Pack loading encountered an issue (graceful fallback)
                if let errorMessage = eventPackManager.errorMessage, !eventPackManager.isLoading {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.yellow)
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Button("Retry") {
                            Task {
                                await eventPackManager.fetchEventPack()
                            }
                        }
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(hex: "#fbbf24"))
                        .padding(.leading, 6)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.75))
                    .cornerRadius(10)
                    .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .sheet(isPresented: $showStaffSheet) {
            StaffView(
                eventPackManager: eventPackManager,
                outboxManager: outboxManager,
                networkMonitor: networkMonitor,
                onClose: { showStaffSheet = false }
            )
        }
        .task {
            // Fetch the latest Event Pack immediately upon launch
            await eventPackManager.fetchEventPack()
        }
    }

    private func handleStartSession() {
        cameraManager.reset()
        composedImage = nil
        let newSessionId = UUID().uuidString
        currentSessionId = newSessionId

        Task { @MainActor in
            await registerSession(sessionId: newSessionId)
            withAnimation(.easeInOut(duration: 0.25)) {
                if eventPackManager.eventPack.consentMode == "none" {
                    flowState = .capture
                } else {
                    flowState = .consent
                }
            }
        }
    }

    private func registerSession(sessionId: String) async {
        let endpoints = [
            "http://192.168.29.48:3001/api/sessions",
            "http://localhost:3001/api/sessions"
        ]

        let payload: [String: Any] = [
            "sessionId": sessionId,
            "eventId": eventPackManager.currentEventId,
            "deviceId": "ipad-photobooth",
            "shotCount": eventPackManager.eventPack.shotCount,
            "language": eventPackManager.eventPack.language.isEmpty ? "en" : eventPackManager.eventPack.language,
            "status": "in_progress"
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload) else {
            print("[ContentView] ❌ Failed to serialize session registration payload for session: \(sessionId)")
            return
        }

        for endpoint in endpoints {
            guard let url = URL(string: endpoint) else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 4.0
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = jsonData

            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                if let httpResponse = response as? HTTPURLResponse {
                    let responseBody = String(data: data, encoding: .utf8) ?? "<empty response>"
                    print("[ContentView] Session registration response from \(endpoint): HTTP \(httpResponse.statusCode)")
                    print("[ContentView] Response body: \(responseBody)")

                    if (200...299).contains(httpResponse.statusCode) {
                        print("[ContentView] ✅ Successfully registered session \(sessionId) with backend.")
                        return
                    } else {
                        print("[ContentView] ⚠️ Server returned non-success HTTP status \(httpResponse.statusCode) for session \(sessionId). Response: \(responseBody)")
                    }
                }
            } catch {
                print("[ContentView] ⚠️ Failed to register session at \(endpoint): \(error.localizedDescription)")
            }
        }

        print("[ContentView] ❌ Session registration failed across all endpoints for session: \(sessionId). Continuing offline/locally.")
    }

    private func recordSession() {
        let session = OutboxSessionRecord(
            id: currentSessionId,
            eventId: eventPackManager.currentEventId,
            createdAt: Date(),
            uploadState: "queued"
        )
        outboxManager.enqueue(session: session)
    }
}
