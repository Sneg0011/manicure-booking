import { test, expect, request as newRequest } from '@playwright/test';
import pg from 'pg';
import { createHash } from 'node:crypto';

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

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Логин').fill('manager');
  await page.getByLabel('Пароль').fill('demo-password-for-tests');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin\/calendar/);
}

test('вся панель закрыта, плохие данные и подделанная cookie отклоняются', async ({ page }) => {
  try {
    for (const path of [
      '/admin',
      '/admin/calendar',
      '/admin/calls',
      '/admin/clients',
      '/admin/schedule',
      '/admin/services',
      '/admin/journal',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
    await page.getByLabel('Логин').fill('manager');
    await page.getByLabel('Пароль').fill('wrong');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
    await page
      .context()
      .addCookies([
        { name: 'manager_session', value: 'forged.jwt.signature', domain: '127.0.0.1', path: '/' },
      ]);
    await page.goto('/admin/calendar');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  } finally {
    await sql("DELETE FROM request_log WHERE key LIKE 'login:%'");
  }
});

test('шестая попытка входа за 15 минут блокируется даже с верным паролем', async ({ page }) => {
  const ip = '198.51.100.77';
  const key = `login:${createHash('sha256').update(ip).digest('hex')}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  try {
    await sql(
      'INSERT INTO request_log (key, created_at) SELECT $1, now() FROM generate_series(1, 5)',
      [key],
    );
    await page.goto('/admin/login');
    await page.getByLabel('Логин').fill('manager');
    await page.getByLabel('Пароль').fill('demo-password-for-tests');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('Слишком много попыток, попробуйте позже')).toBeVisible();
  } finally {
    await sql('DELETE FROM request_log WHERE key=$1', [key]);
  }
});

test('календарь показывает запись сайта, не выдаёт токены, действия сразу меняют базу', async ({
  page,
  browser,
}) => {
  const visitor = await browser.newPage();
  await visitor.goto('/book?service=2');
  await visitor.locator('.days button:not([disabled])').nth(1).click();
  await visitor.locator('.slot').first().click();
  await visitor.getByRole('button', { name: 'Дальше' }).click();
  await visitor.getByRole('button', { name: 'Подставить тестовые данные' }).click();
  await visitor.getByRole('button', { name: 'Записаться' }).click();
  await expect(visitor).toHaveURL(/\/b\//);
  const token = visitor.url().split('/b/')[1].split('?')[0];
  const row = (
    await sql('SELECT id, starts_at, manage_token, bot_code FROM bookings WHERE manage_token=$1', [
      token,
    ])
  ).rows[0];
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(row.starts_at);
  await login(page);
  await page.goto(`/admin/calendar?date=${date}`);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('.admin-master-head')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /Тестовая/ }).first()).toBeVisible();
  await page
    .getByRole('link', { name: /Тестовая/ })
    .first()
    .click();
  const html = await page.content();
  expect(html).not.toContain(row.manage_token);
  expect(html).not.toContain(row.bot_code);
  expect(html).not.toContain('first-private-invite-for-tests');
  expect(html).not.toContain('second-private-invite-for-tests');
  expect(html).not.toContain('123:TEST');
  await page.getByRole('link', { name: 'Неделя' }).click();
  await expect(page.locator('.admin-week-day').first().locator('h3')).toHaveCount(2);
  await expect(page.getByText('Тестовая').first()).toBeVisible();
  await page.goto(`/admin/calendar?date=${date}&booking=${row.id}`);
  await page.getByRole('button', { name: 'Менеджер предупредил' }).click();
  expect(
    (await sql('SELECT warned_at FROM bookings WHERE id=$1', [row.id])).rows[0].warned_at,
  ).not.toBeNull();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Отменена').first()).toBeVisible();
  expect((await sql('SELECT status FROM bookings WHERE id=$1', [row.id])).rows[0].status).toBe(
    'cancelled',
  );
  await visitor.close();
});

test('галочку предупреждения можно отметить и снять', async ({ page }) => {
  await login(page);
  const row = (
    await sql(
      "SELECT id, starts_at, warned_at, needs_call FROM bookings WHERE status='active' AND starts_at > now() ORDER BY starts_at LIMIT 1",
    )
  ).rows[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    row.starts_at,
  );
  try {
    await sql('UPDATE bookings SET warned_at=NULL WHERE id=$1', [row.id]);
    await page.goto(`/admin/calendar?date=${date}&booking=${row.id}`);
    const check = page.getByRole('button', { name: 'Менеджер предупредил' });
    await expect(check).toHaveAttribute('aria-pressed', 'false');
    await check.click();
    await expect(check).toHaveAttribute('aria-pressed', 'true');
    await check.click();
    await expect(check).toHaveAttribute('aria-pressed', 'false');
    expect(
      (await sql('SELECT warned_at FROM bookings WHERE id=$1', [row.id])).rows[0].warned_at,
    ).toBeNull();
  } finally {
    await sql('UPDATE bookings SET warned_at=$1, needs_call=$2 WHERE id=$3', [
      row.warned_at,
      row.needs_call,
      row.id,
    ]);
  }
});

test('POST без cookie не меняет базу; выход закрывает панель; мобильная ширина', async ({
  page,
}) => {
  await login(page);
  const row = (
    await sql(
      "SELECT id, starts_at FROM bookings WHERE status='active' AND starts_at > now() ORDER BY starts_at LIMIT 1",
    )
  ).rows[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    row.starts_at,
  );
  await page.goto(`/admin/calendar?date=${date}&booking=${row.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  let actionUrl = '';
  let actionHeaders: Record<string, string> = {};
  let actionBody = '';
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/admin/calendar')) {
      actionUrl = request.url();
      actionHeaders = request.headers();
      actionBody = request.postData() ?? '';
    }
  });
  await page.getByRole('button', { name: 'Менеджер предупредил' }).click();
  expect(actionUrl).not.toBe('');
  await sql('UPDATE bookings SET warned_at=NULL WHERE id=$1', [row.id]);
  const isolated = await newRequest.newContext();
  const { cookie: _cookie, 'content-length': _length, ...headers } = actionHeaders;
  await isolated.post(actionUrl, { headers, data: actionBody });
  expect(
    (await sql('SELECT warned_at FROM bookings WHERE id=$1', [row.id])).rows[0].warned_at,
  ).toBeNull();
  await isolated.dispose();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/admin/calendar');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('перенос, пришла и не пришла видны сразу', async ({ page }) => {
  await login(page);
  const future = (
    await sql(
      "SELECT id, starts_at FROM bookings WHERE status='active' AND starts_at > now() AND EXTRACT(DOW FROM starts_at AT TIME ZONE 'Europe/Moscow') BETWEEN 1 AND 5 ORDER BY starts_at LIMIT 1",
    )
  ).rows[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    future.starts_at,
  );
  await page.goto(`/admin/calendar?date=${date}&booking=${future.id}`);
  await page.getByRole('button', { name: 'Перенести' }).click();
  await page
    .locator('form', { has: page.getByRole('button', { name: 'Сохранить перенос' }) })
    .getByLabel('Время')
    .fill('19:00');
  await page.getByRole('button', { name: 'Сохранить перенос' }).click();
  await expect(page.getByText('19:00–').first()).toBeVisible();
  expect(
    (
      await sql('SELECT starts_at FROM bookings WHERE id=$1', [future.id])
    ).rows[0].starts_at.toISOString(),
  ).toContain('16:00:00.000Z');
  const past = (
    await sql(
      "SELECT id, starts_at FROM bookings WHERE starts_at < now() AND status IN ('attended','no_show') ORDER BY id LIMIT 2",
    )
  ).rows;
  expect(past).toHaveLength(2);
  for (const [index, booking] of past.entries()) {
    await sql("UPDATE bookings SET status='active' WHERE id=$1", [booking.id]);
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
      booking.starts_at,
    );
    await page.goto(`/admin/calendar?date=${day}&booking=${booking.id}`);
    const label = index === 0 ? 'Пришла' : 'Не пришла';
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText(label).first()).toBeVisible();
    expect(
      (await sql('SELECT status FROM bookings WHERE id=$1', [booking.id])).rows[0].status,
    ).toBe(index === 0 ? 'attended' : 'no_show');
  }
});

test('запись по звонку на занятое время показывает понятную ошибку', async ({ page }) => {
  await login(page);
  const row = (
    await sql(
      "SELECT id, service_id, master_id, starts_at FROM bookings WHERE status='active' AND starts_at > now() AND EXTRACT(DOW FROM starts_at AT TIME ZONE 'Europe/Moscow') BETWEEN 1 AND 5 AND NOT EXISTS (SELECT 1 FROM closures c WHERE c.master_id = bookings.master_id AND c.starts_at < bookings.occupied_until AND c.ends_at > bookings.starts_at) ORDER BY starts_at LIMIT 1",
    )
  ).rows[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    row.starts_at,
  );
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(row.starts_at);
  await page.goto(`/admin/calendar?date=${date}`);
  await page.getByRole('button', { name: 'Новая запись' }).click();
  const form = page.locator('.admin-new form');
  await form.locator('[name=serviceId]').selectOption(String(row.service_id));
  await form.locator('[name=masterId]').selectOption(String(row.master_id));
  await form.locator('[name=newDate]').fill(date);
  await form.locator('[name=time]').fill(time);
  await form.locator('[name=name]').fill('Тестовая Клиентка');
  await form.locator('[name=phone]').fill('+7 900 123 45 66');
  await form.getByRole('button', { name: 'Создать запись' }).click();
  await expect(page.getByText('Это время уже занято')).toBeVisible();
});
