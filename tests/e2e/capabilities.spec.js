import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('no7.settings.v1', JSON.stringify({
      provider: 'pollinations', model: 'openai', costMode: 'free', streaming: false, tts: false,
    }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.host === '127.0.0.1:5173') await route.continue();
    else await route.abort();
  });
});

test('capability report matches the browser APIs available without requesting permissions', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.locator('#nav button[data-view="settings"]').click();
  const rows = page.locator('#caps-list .cap');
  await expect(rows).toHaveCount(15);

  const actual = await page.evaluate(() => ({
    microphone: !!navigator.mediaDevices?.getUserMedia,
    speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    speechSynthesis: !!window.speechSynthesis,
    notifications: !!window.Notification,
    clipboard: !!navigator.clipboard?.writeText,
    share: !!navigator.share,
    secureContext: !!window.isSecureContext,
    crypto: !!window.crypto?.subtle,
  }));
  const checks = [
    ['ไมโครโฟน', actual.microphone],
    ['แปลงเสียงเป็นข้อความ', actual.speechRecognition],
    ['อ่านออกเสียง', actual.speechSynthesis],
    ['แจ้งเตือน', actual.notifications],
    ['คลิปบอร์ด', actual.clipboard],
    ['แชร์ออกแอปอื่น', actual.share],
    ['บริบทปลอดภัย', actual.secureContext],
    ['HMAC / เข้ารหัส', actual.crypto],
  ];
  for (const [label, supported] of checks) {
    const row = rows.filter({ hasText: label });
    await expect(row).toHaveClass(supported ? /\bok\b/ : /\bno\b/);
  }
  expect(pageErrors).toEqual([]);
});

test('capability report explains missing microphone and speech APIs', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis']) {
      Object.defineProperty(window, name, { configurable: true, value: undefined });
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await page.locator('#nav button[data-view="settings"]').click();
  const rows = page.locator('#caps-list .cap');
  await expect(rows).toHaveCount(15);
  await expect(rows.filter({ hasText: 'ไมโครโฟน' })).toHaveClass(/\bno\b/);
  await expect(rows.filter({ hasText: 'แปลงเสียงเป็นข้อความ' })).toHaveClass(/\bno\b/);
  await expect(rows.filter({ hasText: 'อ่านออกเสียง' })).toHaveClass(/\bno\b/);
  await expect(rows.filter({ hasText: 'เบราว์เซอร์นี้ไม่รองรับ' })).toHaveCount(1);
});
