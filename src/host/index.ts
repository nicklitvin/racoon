import type { DisplayInfo, HostBridge } from '../../shared/ipc';
import type { Host } from './types';

declare global {
  interface Window {
    racoonHost?: HostBridge;
  }
}

function electronHost(bridge: HostBridge): Host {
  return {
    kind: 'electron',
    platform: bridge.platform,
    getDisplay: () => bridge.getDisplay(),
    onDisplayChanged: (listener) => bridge.onDisplayChanged(listener),
    setInteractive: (interactive) => bridge.setInteractive(interactive),
  };
}

/** In a browser tab the viewport is the raccoon's whole world. */
function webHost(): Host {
  const viewport = (): DisplayInfo => ({
    width: window.innerWidth,
    height: window.innerHeight,
    workArea: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    scaleFactor: window.devicePixelRatio || 1,
  });
  return {
    kind: 'web',
    platform: 'web',
    getDisplay: () => Promise.resolve(viewport()),
    onDisplayChanged(listener) {
      const onResize = () => listener(viewport());
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    },
    // A page can't make itself click-through; nothing to do.
    setInteractive() {},
  };
}

export function getHost(): Host {
  return window.racoonHost ? electronHost(window.racoonHost) : webHost();
}

export type { Host };
