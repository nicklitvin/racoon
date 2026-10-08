import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import path from 'node:path';
import { IPC, type DisplayInfo } from '../shared/ipc';
import { platform } from './platform';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let interactive = false;

function displayInfo(): DisplayInfo {
  const { bounds, workArea, scaleFactor } = screen.getPrimaryDisplay();
  return {
    width: bounds.width,
    height: bounds.height,
    workArea: {
      x: workArea.x - bounds.x,
      y: workArea.y - bounds.y,
      width: workArea.width,
      height: workArea.height,
    },
    scaleFactor,
  };
}

/**
 * Click-through by default: the window ignores the mouse, but `forward: true`
 * still delivers mousemove events to the renderer so it can tell when the
 * pointer is over the raccoon and ask to become interactive.
 */
function setInteractive(next: boolean) {
  if (!win || next === interactive) return;
  interactive = next;
  if (next) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
}

let refitTimer: NodeJS.Timeout | undefined;
function refitToPrimaryDisplay() {
  clearTimeout(refitTimer);
  // Display events arrive in bursts (resolution change, scaling change, dock/undock).
  refitTimer = setTimeout(() => {
    if (!win) return;
    win.setBounds(screen.getPrimaryDisplay().bounds);
    win.webContents.send(IPC.displayChanged, displayInfo());
  }, 150);
}

function createWindow() {
  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Never takes keyboard focus, so it can't steal it from the app you're using.
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep animating while other windows are focused.
      backgroundThrottling: false,
    },
  });

  platform.configureWindow(win);
  win.setIgnoreMouseEvents(true, { forward: true });

  // The pet window only ever shows our own UI.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.once('ready-to-show', () => win?.showInactive());
  win.on('closed', () => {
    win = null;
  });

  if (DEV_SERVER_URL) void win.loadURL(DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Racoon');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Racoon', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  platform.configureApp(app);

  ipcMain.handle(IPC.getDisplay, () => displayInfo());
  ipcMain.on(IPC.setInteractive, (_event, next: unknown) => setInteractive(next === true));

  void app.whenReady().then(() => {
    createWindow();
    createTray();
    screen.on('display-metrics-changed', refitToPrimaryDisplay);
    screen.on('display-added', refitToPrimaryDisplay);
    screen.on('display-removed', refitToPrimaryDisplay);
  });

  app.on('window-all-closed', () => app.quit());
}
