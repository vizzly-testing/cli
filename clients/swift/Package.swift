// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "Vizzly",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15)
    ],
    products: [
        .library(
            name: "Vizzly",
            targets: ["Vizzly"]),
    ],
    targets: [
        .target(
            name: "Vizzly",
            dependencies: []),
        .testTarget(
            name: "VizzlyTests",
            dependencies: ["Vizzly"]),
    ]
)
