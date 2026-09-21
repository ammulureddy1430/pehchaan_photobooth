import Foundation
import Network
import Combine

@MainActor
public final class NetworkMonitor: ObservableObject {
    public static let shared = NetworkMonitor()

    @Published public var isConnected: Bool = true
    @Published public var isExpensive: Bool = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "PehchaanNetworkMonitor")

    public init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isConnected = (path.status == .satisfied)
                self?.isExpensive = path.isExpensive
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
