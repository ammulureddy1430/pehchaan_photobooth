import Foundation
import Combine
import SwiftUI

@MainActor
public final class EventPackManager: ObservableObject {
    public static let shared = EventPackManager()

    @Published public var currentEventId: String = "evt_idem"
    @Published public var eventPack: EventPack = EventPack.defaultFallbackPack
    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String? = nil
    @Published public var isOffline: Bool = false
    @Published public var lastUpdated: Date? = nil

    private let primaryBaseURL: String = "http://192.168.29.48:3001"
    private let fallbackBaseURL: String = "http://localhost:3001"
    private let userDefaultsKeyPrefix: String = "cached_event_pack_"

    public init(initialEventId: String = "evt_idem") {
        self.currentEventId = initialEventId
        loadCachedPack(for: initialEventId)
    }

    /// Primary entry point to fetch and synchronize Event Pack
    public func fetchEventPack(eventId: String? = nil) async {
        let targetEventId = (eventId ?? currentEventId).trimmingCharacters(in: .whitespacesAndNewlines)
        if !targetEventId.isEmpty {
            self.currentEventId = targetEventId
        }

        self.isLoading = true
        self.errorMessage = nil

        // Try primary IP endpoint first, then localhost fallback
        let primaryEndpoint = "\(primaryBaseURL)/api/events/\(self.currentEventId)/pack"
        let fallbackEndpoint = "\(fallbackBaseURL)/api/events/\(self.currentEventId)/pack"

        var downloadedPack: EventPack? = nil
        var fetchError: Error? = nil

        do {
            downloadedPack = try await requestPack(from: primaryEndpoint)
        } catch {
            fetchError = error
            // Attempt localhost fallback
            do {
                downloadedPack = try await requestPack(from: fallbackEndpoint)
                fetchError = nil
            } catch {
                fetchError = error
            }
        }

        if let validPack = downloadedPack {
            // Validate pack has valid composition and slots
            if !validPack.composition.slots.isEmpty {
                self.eventPack = validPack
                self.lastUpdated = Date()
                self.isOffline = false
                self.errorMessage = nil
                saveToCache(pack: validPack, for: self.currentEventId)
            } else {
                self.errorMessage = "Downloaded Event Pack contains an empty composition. Retaining current pack."
            }
        } else {
            self.isOffline = true
            let errMsg = fetchError?.localizedDescription ?? "Unable to connect to Event Pack server"
            self.errorMessage = "\(errMsg). Using cached configuration."
            // Safe offline fallback: keep cached pack intact
            loadCachedPack(for: self.currentEventId)
        }

        self.isLoading = false
    }

    /// Performs HTTP GET and decodes either root or nested event pack
    private func requestPack(from urlString: String) async throws -> EventPack {
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 6.0
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.init(rawValue: httpResponse.statusCode))
        }

        let decoder = JSONDecoder()

        // 1. Try decoding as direct EventPack
        if let directPack = try? decoder.decode(EventPack.self, from: data), !directPack.composition.slots.isEmpty {
            if directPack.payment == nil, let responseWrapper = try? decoder.decode(BackendPackResponse.self, from: data) {
                let resolved = responseWrapper.resolvePack(fallbackEventId: self.currentEventId)
                if resolved.payment != nil {
                    return resolved
                }
            }
            return directPack
        }

        // 2. Try decoding as BackendPackResponse wrapper
        if let responseWrapper = try? decoder.decode(BackendPackResponse.self, from: data) {
            let resolved = responseWrapper.resolvePack(fallbackEventId: self.currentEventId)
            if !resolved.composition.slots.isEmpty {
                return resolved
            }
        }

        throw DecodingError.dataCorrupted(
            DecodingError.Context(
                codingPath: [],
                debugDescription: "Could not decode Event Pack from backend response"
            )
        )
    }

    // MARK: - Offline Storage Caching

    private func saveToCache(pack: EventPack, for eventId: String) {
        do {
            let encoded = try JSONEncoder().encode(pack)
            UserDefaults.standard.set(encoded, forKey: "\(userDefaultsKeyPrefix)\(eventId)")
        } catch {
            print("Failed to cache Event Pack for offline use: \(error)")
        }
    }

    private func loadCachedPack(for eventId: String) {
        guard let data = UserDefaults.standard.data(forKey: "\(userDefaultsKeyPrefix)\(eventId)") else {
            // Keep default fallback pack if nothing cached
            return
        }

        do {
            let decoded = try JSONDecoder().decode(EventPack.self, from: data)
            if !decoded.composition.slots.isEmpty {
                self.eventPack = decoded
                self.lastUpdated = Date()
            }
        } catch {
            print("Failed to decode cached Event Pack: \(error)")
        }
    }
}
