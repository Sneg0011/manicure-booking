import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../src/db/client';
import { getAvailability } from '../../src/booking/availability';
import { createBooking } from '../../src/booking/service';
import { formatStudioDate, formatStudioTime } from '../../src/lib/time';
import { nextStudioDate } from '../../src/booking/rules';

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

test('менеджер закрывает время; витрина в другом браузере теряет слот', async ({
  page,
  browser,
}) => {
  await login(page);
  const visitor = await browser.newPage();
  const connection = createDb('postgres://postgres:postgres@127.0.0.1:54320/manicure_e2e');
  const deps = { db: connection.db, now: () => new Date() };
  const today = formatStudioDate(new Date());
  let date = today;
  let slot: Awaited<ReturnType<typeof getAvailability>>[number] | undefined;
  let dayIndex = 0;
  for (let i = 0; i < 13; i++, date = nextStudioDate(date)) {
    if (i < 3) continue;
    slot = (await getAvailability(deps, { serviceId: 1, masterId: 1, date }))[0];
    if (slot) {
      dayIndex = i;
      break;
    }
  }
  expect(slot).toBeDefined();
  const time = formatStudioTime(slot!.start);
  const endTime = formatStudioTime(new Date(slot!.start.getTime() + 60 * 60_000));
  const reason = `Проверка ${randomUUID()}`;
  try {
    await visitor.goto('/book?service=1&master=1');
    await visitor.locator('.days button').nth(dayIndex).click();
    await expect(visitor.getByRole('button', { name: new RegExp(`^${time} МСК`) })).toBeVisible();
    await page.goto('/admin/schedule');
    const form = page.locator('form', {
      has: page.getByRole('button', { name: 'Добавить закрытие' }),
    });
    await form.locator('[name=masterId]').selectOption('1');
    await form.locator('[name=startDate]').fill(date);
    await form.locator('[name=endDate]').fill(date);
    await form.locator('[name=startTime]').fill(time);
    await form.locator('[name=endTime]').fill(endTime);
    await form.locator('[name=reason]').fill(reason);
    await form.getByRole('button', { name: 'Добавить закрытие' }).click();
    await expect(page.getByText(/Записей в конфликте/)).toBeVisible();
    await visitor.reload();
    await visitor.locator('.days button').nth(dayIndex).click();
    await expect(visitor.getByRole('button', { name: new RegExp(`^${time} МСК`) })).toHaveCount(0);
    expect(
      await createBooking(deps, {
        serviceId: 1,
        masterId: 1,
        start: slot!.start,
        name: 'Проверка',
        phone: '+79000009991',
        idempotencyKey: randomUUID(),
        actor: 'client_site',
      }),
    ).toMatchObject({ ok: false, error: 'outside_schedule' });
  } finally {
    await sql('DELETE FROM closures WHERE reason=$1', [reason]);
    await connection.pool.end();
    await visitor.close();
  }
});

test('изменение часов и правил сохраняется и возвращается к прежним значениям', async ({
  page,
}) => {
  await login(page);
  const original = (await sql('SELECT * FROM settings WHERE id=1')).rows[0];
  const hours = (await sql('SELECT * FROM working_hours WHERE master_id=1 AND weekday=1')).rows[0];
  try {
    await page.goto('/admin/schedule');
    const ruleForm = page.locator('form', {
      has: page.getByRole('button', { name: 'Сохранить правила' }),
    });
    await ruleForm.locator('[name=slotStepMin]').fill('15');
    await ruleForm.getByRole('button', { name: 'Сохранить правила' }).click();
    expect((await sql('SELECT slot_step_min FROM settings WHERE id=1')).rows[0].slot_step_min).toBe(
      15,
    );
    const hourForm = page
      .locator('form', { has: page.locator('[name=weekday][value="1"]') })
      .first();
    await hourForm.locator('[name=closes]').fill('18:00');
    await hourForm.getByRole('button', { name: 'Сохранить' }).click();
    expect(
      (await sql('SELECT closes_at FROM working_hours WHERE master_id=1 AND weekday=1')).rows[0]
        .closes_at,
    ).toBe('18:00:00');
  } finally {
    await sql(
      'UPDATE settings SET slot_step_min=$1, min_lead_min=$2, horizon_days=$3, change_cutoff_min=$4, max_client_moves=$5 WHERE id=1',
      [
        original.slot_step_min,
        original.min_lead_min,
        original.horizon_days,
        original.change_cutoff_min,
        original.max_client_moves,
      ],
    );
    await sql(
      'UPDATE working_hours SET opens_at=$1, closes_at=$2 WHERE master_id=1 AND weekday=1',
      [hours.opens_at, hours.closes_at],
    );
  }
});

test('редактирование услуги сразу меняет витрину, исходные значения восстанавливаются', async ({
  page,
  browser,
}) => {
  await login(page);
  const visitor = await browser.newPage();
  const original = (await sql('SELECT * FROM services WHERE id=1')).rows[0];
  try {
    await page.goto('/admin/services');
    const form = page.locator('form', { has: page.locator('[name=id][value="1"]') }).first();
    await form.locator('[name=durationMin]').fill('120');
    await form.locator('[name=isActive]').uncheck();
    await form.getByRole('button', { name: 'Сохранить услугу' }).click();
    await expect(page.getByText('скрыта').first()).toBeVisible();
    const changed = (await sql('SELECT duration_min, is_active FROM services WHERE id=1')).rows[0];
    expect(changed).toMatchObject({ duration_min: 120, is_active: false });
    await visitor.goto('/book?service=1');
    await expect(visitor.getByText(original.name, { exact: true })).toHaveCount(0);
  } finally {
    await sql(
      'UPDATE services SET name=$1, description=$2, category=$3, duration_min=$4, buffer_min=$5, price_rub=$6, is_active=$7, sort=$8 WHERE id=1',
      [
        original.name,
        original.description,
        original.category,
        original.duration_min,
        original.buffer_min,
        original.price_rub,
        original.is_active,
        original.sort,
      ],
    );
    await visitor.close();
  }
});

test('значения мастера сохраняются отдельно, ошибочные правила отклоняются', async ({ page }) => {
  await login(page);
  const first = (await sql('SELECT * FROM master_services WHERE master_id=1 AND service_id=1'))
    .rows[0];
  const second = (await sql('SELECT * FROM master_services WHERE master_id=2 AND service_id=1'))
    .rows[0];
  const rules = (await sql('SELECT * FROM settings WHERE id=1')).rows[0];
  try {
    await page.goto('/admin/services');
    const form = page
      .locator('form', { has: page.locator('[name=masterId][value="1"]') })
      .filter({ has: page.locator('[name=serviceId][value="1"]') })
      .first();
    await form.locator('[name=durationMin]').fill('95');
    await form.locator('[name=priceRub]').fill('1900');
    await form.getByRole('button', { name: 'Сохранить мастера' }).click();
    expect(
      (
        await sql(
          'SELECT duration_min, price_rub FROM master_services WHERE master_id=1 AND service_id=1',
        )
      ).rows[0],
    ).toMatchObject({ duration_min: 95, price_rub: 1900 });
    expect(
      (
        await sql(
          'SELECT duration_min, price_rub FROM master_services WHERE master_id=2 AND service_id=1',
        )
      ).rows[0],
    ).toMatchObject({ duration_min: second.duration_min, price_rub: second.price_rub });
    await page.goto('/admin/schedule');
    const ruleForm = page.locator('form', {
      has: page.getByRole('button', { name: 'Сохранить правила' }),
    });
    await ruleForm.locator('[name=horizonDays]').fill('181');
    await ruleForm.getByRole('button', { name: 'Сохранить правила' }).click();
    await expect(page.locator('.admin-error')).toContainText('Горизонт записи');
    expect((await sql('SELECT horizon_days FROM settings WHERE id=1')).rows[0].horizon_days).toBe(
      rules.horizon_days,
    );
  } finally {
    await sql(
      'UPDATE master_services SET duration_min=$1, price_rub=$2 WHERE master_id=1 AND service_id=1',
      [first.duration_min, first.price_rub],
    );
    await sql(
      'UPDATE settings SET slot_step_min=$1, min_lead_min=$2, horizon_days=$3, change_cutoff_min=$4, max_client_moves=$5 WHERE id=1',
      [
        rules.slot_step_min,
        rules.min_lead_min,
        rules.horizon_days,
        rules.change_cutoff_min,
        rules.max_client_moves,
      ],
    );
  }
});

test('сокращение часов в панели сразу убирает поздний слот с витрины', async ({
  page,
  browser,
}) => {
  await login(page);
  const visitor = await browser.newPage();
  const connection = createDb('postgres://postgres:postgres@127.0.0.1:54320/manicure_e2e');
  const deps = { db: connection.db, now: () => new Date() };
  let date = formatStudioDate(new Date());
  let chosen: { index: number; weekday: number; time: string } | null = null;
  for (let index = 0; index < 13; index++, date = nextStudioDate(date)) {
    if (index < 3) continue;
    const late = (await getAvailability(deps, { serviceId: 1, masterId: 1, date })).find(
      (x) => formatStudioTime(x.start) >= '19:00',
    );
    if (late) {
      chosen = {
        index,
        weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
        time: formatStudioTime(late.start),
      };
      break;
    }
  }
  expect(chosen).not.toBeNull();
  const original = (
    await sql('SELECT opens_at, closes_at FROM working_hours WHERE master_id=1 AND weekday=$1', [
      chosen!.weekday,
    ])
  ).rows[0];
  try {
    await visitor.goto('/book?service=1&master=1');
    await visitor.locator('.days button').nth(chosen!.index).click();
    await expect(
      visitor.getByRole('button', { name: new RegExp(`^${chosen!.time} МСК`) }),
    ).toBeVisible();
    await page.goto('/admin/schedule');
    const form = page
      .locator('form', { has: page.locator('[name=masterId][value="1"]') })
      .filter({ has: page.locator(`[name=weekday][value="${chosen!.weekday}"]`) })
      .first();
    await form.locator('[name=closes]').fill('18:00');
    await form.getByRole('button', { name: 'Сохранить' }).click();
    await visitor.reload();
    await visitor.locator('.days button').nth(chosen!.index).click();
    await expect(
      visitor.getByRole('button', { name: new RegExp(`^${chosen!.time} МСК`) }),
    ).toHaveCount(0);
  } finally {
    await sql(
      'UPDATE working_hours SET opens_at=$1, closes_at=$2 WHERE master_id=1 AND weekday=$3',
      [original.opens_at, original.closes_at, chosen!.weekday],
    );
    await connection.pool.end();
    await visitor.close();
  }
});
