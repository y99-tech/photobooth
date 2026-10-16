// swift-tools-version: 6.0
// Photobooth Remote for iPhone — built with xtool (https://xtool.sh), no Xcode project needed:
//   cd mobile/ios && xtool dev
import PackageDescription

let package = Package(
    name: "PhotoboothRemote",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project contains exactly one library product: the app.
        .library(
            name: "PhotoboothRemote",
            targets: ["PhotoboothRemote"]
        ),
    ],
    targets: [
        .target(
            name: "PhotoboothRemote",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
