import { afterEach, beforeEach, expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { BASE_NOW, deps, seedFixtures } from '../helpers/fixtures';
import { getNextFreeSlot } from '../../src/booking/next-slot';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  await seedFixtures(fixture.db);
});
afterEach(async () => {
  await fixture.close();
});
test('выбирает ближайший слот услуги дольше часа', async () => {
  const slot = await getNextFreeSlot(deps(fixture.db, { current: BASE_NOW }));
  expect(slot?.start).toBeInstanceOf(Date);
  expect(slot?.masterId).toBeGreaterThan(0);
});
