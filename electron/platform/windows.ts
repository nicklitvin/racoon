import type { BrowserWindow } from 'electron';
import { watchDesktopSwitches } from './desktopSwitches';
import type { PlatformAdapter } from './types';

type SetWindowPos = (hwnd: bigint, after: bigint, x: number, y: number, w: number, h: number, flags: number) => boolean;
let setWindowPos: SetWindowPos | null | undefined;

const HWND_TOPMOST = -1n;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;

/**
 * To the very front of the always-on-top windows, where it was when it opened, without moving,
 * resizing or activating it.
 */
function raise(win: BrowserWindow): void {
  if (setWindowPos === undefined) {
    try {
      const koffi = require('koffi') as typeof import('koffi');
      setWindowPos = koffi.load('user32.dll').func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int w, int h, uint32_t flags)') as SetWindowPos;
    } catch {
      setWindowPos = null;
    }
  }
  if (!setWindowPos) return;
  const handle = win.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0));
  setWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
}

export const windowsPlatform: PlatformAdapter = {
  configureApp(app) {
    // Groups the taskbar button and notifications under a stable identity (the installer's shortcuts use it too).
    app.setAppUserModelId('com.nicklitvin.racoon');
  },
  configureWindow(win) {
    // 'screen-saver' keeps the pet above normal always-on-top windows such as the taskbar.
    win.setAlwaysOnTop(true, 'screen-saver');
  },
  watchDesktopSwitches,
  raiseWindow: raise,
  presentWindow(_app, win) {
    win.show();
    win.focus();
  },
  keyboardAccess: {
    // Windows has no permission gate for a low-level keyboard hook.
    check: () => 'granted',
    request: () => 'granted',
    deniedMessage: '',
    openSettings() {},
  },
};
