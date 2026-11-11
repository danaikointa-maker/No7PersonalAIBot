// Auto-update (opt-in) — เฉพาะแอปที่ติดตั้งแล้ว (packaged) และเมื่อผู้ใช้/ผู้ดูแลเปิดเอง
//
// หลักการ: ไม่แอบอัปเดตเงียบ ๆ
//   NO7_AUTO_UPDATE=1          → เปิดระบบอัปเดต
//   NO7_UPDATE_FEED=<url>      → ที่อยู่ feed (generic provider) ถ้าไม่ตั้งจะใช้ค่าจาก electron-builder
//   NO7_UPDATE_CHANNEL=latest  → ช่องทาง (latest/beta)
//   NO7_UPDATE_AUTO_DOWNLOAD=0 → แค่บอกว่ามีเวอร์ชันใหม่ ไม่ดาวน์โหลด
//   NO7_UPDATE_CHECK_MS=15000  → หน่วงก่อนเช็คครั้งแรก
//
// ตัวตรวจจริง (electron-updater) ถูก inject เข้ามา → ไฟล์นี้เทสต์ได้โดยไม่ต้องมี Electron

export const DEFAULT_CHECK_DELAY_MS = 15000;
export const MIN_CHECK_DELAY_MS = 3000;
export const MAX_CHECK_DELAY_MS = 10 * 60_000;

/** อ่าน env → config ที่ใช้จริง (ค่าเริ่มต้น = ปิด) */
export function updaterConfig(env = {}, { isPackaged = false } = {}) {
  const raw = Number(env.NO7_UPDATE_CHECK_MS);
  const delay = Number.isFinite(raw) ? Math.min(MAX_CHECK_DELAY_MS, Math.max(MIN_CHECK_DELAY_MS, raw)) : DEFAULT_CHECK_DELAY_MS;
  return {
    enabled: env.NO7_AUTO_UPDATE === '1' && isPackaged === true,
    feedUrl: String(env.NO7_UPDATE_FEED || '').trim(),
    channel: String(env.NO7_UPDATE_CHANNEL || 'latest').trim() || 'latest',
    autoDownload: env.NO7_UPDATE_AUTO_DOWNLOAD !== '0',
    checkDelayMs: delay,
  };
}

/** แปลง event ของ electron-updater → ข้อความสำหรับผู้ใช้ */
export function describeUpdateEvent(event = '', info = {}) {
  const version = String(info?.version || '');
  switch (event) {
    case 'checking-for-update':
      return { title: 'กำลังตรวจอัปเดต', body: 'Checking for updates…' };
    case 'update-available':
      return { title: 'มีเวอร์ชันใหม่', body: `พบเวอร์ชัน ${version || 'ใหม่'} — กำลังดาวน์โหลด`, version };
    case 'update-not-available':
      return { title: 'เป็นเวอร์ชันล่าสุดแล้ว', body: `คุณใช้ ${String(info?.currentVersion || '') || 'เวอร์ชันล่าสุด'}`, version };
    case 'download-progress': {
      const percent = Math.round(Number(info?.percent) || 0);
      return { title: 'กำลังดาวน์โหลดอัปเดต', body: `${percent}%`, percent };
    }
    case 'update-downloaded':
      return { title: 'ดาวน์โหลดอัปเดตแล้ว', body: `เวอร์ชัน ${version || 'ใหม่'} พร้อมติดตั้ง — จะติดตั้งเมื่อปิดแอป`, version };
    case 'error':
      return { title: 'ตรวจอัปเดตไม่สำเร็จ', body: String(info?.message || info || 'ไม่ทราบสาเหตุ').slice(0, 200) };
    default:
      return { title: event || 'update', body: '' };
  }
}

/**
 * ต่อ event ของ electron-updater เข้ากับ UI (tray/notification)
 * @param {{autoUpdater: object, config?: object, notify?: Function, tray?: object, log?: Function, setTimeoutImpl?: Function}} deps
 */
export function setupAutoUpdater({
  autoUpdater, config, notify = null, tray = null, log = () => {},
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  const cfg = config || updaterConfig({}, {});
  if (!autoUpdater) return { enabled: false, reason: 'ไม่มี electron-updater' };
  if (!cfg.enabled) return { enabled: false, reason: 'ปิดอยู่ (ต้องเป็นแอปที่ติดตั้งแล้วและตั้ง NO7_AUTO_UPDATE=1)' };

  const emit = (event, info) => {
    const msg = describeUpdateEvent(event, info);
    log(`[update] ${event} ${msg.body}`.trim());
    try { notify?.(msg); } catch { /* notification ต้องไม่ทำให้แอปพัง */ }
    if (event === 'update-downloaded') {
      try {
        tray?.setToolTip?.(`No7 — อัปเดตพร้อมติดตั้ง (${msg.version || 'ใหม่'})`);
        tray?.setContextMenu?.(tray?.contextMenuWith?.(msg) || tray?.contextMenu);
      } catch { /* tray อาจยังไม่พร้อม */ }
    }
  };

  autoUpdater.autoDownload = cfg.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;
  if (cfg.channel) autoUpdater.channel = cfg.channel;
  if (cfg.feedUrl) autoUpdater.setFeedURL({ provider: 'generic', url: cfg.feedUrl });

  for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']) {
    autoUpdater.on(event, (info) => emit(event, info));
  }

  const check = () => Promise.resolve(autoUpdater.checkForUpdates?.()).catch((err) => emit('error', err));
  setTimeoutImpl(() => { check(); }, cfg.checkDelayMs);
  return {
    enabled: true,
    check,
    install: () => autoUpdater.quitAndInstall?.(),
    checkDelayMs: cfg.checkDelayMs,
  };
}
