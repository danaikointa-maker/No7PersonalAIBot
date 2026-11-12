import { expect, test } from '@playwright/test';
import { createBackup } from '../../web/src/core/backup.js';

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !testInfo.error) return;
  const message = testInfo.error.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write(`::error title=Playwright failure: ${testInfo.title}::${message}\n`);
});

async function configureTestPage(page, onChatRequest, settingsOverrides = {}) {
  await page.addInitScript((overrides) => {
    localStorage.setItem('no7.settings.v1', JSON.stringify({
      provider: 'pollinations',
      model: 'openai',
      costMode: 'free',
      streaming: false,
      tts: false,
      ...overrides,
    }));
  }, settingsOverrides);

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'text.pollinations.ai' && url.pathname === '/openai') {
      const responseText = onChatRequest(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: responseText } }] }),
      });
      return;
    }
    if (url.origin === 'http://127.0.0.1:5173') {
      await route.continue();
      return;
    }
    await route.abort();
  });
}

test('real Chromium boots No7 and completes a user-initiated chat turn', async ({ page }) => {
  const pageErrors = [];
  let chatPayload;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureTestPage(page, (payload) => {
    chatPayload = payload;
    return 'สวัสดีจากการทดสอบ Chromium จริง';
  });

  await page.goto('/');
  await expect(page.locator('#state-label')).toHaveText(/IDLE|SETUP/);
  await expect(page.locator('#mode-chips button')).toHaveCount(5);

  await page.locator('#input').fill('ทดสอบแชทในเบราว์เซอร์จริง');
  await page.locator('#send-btn').click();

  await expect(page.locator('#messages .msg.user').last())
    .toContainText('ทดสอบแชทในเบราว์เซอร์จริง');
  await expect(page.locator('#messages .msg.bot').last())
    .toContainText('สวัสดีจากการทดสอบ Chromium จริง');
  expect(chatPayload.messages.some((message) => message.content.includes('ทดสอบแชทในเบราว์เซอร์จริง'))).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('real Chromium can approve a tool and remember approval for the session', async ({ page }) => {
  const pageErrors = [];
  let chatCount = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureTestPage(page, () => {
    chatCount++;
    if (chatCount % 2 === 1) {
      return '```tool\n{"tool":"timer","args":{"seconds":3600,"label":"Playwright approval test"}}\n```';
    }
    return 'ตั้งเวลา Playwright เรียบร้อยแล้ว';
  });

  await page.goto('/');
  const dialog = page.locator('#confirm-modal');
  const submit = async (text) => {
    await page.locator('#input').fill(text);
    await page.locator('#send-btn').click();
  };

  await submit('ตั้งเวลา Playwright');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#confirm-title')).toContainText('ตั้งเวลา');
  await page.locator('#confirm-always').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#messages .msg.bot').last()).toContainText('ตั้งเวลา Playwright เรียบร้อยแล้ว');

  await submit('ตั้งเวลา Playwright อีกครั้งใน session เดียวกัน');
  await expect(page.locator('#messages .msg.bot').last()).toContainText('ตั้งเวลา Playwright เรียบร้อยแล้ว');
  await expect(dialog).toBeHidden();
  expect(chatCount).toBe(4);
  expect(page.locator('#messages .msg-cards').filter({ hasText: 'Playwright approval test' })).toHaveCount(2);
  expect(pageErrors).toEqual([]);
});

test('real Chromium preserves an offline message until the user confirms removal', async ({ page }) => {
  const pageErrors = [];
  const chatRequests = [];
  const prompts = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureTestPage(page, (payload) => {
    chatRequests.push(payload);
    return 'คำตอบจำลอง';
  });

  await page.goto('/');
  await page.context().setOffline(true);
  await page.locator('#input').fill('เก็บข้อความไว้ในคิวออฟไลน์');
  await page.locator('#send-btn').click();

  const panel = page.locator('#outbox-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#outbox-badge')).toContainText('1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('no7.outbox.v1') || '[]').map((item) => item.text)))
    .toEqual(['เก็บข้อความไว้ในคิวออฟไลน์']);
  expect(chatRequests).toHaveLength(0);

  page.once('dialog', async (dialog) => {
    prompts.push(dialog.message());
    await dialog.dismiss();
  });
  await page.locator('#outbox-list button').click();
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('no7.outbox.v1') || '[]'))).toHaveLength(1);

  page.once('dialog', async (dialog) => {
    prompts.push(dialog.message());
    await dialog.accept();
  });
  await page.locator('#outbox-list button').click();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('no7.outbox.v1'))).toBeNull();
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toContain('ลบข้อความนี้');
  expect(pageErrors).toEqual([]);
});

test('real Chromium flushes queued messages once after connectivity returns', async ({ page }) => {
  const pageErrors = [];
  const chatRequests = [];
  await page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureTestPage(page, (payload) => {
    chatRequests.push(payload);
    return 'ตอบกลับหลังกลับมาออนไลน์';
  });

  await page.goto('/');
  await page.context().setOffline(true);
  await page.locator('#input').fill('ส่งข้อความนี้เมื่อกลับมาออนไลน์');
  await page.locator('#send-btn').click();
  await expect(page.locator('#outbox-panel')).toBeVisible();
  expect(chatRequests).toHaveLength(0);

  await page.context().setOffline(false);
  await expect(page.locator('#messages .msg.bot').filter({ hasText: 'ตอบกลับหลังกลับมาออนไลน์' })).toHaveCount(1);
  await expect(page.locator('#outbox-panel')).toBeHidden();
  expect(chatRequests).toHaveLength(1);
  expect(chatRequests[0].messages.some((message) => message.content.includes('ส่งข้อความนี้เมื่อกลับมาออนไลน์'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('no7.outbox.v1'))).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('real Chromium previews backup restore and writes only after explicit confirmation', async ({ page }) => {
  const pageErrors = [];
  await page.on('pageerror', (error) => pageErrors.push(error.message));
  await configureTestPage(page, () => 'ไม่ควรมีการเรียก AI ระหว่าง restore', { apiKey: 'device-local-secret' });
  await page.goto('/');
  await page.locator('#nav button[data-view="settings"]').click();

  const timestamp = Date.now();
  const backup = createBackup({
    settings: { provider: 'pollinations', model: 'openai', uiLang: 'th', apiKey: '' },
    facts: [{ id: 'e2e-restore-fact', text: 'ความจำจาก E2E restore', ts: timestamp, importance: 2 }],
    log: [{ role: 'user', text: 'บทสนทนาจากไฟล์สำรอง E2E', ts: timestamp }],
    notes: [{ text: 'โน้ตจากไฟล์สำรอง E2E', ts: timestamp }],
    healthHistory: [{
      date: new Date(timestamp).toISOString().slice(0, 10), score: 72, grade: 'B',
      issues: { high: 0, medium: 1, low: 2 }, privateNote: 'ต้องไม่ถูกนำเข้า',
    }],
  }, { now: timestamp, version: 'e2e' });
  const backupFile = {
    name: 'no7-e2e-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  };
  const beforeRestore = await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter((key) => key.startsWith('no7.')).sort()
      .map((key) => [key, localStorage.getItem(key)]),
  ));

  const deniedDialog = page.waitForEvent('dialog');
  await page.locator('#import-file').setInputFiles(backupFile);
  const denied = await deniedDialog;
  expect(denied.type()).toBe('confirm');
  expect(denied.message()).toContain('พบข้อมูลสำรอง');
  await denied.dismiss();
  await expect(page.locator('#backup-status')).toContainText('ยกเลิกการนำเข้าแล้ว');
  expect(await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter((key) => key.startsWith('no7.')).sort()
      .map((key) => [key, localStorage.getItem(key)]),
  ))).toEqual(beforeRestore);

  const acceptedDialog = page.waitForEvent('dialog');
  await page.locator('#import-file').setInputFiles(backupFile);
  const accepted = await acceptedDialog;
  expect(accepted.type()).toBe('confirm');
  await accepted.accept();
  await expect(page.locator('#backup-status')).toContainText('นำเข้าแล้ว');

  const restored = await page.evaluate(() => ({
    memory: JSON.parse(localStorage.getItem('no7.memory.v2') || '{}'),
    notes: JSON.parse(localStorage.getItem('no7.notes.v1') || '[]'),
    settings: JSON.parse(localStorage.getItem('no7.settings.v1') || '{}'),
    health: JSON.parse(localStorage.getItem('no7.health.history.v1') || '{}'),
  }));
  expect(restored.memory.facts.some((fact) => fact.text === 'ความจำจาก E2E restore')).toBe(true);
  expect(restored.memory.log.some((entry) => entry.text === 'บทสนทนาจากไฟล์สำรอง E2E')).toBe(true);
  expect(restored.notes.some((note) => note.text === 'โน้ตจากไฟล์สำรอง E2E')).toBe(true);
  expect(restored.settings.apiKey).toBe('device-local-secret');
  expect(JSON.stringify(restored.health)).not.toContain('ต้องไม่ถูกนำเข้า');
  expect(pageErrors).toEqual([]);
});

test('real Chromium permission dialog defaults to denial and blocks the requested action', async ({ page }) => {
  const pageErrors = [];
  const chatRequests = [];
  const popups = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('popup', (popup) => popups.push(popup.url()));
  await configureTestPage(page, (payload) => {
    chatRequests.push(payload);
    if (chatRequests.length === 1) {
      return '```tool\n{"tool":"compose_message","args":{"to":"friend@example.com","subject":"สวัสดี","body":"ช่วยนัดพบกันพรุ่งนี้"}}\n```';
    }
    return 'รับทราบ ฉันจะไม่เปิดหรือส่งข้อความ เพราะคุณไม่อนุญาต';
  });

  await page.goto('/');
  await page.locator('#input').fill('ร่างข้อความถึงเพื่อน');
  await page.locator('#send-btn').click();

  const dialog = page.locator('#confirm-modal');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#confirm-title')).toContainText('ร่างข้อความ');
  await expect(page.locator('#confirm-args')).toContainText('friend@example.com');
  await expect(page.locator('#confirm-no')).toBeFocused();

  await page.locator('#confirm-no').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#messages .msg.bot').last())
    .toContainText('ไม่ได้ทำอะไรต่อ');
  expect(chatRequests).toHaveLength(1);
  expect(popups).toEqual([]);
  expect(pageErrors).toEqual([]);
});
