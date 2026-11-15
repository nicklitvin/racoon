import { app, BrowserWindow, dialog, ipcMain, Menu, screen, Tray, type WebContents } from 'electron';
import path from 'node:path';
import { NO_ALARMIE, type AlarmieStatus } from '../shared/alarmie';
import { IPC, type DisplayInfo, type Rect } from '../shared/ipc';
import type { KeyboardStatus, Settings } from '../shared/settings';
import { findAlarmie, sendToAlarmie } from './alarmie';
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
/** How long the pet keeps out of sight after the desktop switches: the slide takes about half a second. */
const AWAY_AFTER_SWITCH_MS = 650;
/** The Alarmie chat's size, and how far from the pet it opens. */
const CHAT_SIZE = { width: 340, height: 460 };
const CHAT_GAP = 24;
/**
 * Alarmie is a Mac app, so the chat is only offered there. MY_PET_ALARMIE=1 lets a development
 * build offer it anywhere, to work on it (it still needs the endpoint to answer).
 */
const ALARMIE_ANY_OS = !app.isPackaged && process.env.MY_PET_ALARMIE === '1';

let petWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let alarmie: AlarmieStatus = NO_ALARMIE;
let tray: Tray | null = null;
let interactive = false;
/** Set once the app is really quitting (Quit picked, an update installing, Windows shutting down). */
let quitting = false;

let store: SettingsStore;
let cursorMonitor: CursorMonitor;
let keyboardStatus: KeyboardStatus = { enabled: false, listening: false, access: 'granted', message: null };

const updater = new Updater((status) => broadcast(IPC.updateStatusChanged, status));

const keyboardMonitor = new KeyboardMonitor(() => {
  // An empty pulse: no key information exists past this point.
  petWindow?.webContents.send(IPC.keyPulse);
});

// ---- Helpers --------------------------------------------------------------------------

function loadRenderer(win: BrowserWindow, view: 'pet' | 'settings' | 'chat') {
  const hash = view === 'pet' ? '' : view;
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
  if (next) {
    // In front of anything that's come up over it since, so the click is his and not theirs.
    platform.raiseWindow(petWindow);
    petWindow.setIgnoreMouseEvents(false);
  } else {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

let awayTimer: NodeJS.Timeout | undefined;
let away = false;
/**
 * The desktop is switching: the pet's window is on every desktop, so as the old one slid away
 * he went with it. He keeps out of sight until the new one has slid in, then comes back.
 */
function desktopSwitched() {
  clearTimeout(awayTimer);
  if (!away) {
    away = true;
    petWindow?.webContents.send(IPC.desktopSwitching, true);
  }
  awayTimer = setTimeout(() => {
    away = false;
    if (!petWindow) return;
    platform.raiseWindow(petWindow);
    petWindow.webContents.send(IPC.desktopSwitching, false);
  }, AWAY_AFTER_SWITCH_MS);
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
  const stopWatchingDesktops = platform.watchDesktopSwitches?.(desktopSwitched) ?? null;
  // In front of every other window, including ones that make themselves always on top too.
  const stopKeepingInFront = platform.keepInFront(petWindow);
  petWindow.on('closed', () => {
    petWindow = null;
    cursorMonitor.stop();
    stopWatchingDesktops?.();
    stopKeepingInFront();
    clearTimeout(awayTimer);
  });

  loadRenderer(petWindow, 'pet');
}

// ---- Main window ------------------------------------------------------------------------

/** Whether this launch is the one at login, which starts minimised instead of in your face. */
function launchedAtLogin() {
  return process.argv.includes(AT_LOGIN) || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
}

/**
 * The app's window: the settings, in the taskbar or Dock like any other app. The pet is out
 * for as long as the app runs. Closing it asks first: quit (the pet goes too), or only hide
 * the window and leave the pet out.
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
    // Alarmie installed or started since: the settings offer the chat.
    void refreshAlarmie();
  });
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    void askBeforeClosing();
  });
  // Windows signing out or shutting down: no questions, or it would hold that up.
  mainWindow.on('query-session-end', () => {
    quitting = true;
  });
  mainWindow.on('session-end', () => {
    quitting = true;
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
  loadRenderer(mainWindow, 'settings');
}

let asking = false;
/** Quit, or only hide the window and leave the pet out? */
async function askBeforeClosing() {
  if (!mainWindow || asking) return;
  asking = true;
  // Closed from its taskbar button while minimised: a dialog on it would be minimised too.
  const shown = mainWindow.isVisible() && !mainWindow.isMinimized();
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: 'My Pet',
    message: 'Quit My Pet?',
    detail:
      'Quitting puts your pet away until you open My Pet again.' +
      ` Hide the window instead to keep your pet out. You can open it again from ${process.platform === 'darwin' ? 'the Dock' : 'the My Pet icon by the clock, or the Start menu'}.`,
    buttons: ['Hide window', 'Quit', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
  const { response } = await (shown ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options));
  asking = false;
  if (response === 0) mainWindow?.hide();
  else if (response === 1) app.quit();
}

/** By the clock: the way back to the window once it's hidden, and another way to quit. */
function createTray() {
  // The Dock does this on macOS.
  if (process.platform === 'darwin') return;
  tray = new Tray(path.join(ASSETS, 'tray.png'));
  tray.setToolTip('My Pet');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open My Pet', click: showMainWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  platform.presentWindow(app, mainWindow);
}

// ---- Alarmie chat ------------------------------------------------------------------------

/** Looks for Alarmie again, and tells the windows if that's changed. */
async function refreshAlarmie(): Promise<AlarmieStatus> {
  const next = await findAlarmie(store.settings.alarmieEndpoint, ALARMIE_ANY_OS);
  if (next.installed !== alarmie.installed || next.reachable !== alarmie.reachable || next.available !== alarmie.available) {
    alarmie = next;
    broadcast(IPC.alarmieChanged, next);
  }
  return alarmie;
}

/** The pet was clicked with the chat switched on: opens it beside him (or brings it back). */
async function openChat(beside: Rect) {
  if (!store.settings.alarmieChat) return;
  if (chatWindow) {
    platform.presentWindow(app, chatWindow);
    return;
  }
  const status = alarmie.available ? alarmie : await refreshAlarmie();
  if (!status.available || !petWindow || chatWindow) return;
  chatWindow = new BrowserWindow({
    ...chatBounds(beside),
    title: 'Talk to Alarmie',
    ...(!app.isPackaged && { icon: path.join(ASSETS, 'tray.png') }),
    minWidth: 280,
    minHeight: 300,
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
  chatWindow.setMenu(null);
  // Stays up with the pet while you switch to another app to check something.
  chatWindow.setAlwaysOnTop(true, 'floating');
  lockDown(chatWindow.webContents);
  chatWindow.once('ready-to-show', () => chatWindow && platform.presentWindow(app, chatWindow));
  chatWindow.on('closed', () => {
    chatWindow = null;
  });
  loadRenderer(chatWindow, 'chat');
}

/**
 * Beside him on screen, clear of him: to his right, or his left if there's no room there, level
 * with him as far as the screen allows.
 */
function chatBounds(pet: Rect) {
  const origin = petWindow?.getBounds() ?? { x: 0, y: 0 };
  const left = origin.x + pet.x;
  const right = left + pet.width;
  const middle = { x: Math.round(left + pet.width / 2), y: Math.round(origin.y + pet.y + pet.height / 2) };
  const area = screen.getDisplayNearestPoint(middle).workArea;
  const { width, height } = CHAT_SIZE;
  const x = right + CHAT_GAP + width <= area.x + area.width ? right + CHAT_GAP : left - CHAT_GAP - width;
  const y = middle.y - height / 2;
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - height)),
  };
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
  if (previous.alarmieEndpoint !== next.alarmieEndpoint) void refreshAlarmie();
  if (!next.alarmieChat) chatWindow?.close();
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
  ipcMain.handle(IPC.getAlarmie, () => refreshAlarmie());
  ipcMain.on(IPC.openChat, (event, beside: unknown) => {
    if (event.sender !== petWindow?.webContents) return;
    const r = beside && typeof beside === 'object' ? (beside as Record<string, unknown>) : {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    void openChat({ x: num(r.x), y: num(r.y), width: Math.max(0, num(r.width)), height: Math.max(0, num(r.height)) });
  });
  ipcMain.handle(IPC.sendChat, (event, message: unknown, conversationId: unknown) => {
    if (event.sender !== chatWindow?.webContents) return { ok: false, error: 'Not from the chat.' };
    return sendToAlarmie(
      store.settings.alarmieEndpoint,
      typeof message === 'string' ? message : '',
      typeof conversationId === 'string' && conversationId ? conversationId : null,
    );
  });
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
    createTray();
    // Silent check at startup: never prompt for permissions the user didn't just ask for.
    syncKeyboard({ prompt: false });
    updater.start();
    void refreshAlarmie();

    screen.on('display-metrics-changed', refitToPrimaryDisplay);
    screen.on('display-added', refitToPrimaryDisplay);
    screen.on('display-removed', refitToPrimaryDisplay);
  });

  // Closing the main window for good quits (see createMainWindow), on macOS too.
  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    keyboardMonitor.stop();
    updater.stop();
    cursorMonitor?.stop();
    store?.flush();
  });
}
