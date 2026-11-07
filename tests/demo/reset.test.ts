import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import type { Db } from '../../src/db/client';
import type { Deps } from '../../src/booking/types';
import { getCallList } from '../../src/booking/call-list';
import { getSummary } from '../../src/booking/summary';
import { resetDemo } from '../../src/demo/reset';
import { createTestDb } from '../helpers/db';
import { formatStudioDate, fromStudioTime, studioWeekday } from '../../src/lib/time';

let db: Db, pool: Pool, close: () => Promise<void>;
beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
});
afterEach(async () => {
  if (close) await close();
});
const dep = (date: string): Deps => ({ db, now: () => new Date(date) });

test.each([
  ['Sunday', '2026-12-06T17:00:00Z'],
  ['Monday 23:30', '2026-12-07T20:30:00Z'],
  ['Saturday 14:50', '2026-12-12T11:50:00Z'],
  ['weekday noon', '2026-12-08T09:00:00Z'],
])('reset produces valid demo at %s', async (_, instant) => {
  const d = dep(instant);
  await resetDemo(d);
  const masters = (await pool.query('select id,name,bio,photo from masters order by id')).rows;
  expect(masters.map((r) => r.name)).toEqual(['Дарья Соколова', 'Милана Орлова']);
  expect(masters.every((r) => r.bio && r.photo?.startsWith('/photos/'))).toBe(true);
  const services = (await pool.query('select * from services order by id')).rows;
  expect(services.map((r) => [r.name, r.duration_min, r.buffer_min, r.price_rub])).toEqual([
    ['Без покрытия', 45, 15, 1400],
    ['С покрытием', 105, 15, 2600],
    ['Снятие и новое покрытие', 135, 15, 3000],
    ['Наращивание', 165, 15, 4200],
    ['Ремонт одного ногтя', 15, 15, 400],
    ['Педикюр с покрытием', 105, 15, 3400],
  ]);
  expect(services.every((r) => (r.duration_min + r.buffer_min) % 30 === 0 && r.description)).toBe(
    true,
  );
  const links = (await pool.query('select * from master_services')).rows;
  expect(links).toHaveLength(12);
  expect(links.find((r) => r.master_id === 2 && r.service_id === 4)).toMatchObject({
    duration_min: 195,
    price_rub: 4800,
  });
  expect(links.find((r) => r.master_id === 2 && r.service_id === 2).price_rub).toBe(2900);
  const hours = (await pool.query('select * from working_hours')).rows;
  expect(hours).toHaveLength(12);
  for (const h of hours)
    expect([h.opens_at, h.closes_at]).toEqual(
      h.weekday === 6 ? ['10:00:00', '15:00:00'] : ['10:00:00', '22:00:00'],
    );
  expect(hours.some((h) => h.weekday === 0)).toBe(false);
  const rows = (
    await pool.query(`select b.*, extract(dow from b.starts_at at time zone 'Europe/Moscow')::int weekday,
    (b.starts_at at time zone 'Europe/Moscow')::time local_start,
    (b.ends_at at time zone 'Europe/Moscow')::time local_end,
    h.opens_at, h.closes_at from bookings b join working_hours h on h.master_id=b.master_id
    and h.weekday=extract(dow from b.starts_at at time zone 'Europe/Moscow') order by b.master_id,b.starts_at`)
  ).rows;
  expect(rows.length).toBeGreaterThanOrEqual(12);
  expect(rows.length).toBeLessThanOrEqual(18);
  const today = formatStudioDate(d.now());
  let next = new Date(`${today}T12:00:00Z`);
  do {
    next = new Date(next.getTime() + 86400000);
  } while (studioWeekday(fromStudioTime(next.toISOString().slice(0, 10), '12:00')) === 0);
  expect(
    rows.some((r) => formatStudioDate(new Date(r.starts_at)) === next.toISOString().slice(0, 10)),
  ).toBe(true);
  const closeToday = studioWeekday(fromStudioTime(today, '12:00')) === 6 ? 15 : 22;
  const hasFreeToday =
    studioWeekday(d.now()) !== 0 &&
    Array.from({ length: (closeToday - 10) * 2 }, (_, i) => i * 30 + 600).some(
      (m) =>
        fromStudioTime(
          today,
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        ) > d.now(),
    );
  if (hasFreeToday)
    expect(rows.some((r) => formatStudioDate(new Date(r.starts_at)) === today)).toBe(true);
  for (const r of rows) {
    expect(new Date(r.starts_at).getTime()).toBeGreaterThanOrEqual(
      d.now().getTime() - 7 * 86400000,
    );
    expect(new Date(r.starts_at).getTime()).toBeLessThanOrEqual(d.now().getTime() + 7 * 86400000);
    expect(Number(String(r.local_start).slice(3, 5)) % 30).toBe(0);
    expect(r.local_start >= r.opens_at && r.local_end <= r.closes_at).toBe(true);
    expect(r.status === 'active' ? new Date(r.starts_at) > d.now() : true).toBe(true);
    expect(new Date(r.starts_at) < d.now() ? r.status !== 'active' : true).toBe(true);
  }
  for (const [i, r] of rows.entries())
    if (i && rows[i - 1].master_id === r.master_id) {
      expect(
        new Date(rows[i - 1].occupied_until).getTime() <= new Date(r.starts_at).getTime() ||
          rows[i - 1].status === 'cancelled',
      ).toBe(true);
    }
  expect(
    (
      await pool.query(
        "select count(*)::int n from clients where phone like '+7000%' and phone ~ '^\\+7000[0-9]{7}$' ",
      )
    ).rows[0].n,
  ).toBe((await pool.query('select count(*)::int n from clients')).rows[0].n);
  expect(
    (await pool.query("select count(*)::int n from notifications where status='pending'")).rows[0]
      .n,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "select count(distinct booking_id)::int n from booking_events where type='created'",
      )
    ).rows[0].n,
  ).toBe(rows.length);
  expect(
    (
      await pool.query(
        "select count(distinct booking_id)::int n from notifications where channel='journal' and status in ('sent','not_connected')",
      )
    ).rows[0].n,
  ).toBe(rows.length);
  expect(
    (await pool.query("select count(*)::int n from notifications where channel='journal'")).rows[0]
      .n,
  ).toBe(
    (
      await pool.query(
        "select count(*)::int n from booking_events where type in ('created','moved','cancelled')",
      )
    ).rows[0].n,
  );
  expect(
    (
      await pool.query(
        "select count(*)::int n from bookings where status='cancelled' and starts_at > $1",
        [d.now()],
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
  expect(
    (await pool.query("select count(*)::int n from bookings where source='site'")).rows[0].n,
  ).toBeGreaterThan(rows.length / 2);
  const calls = await getCallList(d);
  expect(calls.some((c) => c.reason === 'changed')).toBe(true);
  expect(calls.some((c) => c.reason === 'conflict')).toBe(true);
  const summary = await getSummary(d);
  expect(Object.values(summary).every((n) => n > 0)).toBe(true);
});

test('double reset preserves master chats, clears dependent data and restores settings', async () => {
  const d = dep('2026-12-08T09:00:00Z');
  await resetDemo(d);
  await pool.query("update masters set telegram_chat_id='123', name='Changed' where id=1");
  await pool.query('update settings set slot_step_min=5 where id=1');
  await pool.query("insert into client_chats(chat_id,booking_id) values ('456',1)");
  await pool.query("insert into request_log(key) values ('old')");
  await resetDemo(d);
  expect(
    (await pool.query('select name,telegram_chat_id from masters where id=1')).rows[0],
  ).toEqual({ name: 'Дарья Соколова', telegram_chat_id: '123' });
  expect((await pool.query('select slot_step_min from settings')).rows[0].slot_step_min).toBe(30);
  expect((await pool.query('select count(*)::int n from client_chats')).rows[0].n).toBe(0);
  expect((await pool.query('select count(*)::int n from request_log')).rows[0].n).toBe(0);
  expect((await pool.query('select min(id) id from bookings')).rows[0].id).toBe(1);
});
