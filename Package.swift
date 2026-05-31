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
    ],
    targets: [
        .target(
            name: "Vizzly",
            dependencies: [],
            path: "clients/swift/Sources/Vizzly"),
        .target(
            name: "VizzlyXCTest",
            dependencies: ["Vizzly"],
            path: "clients/swift/Sources/VizzlyXCTest"),
        .testTarget(
            name: "VizzlyTests",
            dependencies: ["Vizzly", "VizzlyXCTest"],
            path: "clients/swift/Tests/VizzlyTests"),
        .testTarget(
            name: "VizzlyE2ETests",
            dependencies: ["Vizzly"],
            path: "clients/swift/Tests/VizzlyE2ETests"),
    ]
)
