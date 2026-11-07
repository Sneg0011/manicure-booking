import { test, expect } from '@playwright/test';
import pg from 'pg';

async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({
    connectionString: 'postgres://postgres:postgres@127.0.0.1:54320/manicure_e2e',
  });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function book(page: import('@playwright/test').Page) {
  await page.goto('/book?service=2');
  await page.locator('.days button:not([disabled])').first().click();
  await page.locator('.slot').first().click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page).toHaveURL(/\/b\//);
  return page.url().split('/b/')[1].split('?')[0];
}

test('неверный токен возвращает 404 без записи', async ({ page }) => {
  const response = await page.goto('/b/not-a-real-token');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Запись больше не существует или ссылка неверна')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Телефон');
});
test('личная страница не индексируется, перенос и отмена освобождают время', async ({
  page,
  browser,
}) => {
  await page.goto('/book?service=2');
  await page.locator('.days button:not([disabled])').first().click();
  const first = page.locator('.slot').first();
  const oldTime = await first.getAttribute('aria-label');
  await first.click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page).toHaveURL(/\/b\//);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  const masterName =
    (await page.locator('.booking-details div').nth(1).locator('dd').textContent())?.split(
      ' ',
    )[0] ?? '';
  const url = page.url();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Перенести' }).click();
  await page.locator('.move-panel .days button:not([disabled])').first().click();
  const newTime = await page.locator('.move-panel .slot').last().getAttribute('aria-label');
  await page.locator('.move-panel .slot').last().click();
  await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
  await expect(page.getByText('Осталось переносов: два.')).toBeVisible();
  const other = await browser.newPage();
  await other.goto('/book?service=2');
  await other.getByRole('button', { name: masterName }).click();
  await other.locator('.days button:not([disabled])').first().click();
  await expect(other.locator(`.slot[aria-label="${oldTime}"]`)).toBeVisible();
  await expect(other.locator(`.slot[aria-label="${newTime}"]`)).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Отменить запись' }).click();
  await expect(page.getByText('Отменена')).toBeVisible();
  await other.reload();
  await other.getByRole('button', { name: masterName }).click();
  await other.locator('.days button:not([disabled])').first().click();
  await expect(other.locator(`.slot[aria-label="${newTime}"]`)).toBeVisible();
  await other.close();
  await page.goto(`${url.split('?')[0]}changed`);
  await expect(page.getByText('Запись больше не существует или ссылка неверна')).toBeVisible();
});
test('после трёх переносов клиент видит просьбу позвонить, отмена остаётся', async ({ page }) => {
  const token = await book(page);
  await sql('UPDATE bookings SET move_count = 3 WHERE manage_token = $1', [token]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Перенести' })).toHaveCount(0);
  await expect(page.getByText('Позвоните в студию')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отменить запись' })).toBeVisible();
});
test('позже срока изменений клиент не может ни перенести, ни отменить', async ({ page }) => {
  await book(page);
  await sql('UPDATE settings SET change_cutoff_min = 1000000');
  try {
    await page.reload();
    await expect(page.getByRole('button', { name: 'Перенести' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Отменить запись' })).toHaveCount(0);
    await expect(page.getByText('Позвоните в студию')).toBeVisible();
  } finally {
    await sql('UPDATE settings SET change_cutoff_min = 120');
  }
});
test('ссылка после сброса демо: понятная страница без ошибки 500', async ({ page, request }) => {
  await book(page);
  const url = page.url();
  await request.get('/api/cron/daily', { headers: { authorization: 'Bearer test-cron-secret' } });
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Запись больше не существует или ссылка неверна')).toBeVisible();
});
