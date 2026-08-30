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
        .library(
            name: "VizzlyXCTest",
            targets: ["VizzlyXCTest"]),
        .library(
            name: "VizzlyPreviewRuntime",
            type: .static,
            targets: ["VizzlyPreviewRuntime"]),
    ],
    targets: [
        .target(
            name: "Vizzly",
            dependencies: []),
        .target(
            name: "VizzlyXCTest",
            dependencies: ["Vizzly"]),
        .target(
            name: "CVizzlyPreviewRuntime",
            dependencies: [],
            publicHeadersPath: "include"),
        .target(
            name: "VizzlyPreviewRuntime",
            dependencies: ["CVizzlyPreviewRuntime"]),
        .testTarget(
            name: "VizzlyTests",
            dependencies: ["Vizzly", "VizzlyXCTest"]),
        .testTarget(
            name: "VizzlyE2ETests",
            dependencies: ["Vizzly"]),
    ]
)
