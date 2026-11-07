import { afterEach, beforeEach, expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { at, BASE_NOW, deps, seedFixtures } from '../helpers/fixtures';
import { createBooking, getBotCodeByToken } from '../../src/booking/service';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  await seedFixtures(fixture.db);
});
afterEach(async () => {
  await fixture.close();
});
test('код доступен только по правильному токену', async () => {
  const d = deps(fixture.db, { current: BASE_NOW });
  const result = await createBooking(d, {
    serviceId: 2,
    masterId: 1,
    start: at('10:00'),
    name: 'Тест',
    phone: '+70000000001',
    idempotencyKey: crypto.randomUUID(),
    actor: 'client_site',
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(await getBotCodeByToken(d, result.value.manageToken)).toBe(result.value.botCode);
  expect(await getBotCodeByToken(d, 'wrong')).toBeNull();
});
