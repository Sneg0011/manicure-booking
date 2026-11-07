import { expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { deps, seedFixtures, at } from '../helpers/fixtures';
import { notifications } from '../../src/db/schema';
import { listNotifications } from '../../src/admin/journal';

test('журнал сортируется, делится по 50 и фильтрует ошибки', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    await fixture.db.insert(notifications).values(
      Array.from({ length: 51 }, (_, i) => ({
        recipient: 'manager' as const,
        channel: 'journal' as const,
        body: String(i),
        status: i === 50 ? ('failed' as const) : ('sent' as const),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      })),
    );
    const d = deps(fixture.db, { current: at('09:00') });
    expect((await listNotifications(d, { page: 1, onlyFailed: false })).items).toHaveLength(50);
    expect((await listNotifications(d, { page: 1, onlyFailed: false })).items[0].body).toBe('50');
    expect((await listNotifications(d, { page: 2, onlyFailed: false })).items).toHaveLength(1);
    expect(
      (await listNotifications(d, { page: 1, onlyFailed: true })).items.map((x) => x.body),
    ).toEqual(['50']);
  } finally {
    await fixture.close();
  }
});
