// Runtime platform detection — same bundle, four hosts: browser, PWA, Electron, Capacitor.
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (globalThis.no7?.platform) return globalThis.no7.platform;            // injected by desktop preload
          if (globalThis.Capacitor?.isNativePlatform?.()) return 'mobile';   // Capacitor native
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return 'mobile-web';
  if (/Electron/i.test(ua)) return 'desktop';
  return 'web';
}

export function platformLabel(p) {
  return {
    web: '🖥️ เบราว์เซอร์ (PC)',
    desktop: '🖥️ Desktop app (Electron)',
    mobile: '📱 Mobile app (Capacitor)',
    'mobile-web': '📱 เบราว์เซอร์ (มือถือ)',
  }[p] || p;
}

export function isDesktopHost() {
  const p = detectPlatform();
  return p === 'desktop' || p === 'web';
}
