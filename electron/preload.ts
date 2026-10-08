import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type HostBridge } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: HostBridge = {
  platform: process.platform,
  getDisplay: () => ipcRenderer.invoke(IPC.getDisplay),
  onDisplayChanged: (listener) => subscribe(IPC.displayChanged, listener),
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  onCursor: (listener) => subscribe(IPC.cursor, listener),
  onKeyPulse(listener) {
    // Deliberately drops any payload: the renderer only learns "a key was pressed".
    const handler = () => listener();
    ipcRenderer.on(IPC.keyPulse, handler);
    return () => ipcRenderer.removeListener(IPC.keyPulse, handler);
  },
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  onSettingsChanged: (listener) => subscribe(IPC.settingsChanged, listener),
  getKeyboardStatus: () => ipcRenderer.invoke(IPC.getKeyboardStatus),
  onKeyboardStatusChanged: (listener) => subscribe(IPC.keyboardStatusChanged, listener),
  recheckKeyboardAccess: () => ipcRenderer.invoke(IPC.recheckKeyboardAccess),
  openKeyboardPrivacySettings: () => ipcRenderer.send(IPC.openKeyboardPrivacySettings),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
};

contextBridge.exposeInMainWorld('racoonHost', bridge);
