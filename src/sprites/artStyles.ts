import { ANIMATIONS } from './animations';
import { SVG_NS } from './svg';
import { ANIMATION_NAMES, type AnimationName, type AnimationSpec, type RaccoonRenderer } from './types';

/**
 * Art styles that can be laid over any pet drawing: an SVG filter on the whole picture,
 * plus, for some, a change of frame rate. The pet underneath is drawn exactly as usual,
 * so every style works with every species and camera.
 */
export type ArtStyle = 'pixel' | 'sketch' | 'sticker' | 'neon' | 'ink' | 'film';

interface StyleSpec {
  /** Filter primitives, as markup; `{seed}` is replaced while the lines "boil". */
  filter: string;
  /** Redraw at most this often, for a choppier, hand-made rhythm. */
  fps?: number;
  /** Re-roll the filter's noise this often (ms) so lines wobble like redrawn frames. */
  boilMs?: number;
}

const STYLES: Record<ArtStyle, StyleSpec> = {
  // Chunky pixels: sample the picture once per 3x3 block and fill the block with it.
  // Moves at 8 fps like an old sprite.
  pixel: {
    fps: 8,
    filter: `
      <feFlood x="{x1}" y="{y1}" width="0.7" height="0.7" flood-color="#000" result="dot"/>
      <feComposite in="dot" x="{x}" y="{y}" width="3" height="3" result="cell"/>
      <feTile in="cell" result="grid"/>
      <feComposite in="SourceGraphic" in2="grid" operator="in" result="samples"/>
      <feMorphology in="samples" operator="dilate" radius="1.5" result="blocks"/>
      <feComponentTransfer in="blocks"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>`,
  },
  // Pencil on paper: soft colour, a graphite outline, and lines that "boil" 8 times a second.
  sketch: {
    fps: 12,
    boilMs: 125,
    filter: `
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="{seed}" result="noise"/>
      <feColorMatrix in="SourceGraphic" type="saturate" values="0.45" result="pale"/>
      <feComponentTransfer in="pale" result="wash"><feFuncA type="linear" slope="0.82"/></feComponentTransfer>
      <feDisplacementMap in="wash" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="fill"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="fat"/>
      <feComposite in="fat" in2="SourceAlpha" operator="out" result="ring"/>
      <feDisplacementMap in="ring" in2="noise" scale="3.4" xChannelSelector="G" yChannelSelector="R" result="wobbly"/>
      <feFlood flood-color="#3b3640" result="graphite"/>
      <feComposite in="graphite" in2="wobbly" operator="in" result="line"/>
      <feMerge><feMergeNode in="fill"/><feMergeNode in="line"/></feMerge>`,
  },
  // A die-cut sticker: thick white border and a soft shadow underneath.
  sticker: {
    filter: `
      <feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="fat"/>
      <feFlood flood-color="#ffffff" result="white"/>
      <feComposite in="white" in2="fat" operator="in" result="border"/>
      <feGaussianBlur in="fat" stdDeviation="1.6" result="blur"/>
      <feOffset in="blur" dx="1.2" dy="2.4" result="drop"/>
      <feComponentTransfer in="drop" result="shadow"><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/></feMerge>`,
  },
  // Glowing tubes: edges of every shape and colour change, lit up and blurred into a glow.
  neon: {
    filter: `
      <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
      <feComponentTransfer in="lum" result="lumA"><feFuncA type="linear" slope="2" intercept="0.15"/></feComponentTransfer>
      <feComposite in="lumA" in2="SourceAlpha" operator="in" result="shape"/>
      <feConvolveMatrix in="shape" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="false" result="edges"/>
      <feComponentTransfer in="edges" result="lines"><feFuncA type="linear" slope="4"/></feComponentTransfer>
      <feFlood style="flood-color: var(--neon, #42f5e3)" result="tube"/>
      <feComposite in="tube" in2="lines" operator="in" result="lit"/>
      <feGaussianBlur in="lit" stdDeviation="1.8" result="glow"/>
      <feFlood flood-color="#ffffff" result="core"/>
      <feComposite in="core" in2="lines" operator="in" result="hot"/>
      <feComponentTransfer in="hot" result="dimHot"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="lit"/><feMergeNode in="dimHot"/></feMerge>`,
  },
  // Bold comic-book ink line round the silhouette.
  ink: {
    filter: `
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat"/>
      <feFlood flood-color="#1d1a24" result="ink"/>
      <feComposite in="ink" in2="fat" operator="in" result="line"/>
      <feMerge><feMergeNode in="line"/><feMergeNode in="SourceGraphic"/></feMerge>`,
  },
  // A 1930s print: sepia, grain that flickers every frame, and a jittery gate.
  film: {
    fps: 12,
    boilMs: 83,
    filter: `
      <feColorMatrix in="SourceGraphic" type="matrix" values="0.36 0.62 0.15 0 0  0.33 0.58 0.13 0 0  0.27 0.47 0.11 0 0  0 0 0 1 0" result="sepia"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="{seed}" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0 0 0 -0.15" result="specks"/>
      <feComposite in="specks" in2="SourceAlpha" operator="in" result="dirt"/>
      <feMerge><feMergeNode in="sepia"/><feMergeNode in="dirt"/></feMerge>`,
  },
};

let ids = 0;

/** Wraps a pet drawing in an art style. Everything else about the pet is unchanged. */
export function withArtStyle(inner: RaccoonRenderer, style: ArtStyle, doc: Document = document): RaccoonRenderer {
  const spec = STYLES[style];
  const svg = inner.element as SVGSVGElement;
  const id = `art-${style}-${++ids}`;
  const box = svg.viewBox.baseVal;
  // Lay the filter over everything the pet draws, in the drawing's own units.
  const art = doc.createElementNS(SVG_NS, 'g');
  for (const child of [...svg.childNodes]) {
    if ((child as Element).tagName !== 'defs') art.appendChild(child);
  }
  svg.appendChild(art);
  svg.classList.add(`art-${style}`);

  const filter = doc.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const margin = 8;
  // Pixel blocks line up with whole drawing units from the box's corner.
  const x = Math.floor(box.x - margin);
  const y = Math.floor(box.y - margin);
  filter.setAttribute('x', String(x));
  filter.setAttribute('y', String(y));
  filter.setAttribute('width', String(box.width + margin * 2));
  filter.setAttribute('height', String(box.height + margin * 2));
  const markup = (seed: number) =>
    spec.filter
      .replaceAll('{seed}', String(seed))
      .replaceAll('{x1}', String(x + 1))
      .replaceAll('{y1}', String(y + 1))
      .replaceAll('{x}', String(x))
      .replaceAll('{y}', String(y));
  // Parsed as SVG so the primitives get the right namespace.
  const setPrimitives = (seed: number) => {
    const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup(seed)}</svg>`, 'image/svg+xml');
    filter.replaceChildren(...[...parsed.documentElement.childNodes].map((node) => doc.importNode(node, true)));
  };
  setPrimitives(1);
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  defs.appendChild(filter);
  art.setAttribute('filter', `url(#${id})`);

  const animations: Partial<Record<AnimationName, Partial<AnimationSpec>>> = { ...inner.animations };
  if (spec.fps) {
    for (const name of ANIMATION_NAMES) {
      const own = { ...ANIMATIONS[name], ...inner.animations?.[name] };
      animations[name] = { ...inner.animations?.[name], fps: Math.min(spec.fps, own.fps) };
    }
  }

  let seed = 1;
  let jitter = '';
  return {
    element: inner.element,
    figure: inner.figure,
    baseSize: inner.baseSize,
    anchor: inner.anchor,
    peekSink: inner.peekSink,
    turnsItself: inner.turnsItself,
    animations,
    isSettling: inner.isSettling?.bind(inner),
    setScale: (scale) => inner.setScale(scale),
    draw(frame) {
      inner.draw(frame);
      if (spec.boilMs && frame.clockMs !== undefined) {
        const next = 1 + (Math.floor(frame.clockMs / spec.boilMs) % 6);
        if (next !== seed) {
          seed = next;
          setPrimitives(seed);
          if (style === 'film') {
            // Gate weave: the whole picture shudders a fraction each frame.
            const shift = `translate(${((seed * 37) % 5) * 0.15 - 0.3} ${((seed * 53) % 5) * 0.15 - 0.3})`;
            if (shift !== jitter) art.setAttribute('transform', (jitter = shift));
          }
        }
      }
    },
  };
}
