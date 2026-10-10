import type { RaccoonType } from '../../shared/settings';
import { createArenaRaccoon, type ArenaOptions } from './arenaRaccoon';
import { withArtStyle, type ArtStyle } from './artStyles';
import { createCat, type CatBreed } from './cat2d';
import { createCartoonRaccoon } from './cartoonRaccoon';
import { createSvgRaccoon } from './svgRaccoon';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export { poseFor } from './pose';
export { createArenaRaccoon, createCartoonRaccoon, createCat, createSvgRaccoon, withArtStyle };
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type Species = 'raccoon' | 'cat';

export interface PetStyle {
  label: string;
  description: string;
  species: Species;
  create: (doc?: Document) => RaccoonRenderer;
}

const arena = (options: ArenaOptions) => (doc?: Document) => createArenaRaccoon(doc, options);
const cat = (breed: CatBreed, art?: ArtStyle) => (doc?: Document) => {
  const renderer = createCat(doc, breed);
  return art ? withArtStyle(renderer, art, doc) : renderer;
};
const styled = (create: (doc?: Document) => RaccoonRenderer, art: ArtStyle) => (doc?: Document) => withArtStyle(create(doc), art, doc);

/** Every pet the settings offer, with its label and renderer. */
export const RACCOON_STYLES: Record<RaccoonType, PetStyle> = {
  arena: {
    species: 'raccoon',
    label: 'Arena (3D)',
    description: 'A chunky toy seen from above like a strategy game, turning any way he goes.',
    create: arena({}),
  },
  'arena-low': {
    species: 'raccoon',
    label: 'Low angle (3D)',
    description: 'The 3D toy from a low camera, almost side-on.',
    create: arena({ cameraDeg: 28 }),
  },
  'arena-top': {
    species: 'raccoon',
    label: 'Top-down (3D)',
    description: 'Seen from high overhead, like a board game piece.',
    create: arena({ cameraDeg: 72 }),
  },
  'arena-cel': {
    species: 'raccoon',
    label: 'Cel-shaded hopper (3D)',
    description: 'Flat cartoon shading, and he hops on every step.',
    create: arena({ shading: 'cel', hop: 5, className: 'arena-bright' }),
  },
  cartoon: { species: 'raccoon', label: 'Cartoon', description: 'Round, chubby and bouncy.', create: (doc) => createCartoonRaccoon(doc) },
  plush: { species: 'raccoon', label: 'Plush', description: 'A big-headed, big-eyed cuddly toy.', create: (doc) => createCartoonRaccoon(doc, 'plush') },
  classic: { species: 'raccoon', label: 'Classic', description: 'The original, simpler raccoon.', create: createSvgRaccoon },
  'raccoon-pixel': {
    species: 'raccoon',
    label: 'Pixel art',
    description: 'Chunky pixels and choppy 8 fps movement, like an old game sprite.',
    create: styled((doc) => createCartoonRaccoon(doc), 'pixel'),
  },
  'raccoon-sketch': {
    species: 'raccoon',
    label: 'Pencil sketch',
    description: 'Wobbly pencil lines that redraw themselves, like a flipbook.',
    create: styled((doc) => createCartoonRaccoon(doc), 'sketch'),
  },
  'raccoon-sticker': {
    species: 'raccoon',
    label: 'Sticker',
    description: 'The plush raccoon as a die-cut sticker with a white border.',
    create: styled((doc) => createCartoonRaccoon(doc, 'plush'), 'sticker'),
  },
  'raccoon-neon': {
    species: 'raccoon',
    label: 'Neon sign',
    description: 'Drawn in glowing tubes. Best on a dark background.',
    create: styled((doc) => createCartoonRaccoon(doc), 'neon'),
  },

  cat: { species: 'cat', label: 'Black cat (2D)', description: 'Sleek and smooth, with Disney-style follow-through.', create: cat('black') },
  'cat-tabby': { species: 'cat', label: 'Ginger tabby', description: 'Stripy and cheerful, with a little spring in each step.', create: cat('tabby') },
  'cat-siamese': { species: 'cat', label: 'Siamese', description: 'Elegant and unhurried: long, soft, graceful moves.', create: cat('siamese') },
  'cat-kitten': { species: 'cat', label: 'Kitten', description: 'Big head, big eyes, and far too much bounce.', create: cat('kitten') },
  'cat-chonk': { species: 'cat', label: 'Chonky tuxedo', description: 'A round, lazy cat who waddles and takes his time.', create: cat('chonk') },
  'cat-hose': {
    species: 'cat',
    label: 'Rubber hose (1930s)',
    description: 'Noodle legs, white gloves and a constant bounce, on flickering old film.',
    create: cat('hose', 'film'),
  },
  'cat-snappy': {
    species: 'cat',
    label: 'Limited animation',
    description: 'A white cat in bold ink that snaps between poses at 12 fps, like TV cartoons.',
    create: cat('snappy', 'ink'),
  },
  'cat-3d': {
    species: 'cat',
    label: 'Toy cat (3D)',
    description: 'A ginger vinyl toy seen from above, turning any way.',
    create: arena({ species: 'cat', className: 'arena-ginger' }),
  },
  'cat-3d-top': {
    species: 'cat',
    label: 'Cel-shaded cat (3D)',
    description: 'A black cat from high overhead, cel-shaded, hopping as it goes.',
    create: arena({ species: 'cat', cameraDeg: 66, shading: 'cel', hop: 4, className: 'arena-black-cat' }),
  },
  'cat-pixel': { species: 'cat', label: 'Pixel tabby', description: 'The ginger tabby as an 8 fps pixel sprite.', create: cat('tabby', 'pixel') },
  'cat-sketch': { species: 'cat', label: 'Sketched siamese', description: 'Pencil lines that boil, on the graceful siamese.', create: cat('siamese', 'sketch') },
  'cat-neon': { species: 'cat', label: 'Neon cat', description: 'The black cat in glowing pink tubes.', create: cat('black', 'neon') },
};
