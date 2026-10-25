import { app, BrowserWindow, ipcMain, screen, type WebContents } from 'electron';
import path from 'node:path';
import { IPC, type DisplayInfo } from '../shared/ipc';
import type { KeyboardStatus, Settings } from '../shared/settings';
import { CursorMonitor } from './cursorMonitor';
import { KeyboardMonitor } from './keyboardMonitor';
import { platform } from './platform';
import { SettingsStore } from './settingsStore';
import { Updater } from './updater';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PRELOAD = path.join(__dirname, 'preload.js');
const ASSETS = path.join(__dirname, '../assets');
/** Passed when Windows starts the app at login, so it starts minimised. */
const AT_LOGIN = '--at-login';

let petWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let interactive = false;

let store: SettingsStore;
let cursorMonitor: CursorMonitor;
let keyboardStatus: KeyboardStatus = { enabled: false, listening: false, access: 'granted', message: null };

const updater = new Updater((status) => broadcast(IPC.updateStatusChanged, status));

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

// ---- Main window ------------------------------------------------------------------------

/** Whether this launch is the one at login, which starts minimised instead of in your face. */
function launchedAtLogin() {
  return process.argv.includes(AT_LOGIN) || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
}

/**
 * The app's window: the settings, in the taskbar or Dock like any other app. The pet is
 * out for as long as it's open, and closing it quits.
 */
function createMainWindow({ minimised }: { minimised: boolean }) {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 780,
    title: 'My Pet',
    // Packaged builds take the app's own icon; this one is only for development.
    ...(!app.isPackaged && { icon: path.join(ASSETS, 'tray.png') }),
    resizable: false,
    maximizable: false,
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
  mainWindow.setMenu(null);
  lockDown(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    if (minimised) {
      mainWindow.showInactive();
      mainWindow.minimize();
    } else {
      platform.presentWindow(app, mainWindow);
    }
  });
  // Coming back from System Settings is the natural moment to notice a newly granted permission.
  mainWindow.on('focus', () => {
    if (store.settings.keyboardReactions && keyboardStatus.access === 'denied') syncKeyboard({ prompt: false });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
  loadRenderer(mainWindow, 'settings');
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  platform.presentWindow(app, mainWindow);
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
  if (!enabled) {
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
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: [AT_LOGIN] });
}

function onSettingsChanged(previous: Settings, next: Settings) {
  broadcast(IPC.settingsChanged, next);
  if (previous.keyboardReactions !== next.keyboardReactions) syncKeyboard({ prompt: next.keyboardReactions });
  if (previous.launchAtLogin !== next.launchAtLogin) applyLoginItem(next);
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
  ipcMain.handle(IPC.getUpdateStatus, () => updater.current);
  ipcMain.handle(IPC.checkForUpdate, () => updater.check());
  ipcMain.handle(IPC.installUpdate, () => updater.install());
  ipcMain.on(IPC.openReleasesPage, () => updater.openReleasesPage());
}

// ---- Startup ---------------------------------------------------------------------------

// The app used to be called Racoon: keep its settings (and single-instance lock) where they were.
app.setPath('userData', path.join(app.getPath('appData'), 'Racoon'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  platform.configureApp(app);
  // Opening it again (from the Start menu, say) brings back the window that's already open.
  app.on('second-instance', showMainWindow);
  app.on('activate', showMainWindow);

  void app.whenReady().then(() => {
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    cursorMonitor = new CursorMonitor(
      (cursor) => petWindow?.webContents.send(IPC.cursor, cursor),
      screen.getPrimaryDisplay().bounds,
    );
    registerIpc();
    createPetWindow();
    // Fix up an existing "Start at login" entry, from before it started minimised.
    applyLoginItem(store.settings);
    createMainWindow({ minimised: launchedAtLogin() });
    // Silent check at startup: never prompt for permissions the user didn't just ask for.
    syncKeyboard({ prompt: false });
    updater.start();

    screen.on('display-metrics-changed', refitToPrimaryDisplay);
    screen.on('display-added', refitToPrimaryDisplay);
    screen.on('display-removed', refitToPrimaryDisplay);
  });

  // Closing the main window quits (see createMainWindow), on macOS too.
  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    keyboardMonitor.stop();
    updater.stop();
    cursorMonitor?.stop();
    store?.flush();
  });
}
