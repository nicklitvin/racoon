import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { DisplayInfo } from '../shared/ipc';
import { ClickThroughController } from './core/clickThrough';
import { clampFeet, type Point, type Rect } from './core/geometry';
import { Raccoon } from './components/Raccoon';
import type { Host } from './host';

interface AppProps {
  host: Host;
}

function toRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function App({ host }: AppProps) {
  const [display, setDisplay] = useState<DisplayInfo | null>(null);
  const [feet, setFeet] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const petRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<Point>({ x: 0, y: 0 });

  const clickThrough = useMemo(() => new ClickThroughController((on) => host.setInteractive(on)), [host]);

  useEffect(() => {
    let alive = true;
    void host.getDisplay().then((d) => alive && setDisplay(d));
    const unsubscribe = host.onDisplayChanged(setDisplay);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [host]);

  // Start on the floor in the middle; keep the raccoon on-screen when the display changes.
  useEffect(() => {
    if (!display) return;
    const { workArea } = display;
    setFeet((prev) => {
      const start = prev ?? { x: workArea.x + workArea.width / 2, y: workArea.y + workArea.height };
      const size = toRect(petRef.current) ?? { width: 0, height: 0 };
      return clampFeet(start, size, workArea);
    });
  }, [display]);

  // Mouse moves are forwarded even while the window is click-through,
  // which is how we notice the pointer arriving over the raccoon.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = toRect(petRef.current);
      if (rect) clickThrough.pointerMoved({ x: e.clientX, y: e.clientY }, rect);
    };
    const onLeave = () => clickThrough.pointerLeft();
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [clickThrough]);

  if (!display || !feet) return null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = { x: e.clientX - feet.x, y: e.clientY - feet.y };
    setDragging(true);
    clickThrough.dragStarted();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const size = toRect(petRef.current) ?? { width: 0, height: 0 };
    const next = { x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y };
    setFeet(clampFeet(next, size, display.workArea));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const rect = toRect(petRef.current);
    if (rect) clickThrough.dragEnded({ x: e.clientX, y: e.clientY }, rect);
  };

  return (
    <>
      <Raccoon
        ref={petRef}
        feet={feet}
        dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {host.kind === 'web' && <p className="web-hint">Drag the raccoon around.</p>}
    </>
  );
}
