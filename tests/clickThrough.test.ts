import { describe, expect, it } from 'vitest';
import { ClickThroughController } from '../src/core/clickThrough';

const pet = { x: 100, y: 100, width: 50, height: 40 };

function setup(margin = 6) {
  const calls: boolean[] = [];
  const controller = new ClickThroughController((on) => calls.push(on), margin);
  return { controller, calls };
}

describe('ClickThroughController', () => {
  it('starts click-through', () => {
    const { controller, calls } = setup();
    expect(controller.isInteractive).toBe(false);
    expect(calls).toEqual([]);
  });

  it('becomes interactive when the pointer is over the raccoon, and back when it leaves', () => {
    const { controller, calls } = setup();
    controller.pointerMoved({ x: 10, y: 10 }, pet);
    controller.pointerMoved({ x: 120, y: 120 }, pet);
    controller.pointerMoved({ x: 500, y: 500 }, pet);
    expect(calls).toEqual([true, false]);
  });

  it('counts the grab margin as part of the raccoon', () => {
    const { controller } = setup(6);
    controller.pointerMoved({ x: 95, y: 120 }, pet);
    expect(controller.isInteractive).toBe(true);
    controller.pointerMoved({ x: 93, y: 120 }, pet);
    expect(controller.isInteractive).toBe(false);
  });

  it('only notifies on changes', () => {
    const { controller, calls } = setup();
    for (let i = 0; i < 10; i++) controller.pointerMoved({ x: 110 + i, y: 110 }, pet);
    expect(calls).toEqual([true]);
  });

  it('stays interactive for the whole drag, even when the pointer outruns the sprite', () => {
    const { controller, calls } = setup();
    controller.pointerMoved({ x: 120, y: 120 }, pet);
    controller.dragStarted();
    controller.pointerMoved({ x: 900, y: 900 }, pet);
    controller.pointerLeft();
    expect(controller.isInteractive).toBe(true);
    controller.dragEnded({ x: 900, y: 900 }, pet);
    expect(calls).toEqual([true, false]);
  });

  it('stays interactive after a drag that ends over the raccoon', () => {
    const { controller } = setup();
    controller.dragStarted();
    controller.dragEnded({ x: 120, y: 120 }, pet);
    expect(controller.isInteractive).toBe(true);
  });

  it('releases the mouse when the pointer leaves the window', () => {
    const { controller } = setup();
    controller.pointerMoved({ x: 120, y: 120 }, pet);
    controller.pointerLeft();
    expect(controller.isInteractive).toBe(false);
  });
});
