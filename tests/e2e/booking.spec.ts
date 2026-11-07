import { test, expect } from '@playwright/test';

test('примерка покрытия меняет цвет ногтей и название', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Вишня' }).check();
  await expect(page.locator('.hero')).toHaveAttribute('style', /--coat: #7c0f24/);
  await expect(page.locator('.tryon output')).toHaveText('Вишня');
});

test('быстрая запись передаёт услугу и мастера', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('.quick-book');
  const service = form.getByLabel('Услуга');
  const master = form.getByLabel('Мастер');
  await service.selectOption({ index: 1 });
  await master.selectOption({ index: 1 });
  const serviceId = await service.inputValue();
  const masterId = await master.inputValue();
  await form.getByRole('button', { name: 'Выбрать время' }).click();
  await expect(page).toHaveURL(new RegExp(`service=${serviceId}.*master=${masterId}`));
  await expect(page.getByRole('heading', { name: 'Когда вам удобно?' })).toBeVisible();
});

test('несуществующий адрес показывает русскую страницу 404', async ({ page }) => {
  await page.goto('/does-not-exist-for-test');
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
  await expect(page.getByText('Возможно, ссылка устарела или в ней опечатка')).toBeVisible();
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Записаться' })).toHaveAttribute('href', '/book');
});

async function chooseSlot(page: import('@playwright/test').Page) {
  await page.goto('/book?service=2');
  await expect(page.getByRole('heading', { name: 'Когда вам удобно?' })).toBeVisible();
  const day = page.locator('.days button:not([disabled])').first();
  await day.click();
  const slot = page.locator('.slot').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByRole('button', { name: 'Дальше' }).click();
}
test('главная показывает услуги, мастеров, контакты и демо', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Лунка, студия маникюра/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Прайс' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Работы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Частые вопросы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Мастера' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Контакты' })).toBeVisible();
  await expect(page.getByText('Демонстрационный проект.', { exact: false })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(
    /реальные клиенты|отзывы|нам доверяют|лучшие/i,
  );
});
test('запись и тестовые данные ведут на личную страницу', async ({ page }) => {
  await chooseSlot(page);
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await expect(page.getByLabel('Телефон')).toHaveValue(/^\+7000\d{7}$/);
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page).toHaveURL(/\/b\/[^/]+\?new=1/);
  await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible();
  await expect(page.getByText('Лунный переулок, 7')).toBeVisible();
  await expect(
    page.getByText('Если подключите бота, в базе сохранится ваш Telegram ID.', { exact: false }),
  ).toBeVisible();
});
test('воскресенье не нажимается, время всегда МСК', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Asia/Vladivostok' });
  const page = await context.newPage();
  await page.goto('/book?service=2');
  await expect(page.getByRole('button', { name: /выходной/ }).first()).toBeDisabled();
  await page.locator('.days button:not([disabled])').first().click();
  await page.locator('.slot').first().click();
  await expect(page.locator('.booking-bottom')).toContainText('МСК');
  await context.close();
});
test('сброс демо во время заполнения даёт понятный отказ', async ({ page, request }) => {
  await chooseSlot(page);
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await request.get('/api/cron/daily', { headers: { authorization: 'Bearer test-cron-secret' } });
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.locator('.booking-error')).toContainText('Данные демо обновились');
});
test('390 px без горизонтальной прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/book']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
});
test('два браузера выбирают одно время: второй получает варианты', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([chooseSlot(first), chooseSlot(second)]);
  await first.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await second.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await first.getByRole('button', { name: 'Записаться' }).click();
  await expect(first).toHaveURL(/\/b\//);
  await second.getByRole('button', { name: 'Записаться' }).click();
  await expect(second.locator('.booking-error')).toContainText('Это время только что заняли');
  await expect(second.getByText('Другие свободные варианты:')).toBeVisible();
  await firstContext.close();
  await secondContext.close();
});
test('занятое время исчезает из списка для следующего посетителя', async ({ page, browser }) => {
  await page.goto('/book?service=2');
  await page.getByRole('button', { name: 'Дарья' }).click();
  await page.locator('.days button:not([disabled])').first().click();
  const slot = page.locator('.slot').first();
  const label = await slot.getAttribute('aria-label');
  await slot.click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page).toHaveURL(/\/b\//);
  const other = await browser.newPage();
  await other.goto('/book?service=2');
  await other.getByRole('button', { name: 'Дарья' }).click();
  await other.locator('.days button:not([disabled])').first().click();
  await expect(other.locator('.slot').first()).toBeVisible();
  await expect(other.locator(`.slot[aria-label="${label}"]`)).toHaveCount(0);
  await other.close();
});

test('успешная запись не показывает ошибку даже на мгновение', async ({ page }) => {
  await chooseSlot(page);
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  // Перенаправление после записи не должно считаться сбоем формы.
  await page.evaluate(() => {
    const state = window as unknown as { sawBookingError?: boolean };
    state.sawBookingError = false;
    new MutationObserver(() => {
      if (document.querySelector('.booking-error')) state.sawBookingError = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page).toHaveURL(/\/b\/[^/]+\?new=1/);
  await expect(page.getByRole('heading', { name: 'Вы записаны' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { sawBookingError?: boolean }).sawBookingError),
  ).toBe(false);
});
