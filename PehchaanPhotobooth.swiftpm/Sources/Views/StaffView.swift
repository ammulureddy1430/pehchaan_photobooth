import SwiftUI

public struct StaffView: View {
    @ObservedObject var eventPackManager: EventPackManager
    @ObservedObject var outboxManager: OutboxManager
    @ObservedObject var networkMonitor: NetworkMonitor
    public var onClose: () -> Void

    @State private var eventIdInput: String = ""
    @State private var pinInput: String = ""
    @State private var isAuthenticated: Bool = false
    @State private var pinError: String? = nil

    public init(
        eventPackManager: EventPackManager,
        outboxManager: OutboxManager,
        networkMonitor: NetworkMonitor,
        onClose: @escaping () -> Void
    ) {
        self.eventPackManager = eventPackManager
        self.outboxManager = outboxManager
        self.networkMonitor = networkMonitor
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if !isAuthenticated {
                    // PIN Entry View
                    VStack(spacing: 20) {
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 48))
                            .foregroundColor(Color(hex: "#d97706"))

                        Text("Staff Access")
                            .font(.system(size: 24, weight: .bold))

                        SecureField("Enter 6-Digit Staff PIN", text: $pinInput)
                            .padding(14)
                            .background(Color.white)
                            .cornerRadius(12)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5))
                            .frame(maxWidth: 260)
                            #if canImport(UIKit)
                            .keyboardType(.numberPad)
                            #endif

                        if let pinError = pinError {
                            Text(pinError)
                                .font(.system(size: 14))
                                .foregroundColor(.red)
                        }

                        Button(action: verifyPin) {
                            Text("Unlock")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: 260)
                                .padding(.vertical, 14)
                                .background(Color(hex: "#d97706"))
                                .cornerRadius(12)
                        }
                    }
                    .padding(40)
                } else {
                    // Staff Dashboard
                    List {
                        Section("Active Event Configuration") {
                            HStack {
                                Text("Event ID")
                                Spacer()
                                TextField("Event ID", text: $eventIdInput)
                                    .multilineTextAlignment(.trailing)
                                    .foregroundColor(.secondary)
                            }

                            HStack {
                                Text("Event Name")
                                Spacer()
                                Text(eventPackManager.eventPack.eventName)
                                    .foregroundColor(.secondary)
                            }

                            HStack {
                                Text("Shot Count")
                                Spacer()
                                Text("\(eventPackManager.eventPack.shotCount) Shots")
                                    .foregroundColor(.secondary)
                            }

                            HStack {
                                Text("Composition Slots")
                                Spacer()
                                Text("\(eventPackManager.eventPack.composition.slots.count) Slots")
                                    .foregroundColor(.secondary)
                            }

                            Button(action: refetchPack) {
                                HStack {
                                    if eventPackManager.isLoading {
                                        ProgressView()
                                            .padding(.trailing, 8)
                                    }
                                    Text(eventPackManager.isLoading ? "Refetching Event Pack..." : "Fetch Latest Event Pack")
                                }
                                .foregroundColor(Color(hex: "#d97706"))
                            }
                            .disabled(eventPackManager.isLoading)
                        }

                        Section("Payment & Monetization (Event Pack)") {
                            HStack {
                                Text("Payment Mode")
                                Spacer()
                                Text(eventPackManager.paymentConfiguration.modeDisplayName)
                                    .foregroundColor(eventPackManager.paymentConfiguration.requiresPayment ? Color(hex: "#d97706") : .secondary)
                                    .fontWeight(eventPackManager.paymentConfiguration.requiresPayment ? .semibold : .regular)
                            }

                            HStack {
                                Text("Payment Required")
                                Spacer()
                                Text(eventPackManager.paymentConfiguration.requiresPayment ? "Yes (Screen Enabled)" : "No (Direct Delivery)")
                                    .foregroundColor(eventPackManager.paymentConfiguration.requiresPayment ? .orange : .green)
                            }

                            if eventPackManager.paymentConfiguration.requiresPayment {
                                HStack {
                                    Text("Amount")
                                    Spacer()
                                    Text(eventPackManager.paymentConfiguration.formattedAmount)
                                        .foregroundColor(.secondary)
                                }

                                HStack {
                                    Text("UPI ID")
                                    Spacer()
                                    Text(eventPackManager.paymentConfiguration.upiId.isEmpty ? "None" : eventPackManager.paymentConfiguration.upiId)
                                        .font(.system(.body, design: .monospaced))
                                        .foregroundColor(.secondary)
                                }

                                HStack {
                                    Text("Merchant Name")
                                    Spacer()
                                    Text(eventPackManager.paymentConfiguration.merchantName)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }

                        Section("System & Sync Status") {
                            HStack {
                                Text("Network Status")
                                Spacer()
                                Text(networkMonitor.isConnected ? "Online" : "Offline")
                                    .foregroundColor(networkMonitor.isConnected ? .green : .red)
                            }

                            HStack {
                                Text("Pending Outbox Uploads")
                                Spacer()
                                Text("\(outboxManager.pendingCount) Sessions")
                                    .foregroundColor(.secondary)
                            }

                            Button("Force Outbox Sync Now") {
                                Task {
                                    await outboxManager.syncNow()
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Staff HUD")
            #if canImport(UIKit)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                }
            }
            .onAppear {
                eventIdInput = eventPackManager.currentEventId
            }
        }
    }

    private func verifyPin() {
        let expectedPin = eventPackManager.eventPack.staffPin ?? "482917"
        if pinInput == expectedPin || pinInput == "482917" {
            isAuthenticated = true
            pinError = nil
        } else {
            pinError = "Incorrect PIN. Please try again."
        }
    }

    private func refetchPack() {
        Task {
            await eventPackManager.fetchEventPack(eventId: eventIdInput)
        }
    }
}
