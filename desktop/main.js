// Electron entry — the PC host for the exact same web/ bundle used on mobile.
// Desktop-only extras: tray, global push-to-talk hotkey, always-on-top companion overlay.
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEV = process.argv.includes('--dev');
const DEV_URL = process.env.NO7_DEV_URL || 'http://localhost:5173';

let mainWindow = null;
let overlayWindow = null;
let tray = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#0b0f1a',
    title: 'No7 Personal AI Bot',
    icon: path.join(ROOT, 'web/public/icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(ROOT, 'dist/index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Transparent, always-on-top desktop companion (the "uncle on your desktop" idea). */
function createOverlay() {
  if (overlayWindow) { overlayWindow.show(); return; }
  overlayWindow = new BrowserWindow({
    width: 260,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  const file = path.join(ROOT, 'web/overlay.html');
  if (DEV) overlayWindow.loadURL(`${DEV_URL}/overlay.html`);
  else overlayWindow.loadFile(path.join(ROOT, 'dist/overlay.html'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'web/public/icon.svg'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('No7 Personal AI Bot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'เปิดหน้าต่างหลัก', click: () => (mainWindow ? mainWindow.show() : createMainWindow()) },
    { label: 'เพื่อนบนจอ', click: () => createOverlay() },
    { type: 'separator' },
    { label: 'ออกจากโปรแกรม', click: () => app.quit() },
  ]));
  tray.on('click', () => (mainWindow ? mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() : createMainWindow()));
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Push-to-talk anywhere on the desktop (mirrors ESP32 BOOT-button tap).
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    mainWindow?.webContents.send('no7:push-to-talk');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());

/* ------------------------------------------------------------------ IPC */
ipcMain.handle('no7:platform', () => 'desktop');
ipcMain.handle('no7:open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('no7:toggle-overlay', () => {
  if (overlayWindow) { overlayWindow.close(); return false; }
  createOverlay();
  return true;
});
ipcMain.on('no7:subtitle', (_e, text) => {
  overlayWindow?.webContents.send('no7:subtitle', text);
});
ipcMain.on('no7:emotion', (_e, emotion) => {
  overlayWindow?.webContents.send('no7:emotion', emotion);
});
