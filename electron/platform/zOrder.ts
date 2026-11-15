/**
 * Keeps the pet's window in front of every other window on Windows.
 *
 * It's always on top, but so are some other apps (some typing apps, overlays, pop-ups), and
 * whichever was brought up last goes in front. So every few milliseconds this looks at what's
 * stacked above the pet's window, and if anything visible over its screen is, puts the pet's
 * window back in front of it, without taking focus from the app you're using. Windows the
 * system keeps above every app (the Start menu, Task View) can't be got in front of: once
 * raising doesn't help against one, it's left alone until something else is on top.
 *
 * Only looks at where windows are stacked and whether they show: nothing about what's in them.
 */

import type { BrowserWindow } from 'electron';

type Koffi = typeof import('koffi');

const CHECK_EVERY_MS = 30;
const GW_HWNDPREV = 3;
const DWMWA_CLOAKED = 14;
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface User32 {
  getWindow(hwnd: number, cmd: number): number;
  isVisible(hwnd: number): boolean;
  rect(hwnd: number): Rect | null;
  cloaked(hwnd: number): boolean;
  raise(hwnd: number): void;
}

let api: User32 | null | undefined;

function load(): User32 | null {
  if (api !== undefined) return api;
  try {
    const koffi = require('koffi') as Koffi;
    const user32 = koffi.load('user32.dll');
    const dwmapi = koffi.load('dwmapi.dll');
    // Named, for the signatures below.
    koffi.struct('RECT', { left: 'int', top: 'int', right: 'int', bottom: 'int' });
    const GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)');
    const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)');
    const GetWindowRect = user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)');
    const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int w, int h, uint32_t flags)');
    const DwmGetWindowAttribute = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attribute, _Out_ int *value, uint32_t size)');
    api = {
      getWindow: (hwnd, cmd) => Number(GetWindow(hwnd, cmd)),
      isVisible: (hwnd) => IsWindowVisible(hwnd) as boolean,
      rect(hwnd) {
        const r = {} as Rect;
        return GetWindowRect(hwnd, r) ? r : null;
      },
      cloaked(hwnd) {
        const value = [0];
        return DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, value, 4) === 0 && value[0] !== 0;
      },
      raise(hwnd) {
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
      },
    };
  } catch {
    api = null;
  }
  return api;
}

export function hwndOf(win: BrowserWindow): number {
  const handle = win.getNativeWindowHandle();
  return Number(handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0)));
}

/** To the very front of the always-on-top windows, without moving, resizing or activating it. */
export function raiseWindow(win: BrowserWindow): void {
  load()?.raise(hwndOf(win));
}

/** The nearest window stacked above `hwnd` that shows over it, or 0 if nothing does. */
function covering(user32: User32, hwnd: number): number {
  const mine = user32.rect(hwnd);
  if (!mine) return 0;
  for (let above = user32.getWindow(hwnd, GW_HWNDPREV); above; above = user32.getWindow(above, GW_HWNDPREV)) {
    if (!user32.isVisible(above) || user32.cloaked(above)) continue;
    const r = user32.rect(above);
    if (!r || r.right <= r.left || r.bottom <= r.top) continue;
    if (r.right <= mine.left || r.left >= mine.right || r.bottom <= mine.top || r.top >= mine.bottom) continue;
    return above;
  }
  return 0;
}

/** Keeps `win` in front of everything it can be. Returns a function that stops. */
export function keepInFront(win: BrowserWindow): () => void {
  const user32 = load();
  if (!user32) return () => {};
  const hwnd = hwndOf(win);
  // A window it couldn't be got in front of (one the system keeps above every app).
  let beyond = 0;
  const timer = setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return;
    const above = covering(user32, hwnd);
    if (!above) {
      beyond = 0;
      return;
    }
    if (above === beyond) return;
    user32.raise(hwnd);
    beyond = covering(user32, hwnd) === above ? above : 0;
  }, CHECK_EVERY_MS);
  return () => clearInterval(timer);
}
