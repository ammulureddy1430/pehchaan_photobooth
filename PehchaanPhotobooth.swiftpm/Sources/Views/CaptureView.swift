import SwiftUI

public struct CaptureView: View {
    @ObservedObject var cameraManager: CameraManager
    public let totalShots: Int
    public var onCaptureComplete: () -> Void

    @State private var countdownTimer: Int = 3
    @State private var isTimerActive: Bool = false
    @State private var flashEffect: Bool = false

    public init(cameraManager: CameraManager, totalShots: Int, onCaptureComplete: @escaping () -> Void) {
        self.cameraManager = cameraManager
        self.totalShots = totalShots
        self.onCaptureComplete = onCaptureComplete
    }

    public var body: some View {
        ZStack {
            // Viewfinder area
            Color(hex: "#1c1917").ignoresSafeArea()

            VStack {
                // Top Progress indicator
                HStack {
                    Text("Photo \(min(cameraManager.currentShotIndex + 1, totalShots)) of \(totalShots)")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Color.black.opacity(0.6))
                        .cornerRadius(20)

                    Spacer()
                }
                .padding(24)

                Spacer()

                // Countdown Overlay
                if isTimerActive {
                    Text("\(countdownTimer)")
                        .font(.system(size: 140, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .shadow(color: Color(hex: "#d97706"), radius: 24, x: 0, y: 0)
                        .scaleEffect(isTimerActive ? 1.0 : 0.5)
                        .animation(.easeInOut(duration: 0.3), value: countdownTimer)
                }

                Spacer()

                // Bottom Trigger Area
                if !isTimerActive {
                    Button(action: startCountdown) {
                        ZStack {
                            Circle()
                                .stroke(Color.white, lineWidth: 5)
                                .frame(width: 88, height: 88)
                            Circle()
                                .fill(Color(hex: "#d97706"))
                                .frame(width: 72, height: 72)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }

            // Flash Animation
            if flashEffect {
                Color.white.ignoresSafeArea()
                    .transition(.opacity)
            }
        }
        .onAppear {
            cameraManager.configureForSession(shotCount: totalShots)
            startCountdown()
        }
    }

    private func startCountdown() {
        countdownTimer = 3
        isTimerActive = true

        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            if countdownTimer > 1 {
                countdownTimer -= 1
            } else {
                timer.invalidate()
                takeShot()
            }
        }
    }

    private func takeShot() {
        withAnimation(.easeInOut(duration: 0.15)) {
            flashEffect = true
        }

        cameraManager.addSampleShot(index: cameraManager.currentShotIndex)
        cameraManager.currentShotIndex += 1

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            flashEffect = false
            isTimerActive = false

            if cameraManager.currentShotIndex < totalShots {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    startCountdown()
                }
            } else {
                onCaptureComplete()
            }
        }
    }
}
