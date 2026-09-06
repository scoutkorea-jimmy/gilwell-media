import Foundation
import AppKit
import UniformTypeIdentifiers
import ImageIO

enum ImageCompressor {
    static let maxEdge: CGFloat = 2000
    static let jpegQuality: CGFloat = 0.82
    /// Soft cap for encoded binary payload (~4MB before base64 expansion).
    static let maxEncodedBytes = 4 * 1024 * 1024

    enum CompressError: LocalizedError {
        case unreadable
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .unreadable:
                return "이미지를 읽지 못했습니다."
            case .tooLarge:
                return "이미지가 너무 큽니다(약 4MB 초과). 더 작은 이미지로 줄인 뒤 다시 시도해 주세요."
            }
        }
    }

    /// Downscale / compress a file into a data URL suitable for API payloads.
    static func makeDataURL(from fileURL: URL) throws -> String {
        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw CompressError.unreadable
        }

        let ext = fileURL.pathExtension.lowercased()
        let alphaInfos: Set<CGImageAlphaInfo> = [
            .premultipliedLast, .premultipliedFirst, .last, .first
        ]
        let hasAlpha = alphaInfos.contains(cgImage.alphaInfo) || ext == "png"
        let scaled = downscale(cgImage, maxEdge: maxEdge)

        if hasAlpha, let png = encodePNG(scaled), png.count <= maxEncodedBytes {
            return "data:image/png;base64,\(png.base64EncodedString())"
        }
        if let jpeg = encodeJPEG(scaled, quality: jpegQuality), jpeg.count <= maxEncodedBytes {
            return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        }
        if let jpeg = encodeJPEG(scaled, quality: 0.65), jpeg.count <= maxEncodedBytes {
            return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        }
        let tiny = downscale(cgImage, maxEdge: 1280)
        if let jpeg = encodeJPEG(tiny, quality: 0.6), jpeg.count <= maxEncodedBytes {
            return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        }
        throw CompressError.tooLarge
    }

    static func approximateByteLength(ofDataURL dataURL: String) -> Int {
        guard let range = dataURL.range(of: "base64,") else { return dataURL.utf8.count }
        let b64 = String(dataURL[range.upperBound...])
        return (b64.count * 3) / 4
    }

    private static func downscale(_ image: CGImage, maxEdge: CGFloat) -> CGImage {
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        let longest = max(w, h)
        guard longest > maxEdge else { return image }
        let scale = maxEdge / longest
        let newW = max(1, Int((w * scale).rounded()))
        let newH = max(1, Int((h * scale).rounded()))
        let colorSpace = image.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: newW,
            height: newH,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return image }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: newW, height: newH))
        return ctx.makeImage() ?? image
    }

    private static func encodeJPEG(_ image: CGImage, quality: CGFloat) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return data as Data
    }

    private static func encodePNG(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return data as Data
    }
}
