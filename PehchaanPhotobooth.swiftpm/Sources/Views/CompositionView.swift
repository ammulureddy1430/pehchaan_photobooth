import SwiftUI

public struct CompositionView: View {
    public let composition: PackComposition
    public let capturedImages: [PlatformImage]
    public let paymentConfig: PaymentConfiguration?
    public var onComplete: ((PlatformImage?) -> Void)? = nil
    public var onRetake: (() -> Void)? = nil

    public init(
        composition: PackComposition,
        capturedImages: [PlatformImage],
        paymentConfig: PaymentConfiguration? = nil,
        onComplete: ((PlatformImage?) -> Void)? = nil,
        onRetake: (() -> Void)? = nil
    ) {
        self.composition = composition
        self.capturedImages = capturedImages
        self.paymentConfig = paymentConfig
        self.onComplete = onComplete
        self.onRetake = onRetake
    }

    public init(
        composition: PackComposition,
        capturedImages: [PlatformImage],
        paymentConfig: PaymentConfiguration? = nil,
        onComplete: (() -> Void)? = nil,
        onRetake: (() -> Void)? = nil
    ) {
        self.composition = composition
        self.capturedImages = capturedImages
        self.paymentConfig = paymentConfig
        if let onComplete = onComplete {
            self.onComplete = { _ in onComplete() }
        } else {
            self.onComplete = nil
        }
        self.onRetake = onRetake
    }

    public var body: some View {
        GeometryReader { geo in
            let availableCanvasHeight = max(220, geo.size.height - 230)
            let availableCanvasWidth = max(220, geo.size.width - 64)

            VStack(spacing: 12) {
                // Header
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text("FINAL PHOTO")
                                .font(.system(size: 13, weight: .bold))
                                .tracking(1.2)
                                .foregroundColor(Color(hex: "#d97706"))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color(hex: "#d97706").opacity(0.12))
                                .cornerRadius(8)

                            HStack(spacing: 4) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                Text("PHOTO SAVED LOCALLY")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(Color(hex: "#15803d"))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.green.opacity(0.12))
                            .cornerRadius(8)
                        }

                        Text(composition.name)
                            .font(.system(size: 22, weight: .bold, design: .serif))
                            .foregroundColor(Color(hex: "#1c1917"))
                    }

                    Spacer()
                }
                .padding(.horizontal, 28)
                .padding(.top, 56)

                Spacer(minLength: 0)

                // Dynamic Composition Canvas
                ZStack {
                    // Outer Shadow Box
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(hex: composition.background))
                        .shadow(color: Color.black.opacity(0.15), radius: 16, x: 0, y: 8)

                    // Composition Renderer
                    CompositionCanvasRenderer(
                        composition: composition,
                        capturedImages: capturedImages
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .aspectRatio(CGFloat(composition.width / composition.height), contentMode: .fit)
                .frame(maxWidth: availableCanvasWidth, maxHeight: availableCanvasHeight)
                .padding(.horizontal, 32)
                .padding(.vertical, 4)

                Spacer(minLength: 0)

                // Bottom Action Controls
                HStack(spacing: 20) {
                    if let onRetake = onRetake {
                        Button(action: onRetake) {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.counterclockwise")
                                Text("Retake Photos")
                            }
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Color(hex: "#78716c"))
                            .padding(.vertical, 14)
                            .padding(.horizontal, 24)
                            .background(Color.white)
                            .cornerRadius(30)
                            .overlay(
                                RoundedRectangle(cornerRadius: 30)
                                    .stroke(Color(hex: "#e7e5e4"), lineWidth: 1.5)
                            )
                        }
                    }

                    if let onComplete = onComplete {
                        Button(action: {
                            let rendered = CompositionCanvasRenderer.renderImage(
                                composition: composition,
                                capturedImages: capturedImages
                            )
                            onComplete(rendered)
                        }) {
                            HStack(spacing: 8) {
                                Text(paymentConfig?.requiresPayment == true ? "CONTINUE TO PAYMENT" : "CONTINUE TO DELIVERY")
                                Image(systemName: "arrow.right.circle.fill")
                            }
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.vertical, 14)
                            .padding(.horizontal, 32)
                            .background(
                                LinearGradient(
                                    colors: [Color(hex: "#d97706"), Color(hex: "#b45309")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .cornerRadius(30)
                            .shadow(color: Color(hex: "#d97706").opacity(0.35), radius: 8, x: 0, y: 4)
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(Color(hex: "#fcfaf6").ignoresSafeArea())
    }
}

// MARK: - Composition Canvas Renderer

public struct CompositionCanvasRenderer: View {
    public let composition: PackComposition
    public let capturedImages: [PlatformImage]

    public init(composition: PackComposition, capturedImages: [PlatformImage]) {
        self.composition = composition
        self.capturedImages = capturedImages
    }

    public var body: some View {
        GeometryReader { geo in
            let scaleX = geo.size.width / CGFloat(composition.width)
            let scaleY = geo.size.height / CGFloat(composition.height)
            let scale = min(scaleX, scaleY)
            let canvasW = CGFloat(composition.width) * scale
            let canvasH = CGFloat(composition.height) * scale

            ZStack(alignment: .topLeading) {
                // 1. Background Color
                Rectangle()
                    .fill(Color(hex: composition.background))
                    .frame(width: canvasW, height: canvasH)

                // 2. Dynamic Slots
                ForEach(composition.slots) { slot in
                    let slotX = CGFloat(slot.x) * scale
                    let slotY = CGFloat(slot.y) * scale
                    let slotW = CGFloat(slot.width) * scale
                    let slotH = CGFloat(slot.height) * scale
                    let imageIndex = slot.shotNumber - 1

                    ZStack {
                        if imageIndex >= 0 && imageIndex < capturedImages.count {
                            let img = capturedImages[imageIndex]
                            #if canImport(UIKit)
                            Image(uiImage: img)
                                .resizable()
                                .modifier(PhotoEffectModifier(effect: slot.effect))
                                .modifier(PhotoFitModifier(fit: slot.fit, width: slotW, height: slotH))
                            #elseif canImport(AppKit)
                            Image(nsImage: img)
                                .resizable()
                                .modifier(PhotoEffectModifier(effect: slot.effect))
                                .modifier(PhotoFitModifier(fit: slot.fit, width: slotW, height: slotH))
                            #endif
                        } else {
                            // Slot Placeholder
                            ZStack {
                                Color(hex: "#e7e5e4")
                                VStack(spacing: 6) {
                                    Image(systemName: "photo.fill")
                                        .font(.system(size: 28 * scale))
                                        .foregroundColor(Color(hex: "#a8a29e"))
                                    Text("Shot \(slot.shotNumber)")
                                        .font(.system(size: 14 * scale, weight: .medium))
                                        .foregroundColor(Color(hex: "#78716c"))
                                }
                            }
                        }
                    }
                    .frame(width: slotW, height: slotH)
                    .clipped()
                    .position(x: slotX + slotW / 2, y: slotY + slotH / 2)
                }

                // 3. Optional Overlay Frame
                if composition.overlayEnabled {
                    CompositionFrameOverlay(width: canvasW, height: canvasH, scale: scale)
                }

                // 4. Dynamic Backend Text Elements
                ForEach(composition.texts) { textItem in
                    let textX = CGFloat(textItem.x) * scale
                    let textY = CGFloat(textItem.y) * scale
                    let parsedFont = parseCSSFont(textItem.font, scale: scale)
                    let alignment = parseAlignment(textItem.align)

                    Text(textItem.text)
                        .font(parsedFont.font)
                        .foregroundColor(Color(hex: textItem.color))
                        .multilineTextAlignment(alignment)
                        .position(x: textX, y: textY)
                }
            }
            .frame(width: canvasW, height: canvasH)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
    }
}

// MARK: - Modifiers & Frame Overlay

private struct PhotoFitModifier: ViewModifier {
    let fit: String
    let width: CGFloat
    let height: CGFloat

    func body(content: Content) -> some View {
        if fit.lowercased() == "contain" {
            content
                .scaledToFit()
                .frame(width: width, height: height)
        } else {
            content
                .scaledToFill()
                .frame(width: width, height: height)
                .clipped()
        }
    }
}

private struct PhotoEffectModifier: ViewModifier {
    let effect: String?

    func body(content: Content) -> some View {
        switch effect?.lowercased() {
        case "black-and-white", "noir", "grayscale":
            content
                .grayscale(1.0)
                .contrast(1.1)
        case "sepia":
            content
                .colorMultiply(Color(red: 1.0, green: 0.92, blue: 0.82))
                .contrast(1.05)
        default:
            content
        }
    }
}

private struct CompositionFrameOverlay: View {
    let width: CGFloat
    let height: CGFloat
    let scale: CGFloat

    var body: some View {
        let inset = 14 * scale
        let lineWidth = 2.5 * scale

        ZStack {
            // Outer golden border
            RoundedRectangle(cornerRadius: 8 * scale)
                .stroke(Color(hex: "#c6a15b").opacity(0.85), lineWidth: lineWidth)
                .padding(inset)

            // Inner subtle border
            RoundedRectangle(cornerRadius: 6 * scale)
                .stroke(Color(hex: "#e8d5a3").opacity(0.6), lineWidth: 1.0 * scale)
                .padding(inset + 4 * scale)
        }
        .frame(width: width, height: height)
    }
}

// MARK: - CSS Font and Alignment Parsing Helpers

private struct ParsedFont {
    let font: Font
    let size: CGFloat
}

private func parseCSSFont(_ fontStr: String, scale: CGFloat) -> ParsedFont {
    var size: CGFloat = 16.0
    var isBold = false
    var isSerif = false

    if fontStr.contains("px") {
        let components = fontStr.components(separatedBy: "px")
        if let prefix = components.first?.components(separatedBy: " ").last,
           let parsedSize = Double(prefix) {
            size = CGFloat(parsedSize)
        }
    }

    if fontStr.contains("600") || fontStr.contains("700") || fontStr.contains("bold") {
        isBold = true
    }

    if fontStr.lowercased().contains("serif") || fontStr.lowercased().contains("garamond") {
        isSerif = true
    }

    let scaledSize = max(size * scale, 8.0)
    let weight: Font.Weight = isBold ? .bold : .medium
    let design: Font.Design = isSerif ? .serif : .default

    return ParsedFont(
        font: .system(size: scaledSize, weight: weight, design: design),
        size: scaledSize
    )
}

private func parseAlignment(_ align: String?) -> TextAlignment {
    switch align?.lowercased() {
    case "left", "leading", "start":
        return .leading
    case "right", "trailing", "end":
        return .trailing
    default:
        return .center
    }
}

// MARK: - Direct Image Rendering using Existing CompositionCanvasRenderer

extension CompositionCanvasRenderer {
    @MainActor
    public static func renderImage(
        composition: PackComposition,
        capturedImages: [PlatformImage],
        scale: CGFloat = 2.0
    ) -> PlatformImage? {
        let viewToRender = CompositionCanvasRenderer(
            composition: composition,
            capturedImages: capturedImages
        )
        .frame(width: CGFloat(composition.width), height: CGFloat(composition.height))

        let renderer = ImageRenderer(content: viewToRender)
        renderer.scale = scale
        renderer.proposedSize = ProposedViewSize(width: CGFloat(composition.width), height: CGFloat(composition.height))

        #if canImport(UIKit)
        return renderer.uiImage
        #elseif canImport(AppKit)
        return renderer.nsImage
        #else
        return nil
        #endif
    }
}

