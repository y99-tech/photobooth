// Photobooth for Windows 11 — a desktop app around the same server the Raspberry Pi runs.
// Starts the booth server in-process, opens the booth full-screen (touch friendly), grants the
// camera automatically, keeps the screen awake and lives in the system tray.
const { app, BrowserWindow, Tray, Menu, dialog, shell, session, powerSaveBlocker, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// Packaged: the booth lives in resources/app/booth. From source: the repository root.
const APP_ROOT = app.isPackaged ? path.join(__dirname, 'booth') : path.join(__dirname, '..');
// Photos and settings go to Documents\Photobooth so they are easy to find and back up.
const DATA = path.join(app.getPath('documents'), 'Photobooth');
const ICON = path.join(__dirname, 'assets', 'icon.png');
const COFFEE = 'https://www.paypal.com/donate/?business=mohamed2000youssry%40gmail.com&item_name=Buy+me+a+coffee+-+Photobooth&currency_code=USD';

let win = null;
let tray = null;
let booth = null; // { port, url, baseUrl }

// Countdown voice, shutter sound and music must play without a click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(start);
}

async function start() {
  fs.mkdirSync(DATA, { recursive: true });
  process.env.PHOTOBOOTH_DATA = DATA;
  process.env.PHOTOBOOTH_CONFIG = path.join(DATA, 'config.json');
  process.chdir(APP_ROOT);

  try {
    booth = await require(path.join(APP_ROOT, 'server', 'index.js')).ready;
  } catch (e) {
    dialog.showErrorBox('Photobooth could not start', e.message);
    app.quit();
    return;
  }

  // Camera/microphone prompts would block a kiosk — allow them for the local booth only.
  const local = (url) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url || '');
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) =>
    cb(local(details.requestingUrl || wc.getURL()) && ['media', 'fullscreen', 'wake-lock', 'clipboard-sanitized-write'].includes(perm))
  );
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => local((origin || '') + '/') && ['media', 'fullscreen'].includes(perm));

  powerSaveBlocker.start('prevent-display-sleep');
  createWindow();
  createTray();

  // Staff shortcuts (guests never see a menu).
  globalShortcut.register('CommandOrControl+Shift+A', openAdmin);
  globalShortcut.register('CommandOrControl+Shift+F', toggleFullscreen);
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    backgroundColor: '#0f0d0b',
    autoHideMenuBar: true,
    icon: ICON,
    title: 'Photobooth',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  win.setMenu(null);
  win.loadURL(booth.url);
  // Links that leave the booth (help pages, guest links) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/\/admin|\/gallery|\/remote/.test(url) && url.startsWith(booth.url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // If the page ever crashes during an event, bring it straight back.
  win.webContents.on('render-process-gone', () => setTimeout(() => win && win.reload(), 1000));
  win.on('closed', () => (win = null));
}

function openAdmin() {
  const w = new BrowserWindow({ width: 1000, height: 800, icon: ICON, autoHideMenuBar: true, title: 'Photobooth admin' });
  w.setMenu(null);
  w.loadURL(booth.url + 'admin');
}

function toggleFullscreen() {
  if (win) win.setFullScreen(!win.isFullScreen());
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(`Photobooth — ${booth.baseUrl}`);
  const refresh = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Phones: ${booth.baseUrl}`, enabled: false },
        { type: 'separator' },
        { label: 'Show booth', click: () => (win ? win.show() : createWindow()) },
        { label: 'Full screen on/off   Ctrl+Shift+F', click: toggleFullscreen },
        { label: 'Admin & settings   Ctrl+Shift+A', click: openAdmin },
        { label: 'Gallery slideshow (2nd screen)', click: () => shell.openExternal(booth.url + 'gallery?slideshow=1') },
        { label: 'Open photos folder', click: () => shell.openPath(path.join(DATA, 'photos')) },
        { type: 'separator' },
        { label: '☕ Buy me a coffee (PayPal)', click: () => shell.openExternal(COFFEE) },
        { type: 'separator' },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); refresh(); }
        },
        { label: 'Quit   Ctrl+Shift+Q', click: () => app.quit() }
      ])
    );
  refresh();
  tray.on('double-click', () => win && win.show());
}

app.on('window-all-closed', () => {
  // Keep running in the tray so phones / uploads keep working; quit from the tray menu.
});
app.on('will-quit', () => globalShortcut.unregisterAll());
