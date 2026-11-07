import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Pool } from 'pg';
import { createTestDb } from '../helpers/db';

let pool: Pool;
let close: () => Promise<void>;

beforeAll(async () => {
  const testDb = await createTestDb();
  pool = testDb.pool;
  close = testDb.close;
  await pool.query("INSERT INTO masters (id, name) VALUES (1, 'Первый'), (2, 'Второй')");
  await pool.query(
    "INSERT INTO services (id, name, duration_min, price_rub) VALUES (1, 'Маникюр', 60, 1000)",
  );
  await pool.query("INSERT INTO clients (id, name) VALUES (1, 'Клиент')");
});

afterAll(async () => {
  if (close) await close();
});

async function insert(masterId: number, from: string, until: string, status = 'active') {
  const token = crypto.randomUUID();
  const start = `2026-12-01T${from}:00+03:00`;
  const end = `2026-12-01T${until}:00+03:00`;
  return pool.query(
    `INSERT INTO bookings (client_id, master_id, service_id, starts_at, ends_at, occupied_until, price_rub, status, source, manage_token)
     VALUES (1, $1, 1, $2, $3, $3, 1000, $4, 'site', $5) RETURNING id`,
    [masterId, start, end, status, token],
  );
}

test('пересечение у одного мастера отклоняется', async () => {
  await insert(1, '10:00', '11:30');
  await expect(insert(1, '11:00', '12:00')).rejects.toMatchObject({ code: '23P01' });
});

test('стык 10:00–11:30 и 11:30–12:30 разрешён', async () => {
  await insert(1, '13:00', '14:30');
  await expect(insert(1, '14:30', '15:30')).resolves.toBeDefined();
});

test('у другого мастера то же время разрешено', async () => {
  await insert(1, '16:00', '17:00');
  await expect(insert(2, '16:00', '17:00')).resolves.toBeDefined();
});

test('отменённая запись не занимает время', async () => {
  await insert(2, '10:00', '11:00', 'cancelled');
  await expect(insert(2, '10:00', '11:00')).resolves.toBeDefined();
});

// Postgres сначала вставляет строку в индекс, потом проверяет конфликт, поэтому две
// одновременные вставки могут ждать друг друга. Одну из них база прерывает с кодом 40P01.
// Это такой же отказ, как 23P01: вторая запись не появляется.
test('20 параллельных вставок: 1 успешна, 19 отклонены запретом или взаимной блокировкой', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => insert(2, '18:00', '19:00')),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  expect(rejected).toHaveLength(19);
  expect(rejected.every((result) => ['23P01', '40P01'].includes(result.reason?.code))).toBe(true);
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM bookings WHERE master_id = 2 AND status = 'active' AND starts_at = '2026-12-01T18:00:00+03:00'`,
  );
  expect(rows[0].n).toBe(1);
});
