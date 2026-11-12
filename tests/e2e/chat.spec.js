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

test('real Chromium permission dialog defaults to denial and blocks the requested action', async ({ page }) => {
  const pageErrors = [];
  const chatRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
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
    .toContainText('ฉันจะไม่เปิดหรือส่งข้อความ');
  expect(chatRequests).toHaveLength(2);
  expect(pageErrors).toEqual([]);
});
