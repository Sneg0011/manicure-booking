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
async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Логин').fill('manager');
  await page.getByLabel('Пароль').fill('demo-password-for-tests');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin\/calendar/);
}

test('сводка соответствует базе, списки доступны, экран 390 px не прокручивается вбок', async ({
  page,
}) => {
  await login(page);
  const counts = (
    await sql(
      "SELECT count(*) filter (where source='site')::int AS self, count(*) filter (where source='manager')::int AS manager FROM bookings",
    )
  ).rows[0];
  await page.goto('/admin');
  await expect(page.getByText('Записались сами')).toBeVisible();
  await expect(page.locator('.admin-stats')).toContainText(String(counts.self));
  await expect(page.locator('.admin-stats')).toContainText(String(counts.manager));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/admin',
    '/admin/calls',
    '/admin/clients',
    '/admin/journal',
    '/admin/schedule',
    '/admin/services',
    '/admin/calendar',
  ]) {
    await page.goto(path);
    await expect(page.getByText('Демо-данные: записи вымышленные')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(390);
  }
});

test('отметка звонка сохраняется, клиенты и журнал показывают данные без выполнения HTML', async ({
  page,
}) => {
  await login(page);
  const row = (
    await sql(
      "SELECT b.id, b.warned_at, c.id AS client_id, c.name AS client_name FROM bookings b JOIN clients c ON c.id=b.client_id WHERE NOT EXISTS (SELECT 1 FROM closures x WHERE x.master_id = b.master_id AND x.starts_at < b.occupied_until AND x.ends_at > b.starts_at) AND b.status='active' AND b.starts_at > now() ORDER BY b.starts_at LIMIT 1",
    )
  ).rows[0];
  const previous = (await sql('SELECT warned_at, needs_call FROM bookings WHERE id=$1', [row.id]))
    .rows[0];
  const lastEvent = (
    await sql('SELECT coalesce(max(id),0)::int AS id FROM booking_events WHERE booking_id=$1', [
      row.id,
    ])
  ).rows[0].id;
  try {
    await sql("UPDATE bookings SET needs_call='changed', warned_at=NULL WHERE id=$1", [row.id]);
    await page.addInitScript(() => {
      window.alert = () => {
        (window as unknown as { __alertCalled?: boolean }).__alertCalled = true;
      };
    });
    await sql('UPDATE clients SET name=$1 WHERE id=$2', [
      '<script>alert(1)</script>',
      row.client_id,
    ]);
    await page.goto('/admin/clients');
    await expect(page.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __alertCalled?: boolean }).__alertCalled),
    ).toBeUndefined();
    await page.goto(`/admin/clients?id=${row.client_id}`);
    await expect(page.getByRole('heading', { name: '<script>alert(1)</script>' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'История' })).toBeVisible();
    await sql('UPDATE clients SET name=$1 WHERE id=$2', ['Д'.repeat(60), row.client_id]);
    await page.goto('/admin/clients');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Д'.repeat(60))).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.goto('/admin/journal');
    await expect(page.getByRole('heading', { name: 'Журнал' })).toBeVisible();
    await page.goto('/admin/calls');
    const callRow = page.locator('tr', { has: page.locator(`a[href*="booking=${row.id}"]`) });
    await expect(callRow).toContainText('Сообщить об изменении');
    await expect(callRow.locator('a[href^="tel:"]')).toBeVisible();
    await callRow.getByRole('button', { name: 'Менеджер предупредил' }).click();
    // Сначала ждём ответа сервера: перезагрузка сразу после нажатия оборвала бы запрос.
    await expect(callRow).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator('tr', { has: page.locator(`a[href*="booking=${row.id}"]`) }),
    ).toHaveCount(0);
    expect(
      (await sql('SELECT warned_at FROM bookings WHERE id=$1', [row.id])).rows[0].warned_at,
    ).not.toBeNull();
  } finally {
    await sql('UPDATE clients SET name=$1 WHERE id=$2', [row.client_name, row.client_id]);
    await sql('UPDATE bookings SET warned_at=$1, needs_call=$2 WHERE id=$3', [
      previous.warned_at,
      previous.needs_call,
      row.id,
    ]);
    await sql("DELETE FROM booking_events WHERE booking_id=$1 AND type='warned' AND id>$2", [
      row.id,
      lastEvent,
    ]);
  }
});

test('журнал показывает канал, получателя, статус и текст ошибки; фильтр оставляет сбои', async ({
  page,
}) => {
  await login(page);
  const marker = `Проверка журнала ${Date.now()}`;
  let id: number | undefined;
  try {
    id = (
      await sql(
        "INSERT INTO notifications (recipient, channel, body, status, error) VALUES ('manager','journal',$1,'failed','Тестовая ошибка') RETURNING id",
        [marker],
      )
    ).rows[0].id;
    await page.goto('/admin/journal');
    const row = page.locator('tr', { hasText: marker });
    await expect(row).toContainText('Менеджер');
    await expect(row).toContainText('Журнал');
    await expect(row).toContainText('Ошибка');
    await expect(row).toContainText('Тестовая ошибка');
    await page.getByRole('link', { name: 'Только ошибки' }).click();
    await expect(page.locator('tr', { hasText: marker })).toBeVisible();
  } finally {
    if (id) await sql('DELETE FROM notifications WHERE id=$1', [id]);
  }
});
