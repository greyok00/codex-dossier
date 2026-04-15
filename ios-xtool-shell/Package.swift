// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "ios-xtool-shell",
    platforms: [
        .iOS(.v16),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "ios_xtool_shell",
            targets: ["ios_xtool_shell"]
        ),
    ],
    targets: [
        .target(
            name: "ios_xtool_shell",
            resources: [
                .copy("Resources/WebApp"),
            ]
        ),
    ]
)
