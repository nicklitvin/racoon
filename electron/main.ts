import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray, type WebContents } from 'electron';
import path from 'node:path';
import { IPC, type DisplayInfo } from '../shared/ipc';
import type { KeyboardStatus, Settings } from '../shared/settings';
import { CursorMonitor } from './cursorMonitor';
import { KeyboardMonitor } from './keyboardMonitor';
import { platform } from './platform';
import { SettingsStore } from './settingsStore';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PRELOAD = path.join(__dirname, 'preload.js');
const ASSETS = path.join(__dirname, '../assets');

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let interactive = false;
let petVisible = true;

let store: SettingsStore;
let cursorMonitor: CursorMonitor;
let keyboardStatus: KeyboardStatus = { enabled: false, listening: false, access: 'granted', message: null };

const keyboardMonitor = new KeyboardMonitor(() => {
  // An empty pulse: no key information exists past this point.
  petWindow?.webContents.send(IPC.keyPulse);
});

// ---- Helpers --------------------------------------------------------------------------

function loadRenderer(win: BrowserWindow, view: 'pet' | 'settings') {
  const hash = view === 'settings' ? 'settings' : '';
  if (DEV_SERVER_URL) void win.loadURL(hash ? `${DEV_SERVER_URL}#${hash}` : DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'), { hash });
}

function lockDown(contents: WebContents) {
  // Our windows only ever show our own UI.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

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

// ---- Pet overlay window ------------------------------------------------------------

/**
 * Click-through by default: the window ignores the mouse, but `forward: true`
 * still delivers mousemove events to the renderer so it can tell when the
 * pointer is over the raccoon and ask to become interactive.
 */
function setInteractive(next: boolean) {
  if (!petWindow || next === interactive) return;
  interactive = next;
  if (next) petWindow.setIgnoreMouseEvents(false);
  else petWindow.setIgnoreMouseEvents(true, { forward: true });
}

let refitTimer: NodeJS.Timeout | undefined;
function refitToPrimaryDisplay() {
  clearTimeout(refitTimer);
  // Display events arrive in bursts (resolution change, scaling change, dock/undock).
  refitTimer = setTimeout(() => {
    if (!petWindow) return;
    const { bounds } = screen.getPrimaryDisplay();
    petWindow.setBounds(bounds);
    cursorMonitor.setBounds(bounds);
    petWindow.webContents.send(IPC.displayChanged, displayInfo());
  }, 150);
}

function createPetWindow() {
  const { bounds } = screen.getPrimaryDisplay();
  petWindow = new BrowserWindow({
    ...bounds,
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
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep animating while other windows are focused.
      backgroundThrottling: false,
    },
  });

  platform.configureWindow(petWindow);
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  interactive = false;
  lockDown(petWindow.webContents);

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive();
    cursorMonitor.start();
  });
  petWindow.on('closed', () => {
    petWindow = null;
    cursorMonitor.stop();
  });

  loadRenderer(petWindow, 'pet');
}

function setPetVisible(visible: boolean) {
  petVisible = visible;
  if (!petWindow) return;
  if (visible) {
    petWindow.showInactive();
    cursorMonitor.start();
    syncKeyboard({ prompt: false });
  } else {
    petWindow.hide();
    cursorMonitor.stop();
    // Nothing to react with while hidden, so don't listen either.
    keyboardMonitor.stop();
  }
  rebuildTrayMenu();
}

// ---- Settings window -----------------------------------------------------------------

function openSettingsWindow() {
  if (settingsWindow) {
    platform.presentWindow(app, settingsWindow);
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 780,
    title: 'Racoon Settings',
    icon: path.join(ASSETS, 'tray.png'),
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  lockDown(settingsWindow.webContents);
  settingsWindow.once('ready-to-show', () => settingsWindow && platform.presentWindow(app, settingsWindow));
  // Coming back from System Settings is the natural moment to notice a newly granted permission.
  settingsWindow.on('focus', () => {
    if (store.settings.keyboardReactions && keyboardStatus.access === 'denied') syncKeyboard({ prompt: false });
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  loadRenderer(settingsWindow, 'settings');
}

// ---- Settings and keyboard opt-in ------------------------------------------------------

function setKeyboardStatus(status: KeyboardStatus) {
  keyboardStatus = status;
  broadcast(IPC.keyboardStatusChanged, status);
}

/**
 * Starts or stops key-press counting to match the user's opt-in. On macOS the OS
 * permission prompt is shown at most once, and only right after the user switches
 * the feature on; after that we only check silently and explain what to do.
 */
function syncKeyboard({ prompt }: { prompt: boolean }) {
  const enabled = store.settings.keyboardReactions;
  if (!enabled || !petVisible) {
    keyboardMonitor.stop();
    setKeyboardStatus({ enabled, listening: false, access: platform.keyboardAccess.check(), message: null });
    return;
  }

  let access = platform.keyboardAccess.check();
  if (access === 'denied' && prompt && !store.keyboardPromptShown) {
    store.markKeyboardPromptShown();
    access = platform.keyboardAccess.request();
  }
  if (access !== 'granted') {
    keyboardMonitor.stop();
    setKeyboardStatus({ enabled, listening: false, access, message: platform.keyboardAccess.deniedMessage });
    return;
  }

  const error = keyboardMonitor.start();
  setKeyboardStatus({
    enabled,
    listening: error === null,
    access,
    message: error ? `Couldn't start counting key presses (${error}). Everything else keeps working.` : null,
  });
}

function applyLoginItem(settings: Settings) {
  // In development this would register the bare Electron binary, so only packaged builds do it.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
}

function onSettingsChanged(previous: Settings, next: Settings) {
  broadcast(IPC.settingsChanged, next);
  if (previous.keyboardReactions !== next.keyboardReactions) syncKeyboard({ prompt: next.keyboardReactions });
  if (previous.launchAtLogin !== next.launchAtLogin) applyLoginItem(next);
}

// ---- Tray ------------------------------------------------------------------------------

function rebuildTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Racoon', enabled: false },
      { type: 'separator' },
      { label: 'Show raccoon', type: 'checkbox', checked: petVisible, click: (item) => setPetVisible(item.checked) },
      { label: 'Settings…', click: openSettingsWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Racoon');
  tray.on('click', () => {
    if (platform.trayClickOpensSettings) openSettingsWindow();
  });
  rebuildTrayMenu();
}

// ---- IPC -------------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle(IPC.getDisplay, () => displayInfo());
  ipcMain.on(IPC.setInteractive, (event, next: unknown) => {
    if (event.sender === petWindow?.webContents) setInteractive(next === true);
  });
  ipcMain.handle(IPC.getSettings, () => store.settings);
  ipcMain.handle(IPC.updateSettings, (_event, patch: unknown) => {
    const previous = store.settings;
    const next = store.update(patch);
    onSettingsChanged(previous, next);
    return next;
  });
  ipcMain.handle(IPC.getKeyboardStatus, () => keyboardStatus);
  ipcMain.handle(IPC.recheckKeyboardAccess, () => {
    syncKeyboard({ prompt: false });
    return keyboardStatus;
  });
  ipcMain.on(IPC.openKeyboardPrivacySettings, () => platform.keyboardAccess.openSettings());
}

// ---- Startup ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  platform.configureApp(app);
  app.on('second-instance', openSettingsWindow);

  void app.whenReady().then(() => {
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    cursorMonitor = new CursorMonitor(
      (cursor) => petWindow?.webContents.send(IPC.cursor, cursor),
      screen.getPrimaryDisplay().bounds,
    );
    registerIpc();
    createPetWindow();
    createTray();
    // Silent check at startup: never prompt for permissions the user didn't just ask for.
    syncKeyboard({ prompt: false });

    screen.on('display-metrics-changed', refitToPrimaryDisplay);
    screen.on('display-added', refitToPrimaryDisplay);
    screen.on('display-removed', refitToPrimaryDisplay);
  });

  // Closing the settings window must not quit the app; the tray's Quit does that.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    keyboardMonitor.stop();
    cursorMonitor?.stop();
    store?.flush();
  });
}
