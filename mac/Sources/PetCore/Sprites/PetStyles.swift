import Foundation

/// A pet the settings offer: its name, a line about it, and its drawing (src/sprites/index.ts).
public struct PetStyle {
    public var label: String
    public var description: String
    /// The animal it moves like (none for a floaty, which isn't one, or the goose).
    public var species: ChibiSpecies?
    public var create: () -> PetRenderer
}

public let PET_STYLES: [PetType: PetStyle] = [
    .raccoonPixel: PetStyle(label: "Pixel raccoon", description: "A little bandit straight out of an old video game, every pixel placed.", species: .raccoon, create: { PixelPet(PIXEL_RACCOON, PIXEL_COATS[.raccoon]!) }),
    .catPixel: PetStyle(label: "Pixel tabby", description: "A ginger kitten in chunky pixels, ready to swat things off your desk.", species: .cat, create: { PixelPet(PIXEL_CAT, PIXEL_COATS[.ginger]!) }),
    .otterPixel: PetStyle(label: "Pixel otter", description: "Paddles about in a pixel pond and floats on its back with its shell.", species: .otter, create: { PixelPet(PIXEL_OTTER, PIXEL_COATS[.otter]!) }),
    .bunnyPixel: PetStyle(label: "Pixel bunny", description: "Hops everywhere, ears laid back, and sits up now and then to have a look round.", species: .bunny, create: { PixelPet(PIXEL_BUNNY, PIXEL_COATS[.bunny]!) }),
    .hedgehogPixel: PetStyle(label: "Pixel hedgehog", description: "Snuffles about on little legs, and rolls up into a spiky ball to go fast, to nap, or when you startle it.", species: .hedgehog, create: { PixelPet(PIXEL_HEDGEHOG, PIXEL_COATS[.hedgehog]!) }),
    .goosePixel: PetStyle(label: "Pixel goose", description: "A horrible goose. Honks at you, chases your pointer with its wings out, and runs off with the blocks.", species: nil, create: { GoosePet() }),
    .blipFloaty: PetStyle(label: "Blip", description: "A round little blue floaty with an antenna. Bobs about in the air and waves its floating hands.", species: nil, create: { FloatyPet(.blip) }),
    .mochiFloaty: PetStyle(label: "Mochi", description: "A soft, squishy pink floaty with a leaf sprouting on top, drifting about wherever it likes.", species: nil, create: { FloatyPet(.mochi) }),
    .emberFloaty: PetStyle(label: "Ember", description: "A little orange drop of a floaty with a flickering tip, like a candle flame that wandered off.", species: nil, create: { FloatyPet(.ember) }),
]

/// A new drawing of the pet.
public func createPet(_ type: PetType) -> PetRenderer { PET_STYLES[type]!.create() }

/// "Pixel raccoon" is just "Raccoon" on its tile: they're all pixel pets.
public func shortName(_ type: PetType) -> String {
    var name = PET_STYLES[type]!.label
    if name.lowercased().hasPrefix("pixel ") { name = String(name.dropFirst(6)) }
    return name.prefix(1).uppercased() + name.dropFirst()
}
