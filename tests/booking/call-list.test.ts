import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { getCallList, markWarned, unmarkWarned } from '../../src/booking/call-list';
import { cancelBooking, createBooking, moveBooking } from '../../src/booking/service';
import { getSummary } from '../../src/booking/summary';
import type { Deps } from '../../src/booking/types';
import type { Db } from '../../src/db/client';
import { bookings, closures, workingHours } from '../../src/db/schema';
import { createTestDb } from '../helpers/db';
import { at, deps, seedFixtures } from '../helpers/fixtures';

let db: Db, pool: Pool, close: () => Promise<void>, d: Deps;
let key = 0;
const clock = { current: at('09:00') };
beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
  await seedFixtures(db);
  clock.current = at('09:00');
  d = deps(db, clock);
  key = 0;
});
afterEach(async () => {
  if (close) await close();
});

test('в списке «Позвонить» время записи и отметки это настоящие даты', async () => {
  const result = await createBooking(d, {
    serviceId: 1,
    masterId: 1,
    start: at('12:00'),
    name: 'Клиент',
    phone: '+79001234999',
    idempotencyKey: 'call-dates',
    actor: 'manager',
  });
  if (!result.ok) throw new Error(result.error);
  await db.update(bookings).set({ needsCall: 'changed' }).where(eq(bookings.id, result.value.id));
  await db
    .update(bookings)
    .set({ warnedAt: at('08:00') })
    .where(eq(bookings.id, result.value.id));
  const [item] = await getCallList(d);
  expect(item.startsAt).toBeInstanceOf(Date);
  expect(item.startsAt.getTime()).toBe(at('12:00').getTime());
  expect(item.warnedAt).toBeInstanceOf(Date);
});

async function create(
  time: string,
  date = '2026-12-07',
  actor: 'client_site' | 'manager' = 'manager',
  masterId = 1,
) {
  const result = await createBooking(d, {
    serviceId: 1,
    masterId,
    start: at(time, date),
    name: 'Клиент',
    phone: `+79001234${String(++key).padStart(3, '0')}`,
    idempotencyKey: `call-${key}`,
    actor,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test('remind includes today and tomorrow, excludes later, past and warned', async () => {
  const today = await create('10:00');
  const tomorrow = await create('10:00', '2026-12-08');
  await create('10:00', '2026-12-09');
  expect((await getCallList(d)).map((r) => r.bookingId)).toEqual([today.id, tomorrow.id]);
  expect((await getCallList(d))[0]).toMatchObject({
    reason: 'remind',
    clientName: 'Клиент',
    clientPhone: '+79001234001',
    masterName: 'Анна',
    serviceName: 'Маникюр',
    status: 'active',
    warnedAt: null,
  });
  await markWarned(d, today.id);
  expect((await getCallList(d)).map((r) => r.bookingId)).toEqual([tomorrow.id]);
  expect(
    (
      await pool.query(
        'SELECT actor, type FROM booking_events WHERE booking_id=$1 ORDER BY id DESC LIMIT 1',
        [today.id],
      )
    ).rows[0],
  ).toEqual({ actor: 'manager', type: 'warned' });
  clock.current = at('10:01');
  expect((await getCallList(d)).map((r) => r.bookingId)).toEqual([tomorrow.id]);
});

test('unmarkWarned clears warned_at, restores needs_call and records unwarned', async () => {
  const booking = await create('10:00');
  await db.update(bookings).set({ needsCall: 'changed' }).where(eq(bookings.id, booking.id));
  await markWarned(d, booking.id);
  const warned = (
    await pool.query('SELECT before FROM booking_events WHERE booking_id=$1 AND type=$2', [
      booking.id,
      'warned',
    ])
  ).rows[0];
  expect(warned.before).toEqual({ needsCall: 'changed' });

  await unmarkWarned(d, booking.id);
  const row = (
    await pool.query('SELECT warned_at, needs_call FROM bookings WHERE id=$1', [booking.id])
  ).rows[0];
  expect(row).toEqual({ warned_at: null, needs_call: 'changed' });
  expect(
    (
      await pool.query(
        'SELECT actor, type FROM booking_events WHERE booking_id=$1 ORDER BY id DESC LIMIT 1',
        [booking.id],
      )
    ).rows[0],
  ).toEqual({ actor: 'manager', type: 'unwarned' });
});

test('unmarkWarned does nothing without an active mark or booking', async () => {
  const booking = await create('10:00');
  const count = async () =>
    Number(
      (await pool.query('SELECT count(*) FROM booking_events WHERE booking_id=$1', [booking.id]))
        .rows[0].count,
    );
  const before = await count();
  await unmarkWarned(d, booking.id);
  await unmarkWarned(d, 999999999);
  expect(await count()).toBe(before);
  await markWarned(d, booking.id);
  await unmarkWarned(d, booking.id);
  await unmarkWarned(d, booking.id);
  expect(await count()).toBe(before + 2);
});

test('move resets warned_at and returns a due reminder', async () => {
  const booking = await create('10:00');
  await markWarned(d, booking.id);
  expect(
    (await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' })).ok,
  ).toBe(true);
  expect((await getCallList(d)).find((r) => r.bookingId === booking.id)?.reason).toBe('changed');
  await markWarned(d, booking.id);
  expect(
    (await moveBooking(d, { bookingId: booking.id, newStart: at('13:30'), actor: 'client_site' }))
      .ok,
  ).toBe(true);
  expect((await getCallList(d)).find((r) => r.bookingId === booking.id)?.reason).toBe('remind');
});

test('closure crossing occupied_until remains conflict after checkbox and clears on move', async () => {
  const booking = await create('10:00');
  await db.insert(closures).values({ masterId: 1, startsAt: at('11:05'), endsAt: at('11:30') });
  expect((await getCallList(d)).find((r) => r.bookingId === booking.id)?.reason).toBe('conflict');
  await markWarned(d, booking.id);
  expect((await getCallList(d)).find((r) => r.bookingId === booking.id)?.reason).toBe('conflict');
  expect(
    (await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' })).ok,
  ).toBe(true);
  expect((await getCallList(d)).find((r) => r.bookingId === booking.id)?.reason).toBe('changed');
});

test('shortened or missing hours create conflict; cancellation removes conflict but preserves changed', async () => {
  const first = await create('18:00');
  await db.update(workingHours).set({ closesAt: '18:30' }).where(eq(workingHours.masterId, 1));
  expect((await getCallList(d)).find((r) => r.bookingId === first.id)?.reason).toBe('conflict');
  await cancelBooking(d, { bookingId: first.id, actor: 'manager' });
  expect((await getCallList(d)).find((r) => r.bookingId === first.id)?.reason).toBe('changed');
  const second = await create('10:00', '2026-12-08', 'manager', 2);
  await db.delete(workingHours).where(eq(workingHours.masterId, 2));
  expect((await getCallList(d)).find((r) => r.bookingId === second.id)?.reason).toBe('conflict');
});

test('reason priority yields one row per booking sorted by start', async () => {
  const changed = await create('10:00');
  await moveBooking(d, { bookingId: changed.id, newStart: at('12:00'), actor: 'manager' });
  const conflict = await create('13:30');
  await db.insert(closures).values({ masterId: 1, startsAt: at('13:35'), endsAt: at('14:00') });
  const items = await getCallList(d);
  expect(items.map(({ bookingId, reason }) => ({ bookingId, reason }))).toEqual([
    { bookingId: changed.id, reason: 'changed' },
    { bookingId: conflict.id, reason: 'conflict' },
  ]);
});

test('summary counts booking source, change actors and calls left', async () => {
  clock.current = at('07:00');
  const self = await create('10:00', '2026-12-07', 'client_site');
  const manager = await create('12:00');
  await moveBooking(d, { bookingId: self.id, newStart: at('14:00'), actor: 'client_bot' });
  await cancelBooking(d, { bookingId: manager.id, actor: 'manager' });
  expect(await getSummary(d)).toEqual({
    bookingsSelf: 1,
    bookingsManager: 1,
    changesSelf: 1,
    changesManager: 1,
    callsLeft: 2,
  });
  expect((await db.select().from(bookings).where(eq(bookings.id, manager.id)))[0].status).toBe(
    'cancelled',
  );
});
