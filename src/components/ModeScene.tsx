import { useEffect, useRef } from 'react';
import type { Hat, Outfit, PetMode, RaccoonType } from '../../shared/settings';
import { ANIMATIONS, RACCOON_STYLES, type AnimationName } from '../sprites';
import { PLAY } from '../sprites/animations';
import { createDeskDrawing, type DeskDrawing } from '../sprites/desk';
import { PIXEL_PX, PIXEL_TOY } from '../sprites/pixel';
import { createToyDrawing } from '../sprites/toys';

/** The pet is drawn at two screen pixels to each of its pixels. */
const SCALE = 2 / 3;
/** The floor, px up from the bottom of the picture. */
const FLOOR = 12;
/** How long the swat in the play picture waits before the next, ms. */
const BAT_PAUSE_MS = 1400;

interface SceneProps {
  mode: PetMode;
  type: RaccoonType;
  hat: Hat;
  outfit: Outfit;
}

/** Puts `el` with the point `(ax, ay)` (fractions of its size) at `x` px from the middle and `y` px up from the floor. */
function place(el: HTMLElement, x: number, y: number, ax = 0.5, ay = 1): void {
  el.style.position = 'absolute';
  el.style.left = `calc(50% + ${x}px)`;
  el.style.bottom = `${FLOOR + y}px`;
  el.style.transform = `translate(${-ax * 100}%, ${(1 - ay) * 100}%)`;
}

/**
 * A little picture of what your pet does in a mode, with your pet in it, dressed as it is:
 * swatting its blocks about, typing away at its desk, asleep under the moon, or running off.
 */
export function ModeScene({ mode, type, hat, outfit }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const renderer = RACCOON_STYLES[type].create(document);
    renderer.setScale(SCALE);
    renderer.dress?.({ hat, outfit });
    const pet = renderer.element as HTMLElement;
    const anchor = renderer.anchor ?? { x: 0.5, y: 1 };
    // His height above his feet, as the desk is sized to it on the screen.
    const unit = renderer.baseSize.height * SCALE * anchor.y;
    const parts: HTMLElement[] = [];
    let desk: DeskDrawing | null = null;
    let animation: AnimationName = 'idle';
    let velocity = { x: 0, y: 0 };

    if (mode === 'play') {
      animation = 'bat';
      const size = PIXEL_TOY * PIXEL_PX * SCALE;
      const reach = (renderer.toyReach ?? 30) * SCALE;
      const petX = -reach / 2 - 10;
      place(pet, petX, 0, anchor.x, anchor.y);
      const blocks: [number, number, number][] = [
        [petX + reach, 0, 0],
        [petX + reach + size * 1.6, 0, 1],
        [petX + reach + size * 1.6 + size * 0.15, size, 2],
      ];
      for (const [x, y, face] of blocks) {
        const block = createToyDrawing(document, 'pixel', face, size);
        block.draw(face === 2 ? 15 : 0);
        const el = block.element as HTMLElement;
        place(el, x, y + size / 2, 0.5, 0.5);
        parts.push(el);
      }
    } else if (mode === 'work') {
      animation = 'work';
      const reach = renderer.deskReach ? { x: renderer.deskReach.x * SCALE, y: renderer.deskReach.y * SCALE } : { x: unit * 0.3, y: -unit * 0.35 };
      const mouse = renderer.mouseReach ? { x: renderer.mouseReach.x * SCALE, y: renderer.mouseReach.y * SCALE } : { x: reach.x + unit * 0.15, y: reach.y };
      desk = createDeskDrawing(document, unit, -reach.y, mouse.x - reach.x, PIXEL_PX * SCALE);
      // Him and his desk together, in the middle: his tail sticks out about half his height behind him.
      const seat = desk.keyboardX - reach.x;
      const left = seat - unit * 0.5;
      const deskLeft = -(left + desk.width) / 2;
      place(desk.element, deskLeft, -desk.below, 0, 1);
      parts.push(desk.element);
      place(pet, deskLeft + seat, 0, anchor.x, anchor.y);
    } else if (mode === 'sleep') {
      animation = 'sleep';
      place(pet, 0, 0, anchor.x, anchor.y);
    } else {
      // Off he goes, past the edge.
      animation = 'run';
      velocity = { x: 240, y: 0 };
      pet.style.position = 'absolute';
      pet.style.left = 'calc(100% - 18px)';
      pet.style.bottom = `${FLOOR}px`;
      pet.style.transform = `translate(${-anchor.x * 100}%, ${(1 - anchor.y) * 100}%)`;
    }
    host.replaceChildren(...parts, pet);

    const spec = ANIMATIONS[animation];
    const start = performance.now();
    const draw = (now: number) => {
      const t = now - start + 1000;
      const timeMs = animation === 'bat' ? Math.min(t % (PLAY.batMs + BAT_PAUSE_MS), PLAY.batMs) : spec.loop ? t % spec.durationMs : t;
      renderer.draw({ animation, timeMs, clockMs: now, keystrokes: 0, eyes: spec.eyes, heading: 0, velocity });
      desk?.show('terminal', now);
    };
    draw(start);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => host.replaceChildren();
    let frame = requestAnimationFrame(function tick(now) {
      draw(now);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      host.replaceChildren();
    };
  }, [mode, type, hat, outfit]);

  return <div className={`mode-scene mode-scene-${mode}`} ref={ref} aria-hidden="true" />;
}
