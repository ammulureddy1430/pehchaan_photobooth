import SwiftUI

public struct ConsentView: View {
    public let eventPack: EventPack
    public var onAccept: () -> Void
    public var onCancel: () -> Void

    public init(eventPack: EventPack, onAccept: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.eventPack = eventPack
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "hand.raised.shield.fill")
                    .font(.system(size: 56))
                    .foregroundColor(Color(hex: eventPack.accentColor ?? "#d97706"))

                Text("Privacy & Photo Notice")
                    .font(.system(size: 32, weight: .bold, design: .serif))
                    .foregroundColor(Color(hex: "#1c1917"))

                Text(eventPack.privacyNoticeText ?? "Photos captured during this session are processed locally for your keepsake print and private digital gallery.")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundColor(Color(hex: "#57534e"))
                    .multilineTextAlignment(.center)
                    .lineSpacing(6)
                    .padding(.horizontal, 32)
            }
            .padding(36)
            .background(Color.white)
            .cornerRadius(24)
            .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
            .padding(.horizontal, 48)

            Spacer()

            HStack(spacing: 24) {
                Button(action: onCancel) {
                    Text("Cancel")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: "#78716c"))
                        .padding(.vertical, 16)
                        .padding(.horizontal, 36)
                        .background(Color.white)
                        .cornerRadius(32)
                        .overlay(
                            RoundedRectangle(cornerRadius: 32)
                                .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                        )
                }

                Button(action: onAccept) {
                    HStack(spacing: 8) {
                        Text("I Agree & Let's Pose!")
                        Image(systemName: "camera.fill")
                    }
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.vertical, 16)
                    .padding(.horizontal, 44)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "#d97706"), Color(hex: "#b45309")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(32)
                    .shadow(color: Color(hex: "#d97706").opacity(0.35), radius: 10, x: 0, y: 5)
                }
            }
            .padding(.bottom, 36)
        }
        .background(Color(hex: "#fcfaf6").ignoresSafeArea())
    }
}
