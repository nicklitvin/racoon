import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type DisplayInfo, type HostBridge } from '../shared/ipc';

const bridge: HostBridge = {
  platform: process.platform,
  getDisplay: () => ipcRenderer.invoke(IPC.getDisplay),
  onDisplayChanged(listener) {
    const handler = (_event: IpcRendererEvent, display: DisplayInfo) => listener(display);
    ipcRenderer.on(IPC.displayChanged, handler);
    return () => ipcRenderer.removeListener(IPC.displayChanged, handler);
  },
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
};

contextBridge.exposeInMainWorld('racoonHost', bridge);
