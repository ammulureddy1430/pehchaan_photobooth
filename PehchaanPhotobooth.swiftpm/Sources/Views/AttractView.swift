import SwiftUI

public struct AttractView: View {
    public let eventPack: EventPack
    public var onStart: () -> Void

    public init(eventPack: EventPack, onStart: @escaping () -> Void) {
        self.eventPack = eventPack
        self.onStart = onStart
    }

    public var body: some View {
        ZStack {
            // Background
            LinearGradient(
                colors: [Color(hex: "#1c1917"), Color(hex: "#0c0a09")],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 36) {
                Spacer()

                // School / Event Crest & Title
                VStack(spacing: 12) {
                    Image(systemName: "camera.macro")
                        .font(.system(size: 64))
                        .foregroundColor(Color(hex: eventPack.accentColor ?? "#d97706"))
                        .padding(.bottom, 8)

                    Text(eventPack.schoolName ?? "Pehchaan Photobooth")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(Color(hex: "#a8a29e"))
                        .textCase(.uppercase)
                        .tracking(3)

                    Text(eventPack.eventName)
                        .font(.system(size: 48, weight: .bold, design: .serif))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)

                    if let subtitle = eventPack.eventSubtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(Color(hex: "#d6d3d1"))
                    }
                }

                Spacer()

                // Start Button
                Button(action: onStart) {
                    HStack(spacing: 12) {
                        Text("Touch Screen to Start")
                            .font(.system(size: 22, weight: .bold))
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 26))
                    }
                    .foregroundColor(.white)
                    .padding(.vertical, 20)
                    .padding(.horizontal, 48)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "#d97706"), Color(hex: "#b45309")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(40)
                    .shadow(color: Color(hex: "#d97706").opacity(0.4), radius: 16, x: 0, y: 8)
                }

                // Shot count indicator
                Text("\(eventPack.shotCount) Photos • Instant Print & Digital Keepsake")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Color(hex: "#78716c"))
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 40)
        }
    }
}
