import type { PointerEventHandler, Ref } from 'react';
import type { Point } from '../core/geometry';

// Stage 1 placeholder. Stage 2 replaces this with the animated sprite system.
const PLACEHOLDER = [
  '  /\\___/\\',
  ' ( @\\_/@ )',
  '  \\  v  /',
  '  /|   |\\______',
  ' (_|___|_)=#=#=#>',
].join('\n');

interface RaccoonProps {
  ref?: Ref<HTMLDivElement>;
  feet: Point;
  dragging: boolean;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
}

export function Raccoon({ ref, feet, dragging, ...handlers }: RaccoonProps) {
  return (
    <div
      ref={ref}
      className={dragging ? 'pet dragging' : 'pet'}
      // Positioned by its feet (bottom-centre) so the floor is just a y coordinate.
      style={{ transform: `translate3d(${feet.x}px, ${feet.y}px, 0) translate(-50%, -100%)` }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerUp}
    >
      <pre className="sprite">{PLACEHOLDER}</pre>
    </div>
  );
}
