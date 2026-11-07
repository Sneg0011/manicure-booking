import { expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { deps, seedFixtures, at } from '../helpers/fixtures';
import { listServicesForAdmin, updateService, setMasterOverride } from '../../src/admin/services';
import { getCatalog } from '../../src/site/catalog';
import { getAvailability } from '../../src/booking/availability';
import { createBooking } from '../../src/booking/service';
import { bookings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

test('услуги проверяются, скрываются и значения мастера сохраняются', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const initial = (await listServicesForAdmin(d))[0];
    expect((await updateService(d, 1, { ...initial, durationMin: 0 })).ok).toBe(false);
    expect((await listServicesForAdmin(d))[0].durationMin).toBe(60);
    expect((await setMasterOverride(d, 1, 1, { durationMin: 95, priceRub: 1900 }, true)).ok).toBe(
      true,
    );
    expect(
      (await listServicesForAdmin(d))[0].masters.find((x) => x.masterId === 1)?.durationMin,
    ).toBe(95);
    expect(
      (await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' })).length,
    ).toBeLessThan(
      (await getAvailability(d, { serviceId: 1, masterId: 2, date: '2026-12-07' })).length,
    );
    expect((await updateService(d, 1, { ...initial, isActive: false })).ok).toBe(true);
    expect((await getCatalog(d)).services.some((x) => x.id === 1)).toBe(false);
    expect(await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' })).toEqual([]);
  } finally {
    await fixture.close();
  }
});

test('неверные значения услуги и мастера не записываются', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const original = (await listServicesForAdmin(d))[0];
    for (const change of [
      { name: 'а' },
      { name: 'а'.repeat(81) },
      { durationMin: 0 },
      { durationMin: 601 },
      { durationMin: 32 },
      { bufferMin: -1 },
      { bufferMin: 121 },
      { bufferMin: 12 },
      { priceRub: -1 },
      { priceRub: 1000001 },
      { priceRub: 1.5 },
    ]) {
      expect((await updateService(d, 1, { ...original, ...change })).ok).toBe(false);
      expect((await listServicesForAdmin(d))[0].durationMin).toBe(original.durationMin);
    }
    expect((await setMasterOverride(d, 1, 1, { durationMin: 13, priceRub: null }, true)).ok).toBe(
      false,
    );
    expect((await setMasterOverride(d, 1, 1, { durationMin: null, priceRub: -1 }, true)).ok).toBe(
      false,
    );
    expect(
      (await listServicesForAdmin(d))[0].masters.find((x) => x.masterId === 1)?.durationMin,
    ).toBeNull();
  } finally {
    await fixture.close();
  }
});

test('смена длительности меняет новые слоты, но сохраняет конец старой записи', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const created = await createBooking(d, {
      serviceId: 1,
      masterId: 1,
      start: at('10:00'),
      name: 'Клиент',
      phone: '+79000000003',
      idempotencyKey: 'duration',
      actor: 'manager',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' });
    const service = (await listServicesForAdmin(d))[0];
    expect((await updateService(d, 1, { ...service, durationMin: 120 })).ok).toBe(true);
    expect(
      (await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' })).length,
    ).toBeLessThan(before.length);
    expect(
      (
        await fixture.db
          .select({ endsAt: bookings.endsAt })
          .from(bookings)
          .where(eq(bookings.id, created.value.id))
      )[0].endsAt,
    ).toEqual(created.value.endsAt);
  } finally {
    await fixture.close();
  }
});
