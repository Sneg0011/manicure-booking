import { afterEach, beforeEach, expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { hashPassword } from '../../src/auth/password';
import { checkLogin } from '../../src/auth/login';
import type { Deps } from '../../src/booking/types';
import type { Pool } from 'pg';

let deps: Deps;
let pool: Pool;
let close: () => Promise<void>;
const config = {
  login: 'manager',
  passwordHash: hashPassword('correct'),
  sessionSecret: 'a-secret-longer-than-sixteen',
};

beforeEach(async () => {
  const testDb = await createTestDb();
  pool = testDb.pool;
  close = testDb.close;
  deps = { db: testDb.db, now: () => new Date('2026-11-07T10:00:00Z') };
});
afterEach(async () => {
  if (close) await close();
});

test('верные данные принимаются, любые ошибки имеют один текст', async () => {
  expect(await checkLogin(deps, '192.0.2.1', 'manager', 'correct', config)).toEqual({ ok: true });
  const wrongPassword = await checkLogin(deps, '192.0.2.2', 'manager', 'wrong', config);
  const wrongLogin = await checkLogin(deps, '192.0.2.3', 'unknown', 'correct', config);
  expect(wrongPassword).toEqual({ ok: false, error: 'Неверный логин или пароль' });
  expect(wrongLogin).toEqual(wrongPassword);
  expect(
    await checkLogin(deps, '192.0.2.4', 'manager', 'correct', {
      ...config,
      sessionSecret: 'short',
    }),
  ).toEqual(wrongPassword);
});

test('шестая попытка заблокирована даже с верным паролем, IP хранится хэшем', async () => {
  for (let i = 0; i < 5; i++) await checkLogin(deps, '192.0.2.55', 'manager', 'wrong', config);
  expect(await checkLogin(deps, '192.0.2.55', 'manager', 'correct', config)).toEqual({
    ok: false,
    error: 'Слишком много попыток, попробуйте позже',
  });
  const rows = await pool.query('select key from request_log');
  expect(rows.rows).toHaveLength(5);
  for (const row of rows.rows) {
    expect(row.key).toMatch(/^login:[0-9a-f]{64}$/);
    expect(row.key).not.toContain('192.0.2.55');
  }
});
