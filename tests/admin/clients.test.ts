import { expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { deps, seedFixtures, at } from '../helpers/fixtures';
import { clients } from '../../src/db/schema';
import { listClients, getClientCard } from '../../src/admin/clients';
import { createBooking } from '../../src/booking/service';

test('следующая запись клиента приходит настоящей датой, без записи пусто', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00', '2026-12-01') });
    const created = await createBooking(d, {
      serviceId: 1,
      masterId: 1,
      start: at('10:00'),
      name: 'Анна',
      phone: '+79000000011',
      idempotencyKey: 'next-booking',
      actor: 'client_site',
    });
    expect(created.ok).toBe(true);
    await fixture.db.insert(clients).values({ name: 'Без записи', phone: '+79000000012' });
    const rows = await listClients(d);
    const withBooking = rows.find((row) => row.phone === '+79000000011');
    expect(withBooking?.nextBooking).toBeInstanceOf(Date);
    expect(withBooking?.nextBooking?.getTime()).toBe(at('10:00').getTime());
    expect(rows.find((row) => row.phone === '+79000000012')?.nextBooking).toBeNull();
  } finally {
    await fixture.close();
  }
});

test('поиск трактует %, _ буквально; карточка показывает записи и обезличивание', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const [one] = await fixture.db
      .insert(clients)
      .values({ name: 'Аня %', phone: '+79000000001' })
      .returning();
    await fixture.db.insert(clients).values({ name: 'Аня другая', phone: '+79000000002' });
    const d = deps(fixture.db, { current: at('09:00') });
    expect((await listClients(d, '%')).map((x) => x.id)).toEqual([one.id]);
    expect(await listClients(d, '_')).toEqual([]);
    expect((await listClients(d, '00000001')).map((x) => x.id)).toEqual([one.id]);
    expect((await getClientCard(d, one.id))?.name).toBe('Аня %');
    await fixture.db
      .update(clients)
      .set({ name: 'Обезличено', phone: null, anonymizedAt: new Date() });
    expect((await getClientCard(d, one.id))?.phone).toBeNull();
  } finally {
    await fixture.close();
  }
});
