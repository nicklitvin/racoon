import { describe, expect, it } from 'vitest';
import { HATS, OUTFITS } from '../shared/settings';
import { drawWearable, HAT_ITEMS, hatItem, OUTFIT_ITEMS, outfitItem } from '../src/sprites/outfits';

/** Just enough of an element for drawing into. */
interface Fake {
  tag: string;
  attrs: Record<string, string>;
  children: Fake[];
  setAttribute(name: string, value: string): void;
  appendChild(child: Fake): void;
  replaceChildren(): void;
}

function fakeElement(tag: string): Fake {
  const el: Fake = {
    tag,
    attrs: {},
    children: [],
    setAttribute: (name, value) => void (el.attrs[name] = value),
    appendChild: (child) => void el.children.push(child),
    replaceChildren: () => void (el.children = []),
  };
  return el;
}

describe('outfits', () => {
  it('has a drawing for every hat and outfit in the settings, and none for "none"', () => {
    for (const hat of HATS) expect(hatItem(hat) === null).toBe(hat === 'none');
    for (const outfit of OUTFITS) expect(outfitItem(outfit) === null).toBe(outfit === 'none');
  });

  it('keeps hats sitting on the head: their bottom near the crown, nothing far below it', () => {
    for (const [id, item] of Object.entries(HAT_ITEMS)) {
      const ys = item.shapes.flatMap((s) => (s.kind === 'poly' ? s.points.map(([, y]) => y) : [s.cy + s.ry]));
      // The head's top is at 0 and its middle at 1: a hat comes no lower than its middle.
      expect(Math.max(...ys), id).toBeLessThan(0.8);
      expect(Math.min(...ys), id).toBeLessThan(0.1);
    }
  });

  it('keeps neckwear round the neck and down the chest, not up over the face', () => {
    for (const [id, item] of Object.entries(OUTFIT_ITEMS)) {
      const ys = item.shapes.flatMap((s) => (s.kind === 'poly' ? s.points.map(([, y]) => y) : [s.cy - s.ry]));
      expect(Math.min(...ys), id).toBeGreaterThan(-0.7);
    }
  });

  it('draws an item as SVG shapes in its own colours, and clears it for "none"', () => {
    const g = fakeElement('g');
    const doc = { createElementNS: (_ns: string, tag: string) => fakeElement(tag) } as unknown as Document;
    drawWearable(doc, g as unknown as SVGElement, HAT_ITEMS.crown, 10, { line: '#000', width: 1 });
    expect(g.children.length).toBe(HAT_ITEMS.crown.shapes.length);
    expect(g.children[0]!.attrs.fill).toBe(HAT_ITEMS.crown.colours.main);
    // Lines come out the same thickness whatever size it's drawn at.
    expect(g.children[0]!.attrs['stroke-width']).toBe('0.1');
    drawWearable(doc, g as unknown as SVGElement, null, 10, { line: '#000', width: 1 });
    expect(g.children.length).toBe(0);
  });
});
