/** Small helpers shared by the SVG renderers. */

export const SVG_NS = 'http://www.w3.org/2000/svg';
/** Screen px per drawing unit at size 1. */
export const PX_PER_UNIT = 1.125;

export type Attrs = Record<string, string | number>;

/** Rounds to 2 decimals, so unchanged values compare equal and the DOM isn't touched. */
export const n = (value: number) => (Math.round(value * 100) / 100).toString();

export interface SvgWriter {
  /** Creates an element with attributes, optionally appending it to `parent`. */
  make(tag: string, attrs: Attrs, parent?: Element): SVGElement;
  /** Sets an attribute, skipping the DOM write when the value hasn't changed. */
  set(el: Element, name: string, value: string): void;
}

export function svgWriter(doc: Document): SvgWriter {
  const written = new Map<Element, Map<string, string>>();
  return {
    make(tag, attrs, parent) {
      const el = doc.createElementNS(SVG_NS, tag) as SVGElement;
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
      parent?.appendChild(el);
      return el;
    },
    set(el, name, value) {
      let attrs = written.get(el);
      if (!attrs) written.set(el, (attrs = new Map()));
      if (attrs.get(name) === value) return;
      attrs.set(name, value);
      el.setAttribute(name, value);
    },
  };
}
