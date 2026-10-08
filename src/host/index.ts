import type { DisplayInfo, HostBridge, Point } from '../../shared/ipc';
import { normalizeSettings, type KeyboardStatus, type Settings } from '../../shared/settings';
import type { Host } from './types';

declare global {
  interface Window {
    racoonHost?: HostBridge;
  }
}

const SETTINGS_KEY = 'racoon.settings';
const OPEN_SETTINGS_EVENT = 'racoon:open-settings';

function electronHost(bridge: HostBridge): Host {
  return { ...bridge, kind: 'electron' };
}

function on<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void): () => void {
  window.addEventListener(type, handler);
  return () => window.removeEventListener(type, handler);
}

/**
 * In a browser tab the viewport is the raccoon's whole world. The page can only see
 * the pointer and keys while it has focus, and can't be click-through.
 */
function webHost(): Host {
  const viewport = (): DisplayInfo => ({
    width: window.innerWidth,
    height: window.innerHeight,
    workArea: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    scaleFactor: window.devicePixelRatio || 1,
  });

  const loadSettings = (): Settings => {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
    } catch {
      return normalizeSettings(undefined);
    }
  };

  let settings = loadSettings();
  const settingsListeners = new Set<(s: Settings) => void>();
  const statusListeners = new Set<(s: KeyboardStatus) => void>();
  const status = (): KeyboardStatus => ({
    enabled: settings.keyboardReactions,
    listening: settings.keyboardReactions,
    access: 'granted',
    message: null,
  });

  return {
    kind: 'web',
    platform: 'web',
    getDisplay: () => Promise.resolve(viewport()),
    onDisplayChanged: (listener) => on('resize', () => listener(viewport())),
    // A page can't make itself click-through; nothing to do.
    setInteractive() {},
    onCursor(listener) {
      const offs = [
        on('pointermove', (e) => listener({ x: e.clientX, y: e.clientY } satisfies Point)),
        on('pointerdown', (e) => listener({ x: e.clientX, y: e.clientY })),
      ];
      const leave = () => listener(null);
      document.documentElement.addEventListener('pointerleave', leave);
      return () => {
        offs.forEach((off) => off());
        document.documentElement.removeEventListener('pointerleave', leave);
      };
    },
    onKeyPulse(listener) {
      // The event is not inspected: no key, code or character is ever read.
      return on('keydown', () => listener());
    },
    getSettings: () => Promise.resolve(settings),
    updateSettings(patch) {
      settings = normalizeSettings({ ...settings, ...patch });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // Private mode or storage disabled: settings last for this visit only.
      }
      settingsListeners.forEach((l) => l(settings));
      statusListeners.forEach((l) => l(status()));
      return Promise.resolve(settings);
    },
    onSettingsChanged(listener) {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    getKeyboardStatus: () => Promise.resolve(status()),
    onKeyboardStatusChanged(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    recheckKeyboardAccess: () => Promise.resolve(status()),
    openKeyboardPrivacySettings() {},
    openSettings() {
      window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
    },
  };
}

export function getHost(): Host {
  return window.racoonHost ? electronHost(window.racoonHost) : webHost();
}

/** Web only: the pet page listens for this to open its in-page settings panel. */
export function onOpenSettingsRequest(listener: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}

export type { Host };
