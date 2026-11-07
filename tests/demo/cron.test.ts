import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import type { Db } from '../../src/db/client';
import { handleDailyCron } from '../../src/demo/cron';
import { createTestDb } from '../helpers/db';

let db: Db, pool: Pool, close: () => Promise<void>;
beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
});
afterEach(async () => {
  if (close) await close();
});
const deps = () => ({ db, now: () => new Date('2026-12-08T09:00:00Z') });
const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/daily', {
    headers: authorization ? { authorization } : {},
  });

test('rejects missing and invalid secret without changing data', async () => {
  await pool.query(
    "insert into clients(name,phone,created_at) values ('Old','+70000000001','2020-01-01')",
  );
  expect((await handleDailyCron(req('Bearer secret'), deps(), {})).status).toBe(401);
  expect((await handleDailyCron(req(), deps(), { CRON_SECRET: 'secret' })).status).toBe(401);
  expect(
    (await handleDailyCron(req('Bearer wrong'), deps(), { CRON_SECRET: 'secret' })).status,
  ).toBe(401);
  expect((await pool.query('select name from clients')).rows[0].name).toBe('Old');
});

test('non-demo cron anonymizes without reset; demo cron resets', async () => {
  await pool.query(
    "insert into clients(name,phone,created_at) values ('Old','+70000000001','2020-01-01')",
  );
  const response = await handleDailyCron(req('Bearer secret'), deps(), { CRON_SECRET: 'secret' });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ anonymized: 1, reset: false });
  expect((await pool.query('select name from clients')).rows[0].name).toBe('Обезличено');
  const demo = await handleDailyCron(req('Bearer secret'), deps(), {
    CRON_SECRET: 'secret',
    DEMO_MODE: 'true',
  });
  expect(await demo.json()).toEqual({ anonymized: 0, reset: true });
  expect((await pool.query('select count(*)::int n from bookings')).rows[0].n).toBeGreaterThan(0);
});
