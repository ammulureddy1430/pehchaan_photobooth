import Foundation
import Combine

// MARK: - Outbox Session Record

public struct OutboxSessionRecord: Codable, Identifiable, Sendable {
    public let id: String
    public let eventId: String
    public let createdAt: Date
    public var uploadState: String // "queued", "uploaded", "failed"
    public var lastError: String?

    public init(id: String = UUID().uuidString, eventId: String, createdAt: Date = Date(), uploadState: String = "queued", lastError: String? = nil) {
        self.id = id
        self.eventId = eventId
        self.createdAt = createdAt
        self.uploadState = uploadState
        self.lastError = lastError
    }
}

// MARK: - Delivery Telemetry Record

public struct DeliveryTelemetryRecord: Codable, Identifiable, Sendable {
    public let id: String
    public let eventId: String
    public let sessionId: String
    public let deviceId: String
    public let channel: String // "qr", "print", "whatsapp", "email", "export"
    public let status: String  // "success", "pending", "failed"
    public let recipientMasked: String?
    public let errorMessage: String?
    public let createdAt: Date

    public init(
        id: String = UUID().uuidString,
        eventId: String,
        sessionId: String,
        deviceId: String = "ipad-photobooth",
        channel: String,
        status: String,
        recipientMasked: String? = nil,
        errorMessage: String? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.eventId = eventId
        self.sessionId = sessionId
        self.deviceId = deviceId
        self.channel = channel
        self.status = status
        self.recipientMasked = recipientMasked
        self.errorMessage = errorMessage
        self.createdAt = createdAt
    }
}

// MARK: - Outbox Manager

@MainActor
public final class OutboxManager: ObservableObject {
    @Published public var queuedSessions: [OutboxSessionRecord] = []
    @Published public var queuedTelemetry: [DeliveryTelemetryRecord] = []
    @Published public var isSyncing: Bool = false
    @Published public var pendingCount: Int = 0

    private let storageKey = "pehchaan_outbox_queue"
    private let telemetryStorageKey = "pehchaan_outbox_telemetry_queue"

    public init() {
        loadQueue()
        loadTelemetryQueue()
    }

    public func enqueue(session: OutboxSessionRecord) {
        queuedSessions.append(session)
        pendingCount = queuedSessions.filter { $0.uploadState == "queued" }.count
        saveQueue()
    }

    /// Records delivery attempt telemetry to backend /api/deliveries/record
    public func recordDelivery(
        eventId: String,
        sessionId: String,
        channel: String,
        status: String,
        recipientMasked: String? = nil,
        errorMessage: String? = nil
    ) {
        let record = DeliveryTelemetryRecord(
            eventId: eventId,
            sessionId: sessionId,
            channel: channel,
            status: status,
            recipientMasked: recipientMasked,
            errorMessage: errorMessage
        )
        // Fire async non-blocking dispatch
        Task {
            await dispatchTelemetry(record)
        }
    }

    private func dispatchTelemetry(_ record: DeliveryTelemetryRecord) async {
        let endpoints = [
            "http://192.168.29.48:3001/api/deliveries/record",
            "http://localhost:3001/api/deliveries/record"
        ]

        var payload: [String: Any] = [
            "eventId": record.eventId,
            "sessionId": record.sessionId,
            "deviceId": record.deviceId,
            "channel": record.channel,
            "status": record.status
        ]
        if let masked = record.recipientMasked {
            payload["recipientMasked"] = masked
        }
        if let err = record.errorMessage {
            payload["errorMessage"] = err
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload) else { return }

        for endpoint in endpoints {
            guard let url = URL(string: endpoint) else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 3.5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = jsonData

            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                    return
                }
            } catch {
                // Try next fallback endpoint
            }
        }

        // Offline / failed dispatch: queue for later sync
        queuedTelemetry.append(record)
        saveTelemetryQueue()
    }

    public func syncNow(endpoint: String = "http://192.168.29.48:3001/api/sync") async {
        guard !isSyncing else { return }
        self.isSyncing = true
        defer { self.isSyncing = false }

        for index in queuedSessions.indices where queuedSessions[index].uploadState == "queued" {
            queuedSessions[index].uploadState = "uploaded"
        }
        pendingCount = queuedSessions.filter { $0.uploadState == "queued" }.count
        saveQueue()

        await flushPendingTelemetry()
    }

    public func flushPendingTelemetry() async {
        guard !queuedTelemetry.isEmpty else { return }
        let toFlush = queuedTelemetry
        var remaining: [DeliveryTelemetryRecord] = []

        for item in toFlush {
            let endpoints = [
                "http://192.168.29.48:3001/api/deliveries/record",
                "http://localhost:3001/api/deliveries/record"
            ]

            var sent = false
            var payload: [String: Any] = [
                "eventId": item.eventId,
                "sessionId": item.sessionId,
                "deviceId": item.deviceId,
                "channel": item.channel,
                "status": item.status
            ]
            if let masked = item.recipientMasked { payload["recipientMasked"] = masked }
            if let err = item.errorMessage { payload["errorMessage"] = err }

            if let jsonData = try? JSONSerialization.data(withJSONObject: payload) {
                for endpoint in endpoints {
                    guard let url = URL(string: endpoint) else { continue }
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.timeoutInterval = 3.0
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = jsonData

                    if let (_, response) = try? await URLSession.shared.data(for: request),
                       let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                        sent = true
                        break
                    }
                }
            }

            if !sent {
                remaining.append(item)
            }
        }

        queuedTelemetry = remaining
        saveTelemetryQueue()
    }

    private func saveQueue() {
        if let encoded = try? JSONEncoder().encode(queuedSessions) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
        }
    }

    private func loadQueue() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([OutboxSessionRecord].self, from: data) {
            queuedSessions = decoded
            pendingCount = queuedSessions.filter { $0.uploadState == "queued" }.count
        }
    }

    private func saveTelemetryQueue() {
        if let encoded = try? JSONEncoder().encode(queuedTelemetry) {
            UserDefaults.standard.set(encoded, forKey: telemetryStorageKey)
        }
    }

    private func loadTelemetryQueue() {
        if let data = UserDefaults.standard.data(forKey: telemetryStorageKey),
           let decoded = try? JSONDecoder().decode([DeliveryTelemetryRecord].self, from: data) {
            queuedTelemetry = decoded
        }
    }
}
