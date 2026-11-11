// Electron entry — the PC host for the exact same web/ bundle used on mobile.
// Desktop-only extras: tray, global push-to-talk hotkey, always-on-top companion overlay.
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, globalShortcut, clipboard, Notification } from 'electron';
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
ipcMain.handle('no7:copy', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });
ipcMain.handle('no7:open-app', async (_e, target) => {
  // allowlist-ish guard: never let the model run shell commands, only open existing paths.
  const { execFile } = await import('node:child_process');
  const map = { calculator: 'calc', notepad: 'notepad', explorer: 'explorer', terminal: 'wt', settings: 'ms-settings:' };
  const key = String(target || '').toLowerCase().trim();
  if (map[key]) {
    execFile('cmd', ['/c', 'start', '', map[key]], { windowsHide: true }, () => {});
    return true;
  }
  const err = await shell.openPath(String(target || ''));
  if (err) throw new Error(err);
  return true;
});
/** allowlist ของคำสั่งที่รันได้ — ตั้งผ่าน env เท่านั้น (ไม่ใช่จากหน้าเว็บ) */
const CONTROL_ALLOW = (() => {
  const raw = process.env.NO7_CONTROL_ALLOW_COMMANDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
})();

ipcMain.handle('no7:control-info', () => ({ allowCommands: CONTROL_ALLOW, platform: process.platform }));

ipcMain.handle('no7:run-command', async (_e, req = {}) => {
  const { execFile } = await import('node:child_process');
  const command = String(req.command || '').trim();
  if (!command) throw new Error('ต้องระบุคำสั่ง');
  // แยก argv แบบง่าย (ไม่ผ่าน shell) — ตัวดำเนินการเชลล์ถูกปฏิเสธ
  if (/[;&|><`$]/.test(command)) throw new Error('ไม่อนุญาตตัวดำเนินการเชลล์');
  const parts = command.split(/\s+/);
  const binary = parts[0];
  if (!CONTROL_ALLOW.some((a) => a === binary || (a.endsWith('*') && binary.startsWith(a.slice(0, -1))))) {
    throw new Error(`"${binary}" ไม่อยู่ใน NO7_CONTROL_ALLOW_COMMANDS`);
  }
  return new Promise((resolve, reject) => {
    execFile(binary, parts.slice(1), {
      timeout: Math.min(Number(req.timeoutMs) || 10000, 30000),
      windowsHide: true,
      maxBuffer: 512 * 1024,
      shell: false,
    }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) { reject(new Error(err.message)); return; }
      resolve({ code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
});

/* ------------------------------------------------- desktop awareness */
/** รันคำสั่งสั้น ๆ แบบไม่ผ่าน shell (ใช้เฉพาะคำสั่งคงที่ของ OS) */
async function runFile(cmd, args, timeout = 4000) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') || err?.message || '' });
    });
  });
}

ipcMain.handle('no7:list-windows', async () => {
  const platform = process.platform;
  if (platform === 'win32') {
    const res = await runFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty MainWindowTitle']);
    return { platform, stdout: res.stdout, error: res.ok ? '' : res.stderr };
  }
  if (platform === 'darwin') {
    const res = await runFile('osascript', ['-e', 'tell application "System Events" to get name of every process whose visible is true']);
    return { platform, stdout: res.stdout, error: res.ok ? '' : res.stderr };
  }
  const res = await runFile('wmctrl', ['-l']);
  return { platform, stdout: res.stdout, error: res.ok ? '' : res.stderr };
});

ipcMain.handle('no7:focus-window', async (_e, target) => {
  const title = String(target || '').trim();
  if (!title) throw new Error('ต้องระบุชื่อหน้าต่าง');
  const platform = process.platform;
  let res;
  if (platform === 'win32') {
    const escaped = title.replace(/'/g, "''");
    res = await runFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(New-Object -ComObject WScript.Shell).AppActivate('${escaped}')`]);
  } else if (platform === 'darwin') {
    const escaped = title.replace(/["\\]/g, '\\$&');
    res = await runFile('osascript', ['-e', `tell application "${escaped}" to activate`]);
  } else {
    res = await runFile('wmctrl', ['-a', title]);
    if (!res.ok) res = await runFile('xdotool', ['search', '--name', title, 'windowactivate']);
  }
  if (!res.ok) throw new Error(res.stderr || `โฟกัส "${title}" ไม่สำเร็จ (ต้องมี wmctrl บน Linux)`);
  return true;
});

ipcMain.handle('no7:notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
  return true;
});
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
