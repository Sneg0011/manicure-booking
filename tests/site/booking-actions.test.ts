import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { requestLog, notifications } from '../../src/db/schema';
import { createTestDb } from '../helpers/db';
import { at, BASE_NOW, deps, seedFixtures } from '../helpers/fixtures';
import { submitBooking } from '../../src/site/booking-actions';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  await seedFixtures(fixture.db);
});
afterEach(async () => {
  await fixture.close();
});
test('шестая запись за час отклонена, IP не хранится', async () => {
  const d = deps(fixture.db, { current: BASE_NOW });
  for (let i = 0; i < 6; i++) {
    const result = await submitBooking(
      d,
      {
        serviceId: 2,
        masterId: 1,
        start: at('10:00', `2026-12-${String(7 + i).padStart(2, '0')}`),
        name: 'Тест',
        phone: `+7000000000${i}`,
        idempotencyKey: crypto.randomUUID(),
      },
      '192.0.2.10',
      { perHour: 5 },
    );
    expect(result.ok).toBe(i < 5);
  }
  const logs = await fixture.db.select().from(requestLog);
  expect(logs).toHaveLength(5);
  expect(logs.every((log) => !log.key.includes('192.0.2.10'))).toBe(true);
});
test('успех создаёт pending, исчезнувшая услуга даёт not_found', async () => {
  const d = deps(fixture.db, { current: BASE_NOW });
  const input = {
    serviceId: 2,
    masterId: 1,
    start: at('10:00'),
    name: 'Тест',
    phone: '+70000000001',
    idempotencyKey: crypto.randomUUID(),
  };
  const result = await submitBooking(d, input, '192.0.2.11', { perHour: 5 });
  expect(result.ok).toBe(true);
  expect((await fixture.db.select().from(notifications)).some((n) => n.status === 'pending')).toBe(
    true,
  );
  const missing = await submitBooking(
    d,
    { ...input, serviceId: 999, idempotencyKey: crypto.randomUUID() },
    '192.0.2.12',
    { perHour: 5 },
  );
  expect(missing).toMatchObject({ ok: false, error: 'not_found' });
});
