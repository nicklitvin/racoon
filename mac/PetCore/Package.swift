// swift-tools-version:5.9
// PetCore: everything about the pet that isn't AppKit (how it behaves, how it's drawn into pixels,
// the settings and the patch notes), as a package so it builds and tests with `swift test`.
// The app itself (MyPet.xcodeproj, MyPet/) is the windows, the settings and the chat around it.
import PackageDescription

let package = Package(
    name: "PetCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "PetCore", targets: ["PetCore"]),
    ],
    targets: [
        .target(name: "PetCore", path: "Sources/PetCore"),
        .testTarget(name: "PetCoreTests", dependencies: ["PetCore"], path: "Tests/PetCoreTests"),
    ]
)
