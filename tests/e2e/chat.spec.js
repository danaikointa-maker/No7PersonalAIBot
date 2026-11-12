import { expect, test } from '@playwright/test';

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !testInfo.error) return;
  const message = testInfo.error.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write(`::error title=Playwright failure: ${testInfo.title}::${message}\n`);
});

async function configureTestPage(page, onChatRequest) {
  await page.addInitScript(() => {
    localStorage.setItem('no7.settings.v1', JSON.stringify({
      provider: 'pollinations',
      model: 'openai',
      costMode: 'free',
      streaming: false,
      tts: false,
    }));
  });

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
