import { expect, test } from '@playwright/test';

test('real Chromium boots No7 and completes a user-initiated chat turn', async ({ page }) => {
  const pageErrors = [];
  let chatPayload;
  page.on('pageerror', (error) => pageErrors.push(error.message));

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
      chatPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'สวัสดีจากการทดสอบ Chromium จริง' } }],
        }),
      });
      return;
    }
    if (url.origin === 'http://127.0.0.1:5173') {
      await route.continue();
      return;
    }
    await route.abort();
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
