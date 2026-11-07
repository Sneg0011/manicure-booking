import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { getAvailability } from '../../src/booking/availability';
import {
  cancelBooking,
  createBooking,
  getBookingByToken,
  moveBooking,
  setVisitResult,
} from '../../src/booking/service';
import { getRules, MANAGER_STEP_MIN } from '../../src/booking/rules';
import type { Db } from '../../src/db/client';
import { closures, masterServices, masters, services } from '../../src/db/schema';
import { formatStudioTime } from '../../src/lib/time';
import type { BookingError, CreatedBooking, Deps, Result } from '../../src/booking/types';
import { createTestDb } from '../helpers/db';
import { at, BASE_NOW, BOOKING_DAY, deps, seedFixtures, type Clock } from '../helpers/fixtures';

let db: Db;
let pool: Pool;
let close: () => Promise<void>;
let clock: Clock;
let d: Deps;
let key = 0;

beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
  await seedFixtures(db);
  clock = { current: new Date(BASE_NOW) };
  d = deps(db, clock);
  key = 0;
});
afterEach(async () => {
  if (close) await close();
});

function create(start = at('10:00'), overrides: Partial<Parameters<typeof createBooking>[1]> = {}) {
  return createBooking(d, {
    serviceId: 1,
    masterId: 1,
    start,
    name: 'Анна',
    phone: '+7 900 123 45 67',
    idempotencyKey: `request-${++key}`,
    actor: 'client_site',
    ...overrides,
  });
}

async function created(
  start = at('10:00'),
  overrides: Partial<Parameters<typeof createBooking>[1]> = {},
): Promise<CreatedBooking> {
  const result = await create(start, overrides);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(`createBooking failed: ${result.error}`);
  return result.value;
}

function failed<T>(
  result: Result<T>,
  error: BookingError,
): asserts result is {
  ok: false;
  error: BookingError;
  alternatives?: { start: Date; masterId: number }[];
} {
  expect(result).toMatchObject({ ok: false, error });
  if (result.ok) throw new Error(`expected ${error}`);
}

async function state() {
  const [bookings, events, clients] = await Promise.all([
    pool.query('SELECT * FROM bookings ORDER BY id'),
    pool.query('SELECT * FROM booking_events ORDER BY id'),
    pool.query('SELECT * FROM clients ORDER BY id'),
  ]);
  return { bookings: bookings.rows, events: events.rows, clients: clients.rows };
}

async function unchanged<T>(request: () => Promise<Result<T>>, error: BookingError) {
  const before = await state();
  const result = await request();
  failed(result, error);
  expect(await state()).toEqual(before);
  return result;
}

function slotTimes(slots: { start: Date }[]) {
  return slots.map((slot) => formatStudioTime(slot.start));
}

test('fixture rules, hours and a single result expose real dates', async () => {
  expect(await getRules(d)).toEqual({
    slotStepMin: 30,
    minLeadMin: 60,
    horizonDays: 30,
    changeCutoffMin: 120,
    maxClientMoves: 3,
  });
  expect(MANAGER_STEP_MIN).toBe(5);
  const booking = await created();
  expect(booking).toMatchObject({
    status: 'active',
    masterId: 1,
    masterName: 'Анна',
    serviceId: 1,
    serviceName: 'Маникюр',
    priceRub: 1000,
    clientName: 'Анна',
    clientPhone: '+79001234567',
    moveCount: 0,
    source: 'site',
  });
  expect(booking.startsAt).toEqual(at('10:00'));
  expect(booking.endsAt).toEqual(at('11:00'));
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.bookings[0]).toMatchObject({
    status: 'active',
    source: 'site',
    price_rub: 1000,
    move_count: 0,
  });
  expect(snapshot.bookings[0].ends_at).toEqual(at('11:00'));
  expect(snapshot.bookings[0].occupied_until).toEqual(at('11:15'));
  expect(snapshot.clients).toMatchObject([{ name: 'Анна', phone: '+79001234567' }]);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0]).toMatchObject({
    booking_id: booking.id,
    actor: 'client_site',
    type: 'created',
  });
});

test('master duration and price overrides are fixed in the booking', async () => {
  const booking = await created(at('10:00'), { masterId: 2 });
  expect(booking).toMatchObject({ masterId: 2, priceRub: 1300 });
  expect(booking.endsAt).toEqual(at('11:15'));
  const snapshot = await state();
  expect(snapshot.bookings[0]).toMatchObject({ master_id: 2, price_rub: 1300 });
  expect(snapshot.bookings[0].occupied_until).toEqual(at('11:30'));
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('client lead time, horizon, Sunday, grid, hours and closure are enforced', async () => {
  clock.current = at('09:30');
  const soon = await unchanged(() => create(at('10:00')), 'too_soon');
  expect(soon.alternatives?.map((s) => s.start)).toEqual([at('10:30'), at('11:00'), at('11:30')]);
  clock.current = new Date(BASE_NOW);
  const far = await unchanged(() => create(at('10:00', '2027-01-01')), 'too_far');
  expect(far.alternatives).toBeDefined();
  expect(far.alternatives!.length).toBeLessThanOrEqual(3);
  for (const start of [at('10:00', '2026-12-13'), at('09:30'), at('21:30'), at('10:05')]) {
    await unchanged(() => create(start), 'outside_schedule');
  }
  await db
    .insert(closures)
    .values({ masterId: 1, startsAt: at('12:00'), endsAt: at('13:00'), reason: 'Перерыв' });
  await unchanged(() => create(at('12:00')), 'outside_schedule');
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(0);
  expect(snapshot.events).toHaveLength(0);
  expect(snapshot.clients).toHaveLength(0);
});

test('stale time in the past returns too_soon and three current alternatives', async () => {
  clock.current = at('12:10');
  const result = await unchanged(() => create(at('10:00')), 'too_soon');
  expect(result.alternatives).toHaveLength(3);
  expect(slotTimes(result.alternatives!)).toEqual(['13:30', '14:00', '14:30']);
});

test('manager uses five-minute steps inside hours, without client lead or horizon', async () => {
  clock.current = at('09:59');
  expect((await created(at('10:05'), { actor: 'manager' })).source).toBe('manager');
  const far = await created(at('10:05', '2027-02-01'), { actor: 'manager' });
  expect(far.startsAt).toEqual(at('10:05', '2027-02-01'));
  clock.current = at('11:00');
  await unchanged(() => create(at('10:00'), { actor: 'manager', masterId: 2 }), 'too_soon');
  await unchanged(
    () => create(at('09:55', '2026-12-08'), { actor: 'manager' }),
    'outside_schedule',
  );
  await unchanged(
    () => create(at('21:05', '2026-12-08'), { actor: 'manager', serviceId: 2 }),
    'outside_schedule',
  );
  await unchanged(
    () => create(at('10:01', '2026-12-08'), { actor: 'manager' }),
    'outside_schedule',
  );
  await unchanged(
    () => create(at('10:00', '2026-12-13'), { actor: 'manager' }),
    'outside_schedule',
  );
  await db
    .insert(closures)
    .values({
      masterId: 2,
      startsAt: at('14:00', '2026-12-08'),
      endsAt: at('15:00', '2026-12-08'),
    });
  await unchanged(
    () => create(at('14:05', '2026-12-08'), { actor: 'manager', masterId: 2 }),
    'outside_schedule',
  );
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(2);
  expect(snapshot.events.map((event) => event.actor)).toEqual(['manager', 'manager']);
  expect(snapshot.clients).toHaveLength(1);
});

test('manager overlap still returns slot_taken and alternatives', async () => {
  await created(at('10:00'), { actor: 'manager' });
  const result = await unchanged(() => create(at('10:30'), { actor: 'manager' }), 'slot_taken');
  expect(result.alternatives).toBeDefined();
  expect(result.alternatives!.length).toBeGreaterThan(0);
  expect(result.alternatives!.length).toBeLessThanOrEqual(3);
});

test('slot_taken alternatives continue on the next day when today has no room', async () => {
  await created(at('10:00'));
  await db.insert(closures).values({ masterId: 1, startsAt: at('11:15'), endsAt: at('22:00') });
  const result = await unchanged(() => create(at('10:00')), 'slot_taken');
  expect(result.alternatives).toEqual([
    { start: at('10:00', '2026-12-08'), masterId: 1 },
    { start: at('10:30', '2026-12-08'), masterId: 1 },
    { start: at('11:00', '2026-12-08'), masterId: 1 },
  ]);
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('any master picks the less loaded, then the free second, then reports taken', async () => {
  const first = await created(at('10:00'), { masterId: null });
  expect(first.masterId).toBe(1);
  const second = await created(at('10:00'), { masterId: null, phone: '9001234568' });
  expect(second.masterId).toBe(2);
  const taken = await unchanged(
    () => create(at('10:00'), { masterId: null, phone: '9001234569' }),
    'slot_taken',
  );
  expect(taken.alternatives).toBeDefined();
  expect(taken.alternatives!.length).toBeGreaterThan(0);
  expect(taken.alternatives!.length).toBeLessThanOrEqual(3);
  const snapshot = await state();
  expect(snapshot.bookings.map((row) => row.master_id)).toEqual([1, 2]);
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.clients).toHaveLength(2);
});

test('any master uses daily load before id, availability has unique starts', async () => {
  const initial = await getAvailability(d, { serviceId: 1, masterId: null, date: BOOKING_DAY });
  expect(initial.find((slot) => slot.start.getTime() === at('10:00').getTime())).toMatchObject({
    masterId: 1,
  });
  await created(at('16:00'), { masterId: 1 });
  const slots = await getAvailability(d, { serviceId: 1, masterId: null, date: BOOKING_DAY });
  expect(slots.find((slot) => slot.start.getTime() === at('10:00').getTime())).toMatchObject({
    masterId: 2,
  });
  expect(new Set(slots.map((slot) => slot.start.getTime())).size).toBe(slots.length);
  const booking = await created(at('10:00'), { masterId: null, phone: '9001234568' });
  expect(booking.masterId).toBe(2);
  expect((await state()).bookings).toHaveLength(2);
});

test('unknown, hidden and unassigned catalog entries return not_found', async () => {
  await unchanged(() => create(at('10:00'), { serviceId: 999 }), 'not_found');
  await unchanged(() => create(at('10:00'), { masterId: 999 }), 'not_found');
  await db.update(services).set({ isActive: false }).where(eq(services.id, 1));
  await unchanged(() => create(), 'not_found');
  expect(await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY })).toEqual([]);
  await db.update(services).set({ isActive: true }).where(eq(services.id, 1));
  await db.update(masters).set({ isActive: false }).where(eq(masters.id, 1));
  await unchanged(() => create(), 'not_found');
  await db.update(masters).set({ isActive: true }).where(eq(masters.id, 1));
  await db.delete(masterServices).where(eq(masterServices.masterId, 1));
  await unchanged(() => create(), 'not_found');
  expect(await state()).toMatchObject({ bookings: [], events: [], clients: [] });
});

test('idempotency retry returns the same booking and tokens without extra rows', async () => {
  const input = { idempotencyKey: 'same-request' };
  const first = await created(at('10:00'), input);
  const second = await created(at('10:00'), input);
  expect(second).toEqual(first);
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
  expect(snapshot.events).toHaveLength(1);
});

test('two parallel idempotent calls return the same booking and one set of rows', async () => {
  const results = await Promise.all([
    create(at('10:00'), { idempotencyKey: 'parallel' }),
    create(at('10:00'), { idempotencyKey: 'parallel' }),
  ]);
  expect(results[0]).toMatchObject({ ok: true });
  expect(results[1]).toEqual(results[0]);
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
  expect(snapshot.events).toHaveLength(1);
});

test('phone variants identify one client and the latest trimmed name wins', async () => {
  await created(at('10:00'), { phone: '8 (900) 123-45-67', name: '  Анна  ' });
  await created(at('12:00'), { phone: '+7 900 123 45 67', name: 'Мария' });
  await created(at('14:00'), { phone: '9001234567', name: '  Ольга  ' });
  const snapshot = await state();
  expect(snapshot.clients).toMatchObject([{ name: 'Ольга', phone: '+79001234567' }]);
  expect(snapshot.bookings).toHaveLength(3);
  expect(new Set(snapshot.bookings.map((row) => row.client_id)).size).toBe(1);
  expect(snapshot.events).toHaveLength(3);
});

test('invalid phone and name do not insert a client or event; HTML and emoji remain text', async () => {
  for (const phone of ['abc', '123'])
    await unchanged(() => create(at('10:00'), { phone }), 'invalid_phone');
  for (const name of [' ', 'А', 'А'.repeat(61)])
    await unchanged(() => create(at('10:00'), { name }), 'invalid_name');
  const booking = await created(at('10:00'), { name: '<b>Анна</b> 💅' });
  expect(booking.clientName).toBe('<b>Анна</b> 💅');
  const snapshot = await state();
  expect(snapshot.clients[0].name).toBe('<b>Анна</b> 💅');
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.events).toHaveLength(1);
});

test('tokens have the requested entropy and token lookup omits secrets', async () => {
  const booking = await created();
  expect(booking.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(booking.botCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(Buffer.from(booking.manageToken, 'base64url')).toHaveLength(32);
  expect(Buffer.from(booking.botCode, 'base64url')).toHaveLength(16);
  const view = await getBookingByToken(d, booking.manageToken);
  expect(view).toMatchObject({ id: booking.id, clientPhone: '+79001234567' });
  expect(view).not.toHaveProperty('manageToken');
  expect(view).not.toHaveProperty('botCode');
  expect(await getBookingByToken(d, 'invalid-token')).toBeNull();
  const snapshot = await state();
  expect(snapshot.bookings[0]).toMatchObject({
    manage_token: booking.manageToken,
    bot_code: booking.botCode,
  });
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('availability removes occupied intervals and closures immediately; Sunday is empty', async () => {
  const before = await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY });
  expect(slotTimes(before)).toContain('10:00');
  await created(at('10:00'));
  const occupied = await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY });
  expect(slotTimes(occupied)).not.toContain('10:00');
  expect(slotTimes(occupied)).not.toContain('10:30');
  expect(slotTimes(occupied)).toContain('11:30');
  await db.insert(closures).values({ masterId: 1, startsAt: at('13:00'), endsAt: at('14:00') });
  const closed = await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY });
  expect(slotTimes(closed)).not.toContain('12:00');
  expect(slotTimes(closed)).not.toContain('13:00');
  expect(await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-13' })).toEqual([]);
  expect((await state()).bookings).toHaveLength(1);
});

test('availability respects second master 75-minute duration', async () => {
  const booking = await created(at('12:00'), { masterId: 2 });
  expect(booking.endsAt).toEqual(at('13:15'));
  const slots = await getAvailability(d, { serviceId: 1, masterId: 2, date: BOOKING_DAY });
  expect(slotTimes(slots)).toContain('10:30');
  expect(slotTimes(slots)).not.toContain('11:00');
  expect(slotTimes(slots)).not.toContain('13:00');
  expect(slotTimes(slots)).toContain('13:30');
  expect((await state()).bookings[0].occupied_until).toEqual(at('13:30'));
});

test('move changes time, master, count, warning and event before/after', async () => {
  const booking = await created();
  await pool.query('UPDATE bookings SET warned_at = $1 WHERE id = $2', [at('09:00'), booking.id]);
  const result = await moveBooking(d, {
    bookingId: booking.id,
    newStart: at('12:00'),
    newMasterId: 2,
    actor: 'client_bot',
  });
  expect(result).toMatchObject({
    ok: true,
    value: { id: booking.id, masterId: 2, moveCount: 1, priceRub: 1300 },
  });
  if (!result.ok) throw new Error(result.error);
  expect(result.value.startsAt).toEqual(at('12:00'));
  expect(result.value.endsAt).toEqual(at('13:15'));
  const snapshot = await state();
  expect(snapshot.bookings[0]).toMatchObject({
    master_id: 2,
    move_count: 1,
    price_rub: 1300,
    warned_at: null,
  });
  expect(snapshot.bookings[0].occupied_until).toEqual(at('13:30'));
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.events[1]).toMatchObject({
    type: 'moved',
    actor: 'client_bot',
    before: { startsAt: at('10:00').toISOString(), masterId: 1 },
    after: { startsAt: at('12:00').toISOString(), masterId: 2 },
  });
  expect(snapshot.clients).toHaveLength(1);
  const slots1 = await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY });
  const slots2 = await getAvailability(d, { serviceId: 1, masterId: 2, date: BOOKING_DAY });
  expect(slotTimes(slots1)).toContain('10:00');
  expect(slotTimes(slots2)).not.toContain('12:00');
});

test('same time and master move is idempotent', async () => {
  const booking = await created();
  const result = await moveBooking(d, {
    bookingId: booking.id,
    newStart: at('10:00'),
    newMasterId: 1,
    actor: 'client_site',
  });
  expect(result).toMatchObject({ ok: true, value: { id: booking.id, moveCount: 0 } });
  const snapshot = await state();
  expect(snapshot.bookings[0]).toMatchObject({
    starts_at: at('10:00'),
    master_id: 1,
    move_count: 0,
  });
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('occupied new time leaves the old booking and its availability unchanged', async () => {
  const booking = await created(at('10:00'));
  await created(at('12:00'), { phone: '9001234568' });
  const slotsBefore = await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY });
  const result = await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'client_site' }),
    'slot_taken',
  );
  expect(result.alternatives).toBeDefined();
  expect(result.alternatives!.length).toBeGreaterThan(0);
  expect(result.alternatives!.length).toBeLessThanOrEqual(3);
  expect(await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY })).toEqual(
    slotsBefore,
  );
  expect(slotTimes(slotsBefore)).not.toContain('10:00');
  const snapshot = await state();
  expect(snapshot.bookings[0].starts_at).toEqual(at('10:00'));
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.clients).toHaveLength(2);
});

test('client move validates new lead, horizon, schedule, grid and closure', async () => {
  const booking = await created(at('16:00'));
  clock.current = at('10:10');
  const soon = await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('10:30'), actor: 'client_site' }),
    'too_soon',
  );
  expect(soon.alternatives).toBeDefined();
  clock.current = new Date(BASE_NOW);
  const far = await unchanged(
    () =>
      moveBooking(d, {
        bookingId: booking.id,
        newStart: at('10:00', '2027-01-01'),
        actor: 'client_site',
      }),
    'too_far',
  );
  expect(far.alternatives).toBeDefined();
  for (const newStart of [at('10:00', '2026-12-13'), at('09:30'), at('10:05')]) {
    await unchanged(
      () => moveBooking(d, { bookingId: booking.id, newStart, actor: 'client_bot' }),
      'outside_schedule',
    );
  }
  await db.insert(closures).values({ masterId: 1, startsAt: at('14:00'), endsAt: at('15:00') });
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('14:00'), actor: 'client_site' }),
    'outside_schedule',
  );
  const snapshot = await state();
  expect(snapshot.bookings[0].starts_at).toEqual(at('16:00'));
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('fourth client move is blocked; manager move ignores limit and does not increment', async () => {
  const booking = await created();
  for (const time of ['12:00', '14:00', '16:00']) {
    expect(
      await moveBooking(d, { bookingId: booking.id, newStart: at(time), actor: 'client_site' }),
    ).toMatchObject({ ok: true });
  }
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('18:00'), actor: 'client_site' }),
    'move_limit',
  );
  const result = await moveBooking(d, {
    bookingId: booking.id,
    newStart: at('18:05'),
    actor: 'manager',
  });
  expect(result).toMatchObject({ ok: true, value: { id: booking.id, moveCount: 3 } });
  const snapshot = await state();
  expect(snapshot.bookings[0]).toMatchObject({ starts_at: at('18:05'), move_count: 3 });
  expect(snapshot.events).toHaveLength(5);
  expect(snapshot.events[4]).toMatchObject({ actor: 'manager', type: 'moved' });
  expect(snapshot.clients).toHaveLength(1);
});

test('119 minutes before the visit blocks client move and cancel; manager can do both', async () => {
  const booking = await created();
  clock.current = at('08:01');
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'client_site' }),
    'too_late',
  );
  await unchanged(
    () => cancelBooking(d, { bookingId: booking.id, actor: 'client_bot' }),
    'too_late',
  );
  const moved = await moveBooking(d, {
    bookingId: booking.id,
    newStart: at('12:05'),
    actor: 'manager',
  });
  expect(moved).toMatchObject({ ok: true, value: { moveCount: 0 } });
  const cancelled = await cancelBooking(d, {
    bookingId: booking.id,
    actor: 'manager',
    reason: 'Клиент позвонил',
  });
  expect(cancelled).toMatchObject({ ok: true, value: { status: 'cancelled' } });
  const snapshot = await state();
  expect(snapshot.bookings).toMatchObject([{ status: 'cancelled', move_count: 0 }]);
  expect(snapshot.events.map((event) => event.actor)).toEqual([
    'client_site',
    'manager',
    'manager',
  ]);
  expect(snapshot.clients).toHaveLength(1);
});

test('manager move uses manager time rules and cannot overlap', async () => {
  const booking = await created(at('10:00'));
  await created(at('12:00'), { phone: '9001234568' });
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('09:55'), actor: 'manager' }),
    'outside_schedule',
  );
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('10:01'), actor: 'manager' }),
    'outside_schedule',
  );
  await unchanged(
    () => moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' }),
    'slot_taken',
  );
  const snapshot = await state();
  expect(snapshot.bookings[0].starts_at).toEqual(at('10:00'));
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.clients).toHaveLength(2);
});

test('cancel preserves row, records reason and frees time immediately', async () => {
  const booking = await created();
  const result = await cancelBooking(d, {
    bookingId: booking.id,
    actor: 'client_bot',
    reason: 'Передумала',
  });
  expect(result).toMatchObject({ ok: true, value: { id: booking.id, status: 'cancelled' } });
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.bookings[0].status).toBe('cancelled');
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.events[1]).toMatchObject({
    booking_id: booking.id,
    type: 'cancelled',
    actor: 'client_bot',
    after: { reason: 'Передумала' },
  });
  expect(snapshot.clients).toHaveLength(1);
  expect(
    slotTimes(await getAvailability(d, { serviceId: 1, masterId: 1, date: BOOKING_DAY })),
  ).toContain('10:00');
});

test('repeat cancel and moves of cancelled or completed bookings return not_active', async () => {
  const cancelled = await created();
  await cancelBooking(d, { bookingId: cancelled.id, actor: 'manager' });
  await unchanged(
    () => cancelBooking(d, { bookingId: cancelled.id, actor: 'manager' }),
    'not_active',
  );
  await unchanged(
    () => moveBooking(d, { bookingId: cancelled.id, newStart: at('12:00'), actor: 'manager' }),
    'not_active',
  );
  const completed = await created(at('14:00'));
  clock.current = at('14:01');
  const done = await setVisitResult(d, { bookingId: completed.id, result: 'attended' });
  expect(done).toMatchObject({ ok: true });
  await unchanged(
    () => moveBooking(d, { bookingId: completed.id, newStart: at('16:00'), actor: 'manager' }),
    'not_active',
  );
  const snapshot = await state();
  expect(snapshot.bookings.map((row) => row.status)).toEqual(['cancelled', 'attended']);
  expect(snapshot.events).toHaveLength(4);
  expect(snapshot.clients).toHaveLength(1);
});

test('unknown booking id returns not_found without side effects', async () => {
  await unchanged(
    () => moveBooking(d, { bookingId: 999, newStart: at('12:00'), actor: 'manager' }),
    'not_found',
  );
  await unchanged(() => cancelBooking(d, { bookingId: 999, actor: 'manager' }), 'not_found');
  await unchanged(() => setVisitResult(d, { bookingId: 999, result: 'attended' }), 'not_found');
  expect(await state()).toMatchObject({ bookings: [], events: [], clients: [] });
});

test('visit result requires start, can be corrected, and records manager events', async () => {
  const booking = await created();
  await unchanged(
    () => setVisitResult(d, { bookingId: booking.id, result: 'attended' }),
    'too_soon',
  );
  clock.current = at('10:00');
  expect(await setVisitResult(d, { bookingId: booking.id, result: 'attended' })).toMatchObject({
    ok: true,
    value: { status: 'attended' },
  });
  expect(await setVisitResult(d, { bookingId: booking.id, result: 'no_show' })).toMatchObject({
    ok: true,
    value: { status: 'no_show' },
  });
  const snapshot = await state();
  expect(snapshot.bookings).toMatchObject([{ status: 'no_show' }]);
  expect(snapshot.events).toHaveLength(3);
  expect(snapshot.events.slice(1)).toMatchObject([
    {
      actor: 'manager',
      type: 'visit_result',
      before: { status: 'active' },
      after: { status: 'attended' },
    },
    {
      actor: 'manager',
      type: 'visit_result',
      before: { status: 'attended' },
      after: { status: 'no_show' },
    },
  ]);
  expect(snapshot.clients).toHaveLength(1);
});

test('cancelled booking cannot get a visit result', async () => {
  const booking = await created();
  await cancelBooking(d, { bookingId: booking.id, actor: 'manager' });
  clock.current = at('10:00');
  await unchanged(
    () => setVisitResult(d, { bookingId: booking.id, result: 'no_show' }),
    'not_active',
  );
  const snapshot = await state();
  expect(snapshot.bookings[0].status).toBe('cancelled');
  expect(snapshot.events).toHaveLength(2);
  expect(snapshot.clients).toHaveLength(1);
});

test('20 concurrent creates on one master yield one success and 19 slot_taken', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      create(at('10:00'), { phone: `900123${String(4500 + i).padStart(4, '0')}` }),
    ),
  );
  const successes = results.filter((result) => result.ok);
  const rejected = results.filter((result) => !result.ok);
  expect(successes).toHaveLength(1);
  expect(rejected).toHaveLength(19);
  for (const result of rejected) {
    failed(result, 'slot_taken');
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives!.length).toBeGreaterThan(0);
    expect(result.alternatives!.length).toBeLessThanOrEqual(3);
  }
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.bookings[0].status).toBe('active');
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('parallel 90+15 at 10:00 and 60+15 at 10:30 cannot overlap', async () => {
  const results = await Promise.all([
    create(at('10:00'), { serviceId: 2 }),
    create(at('10:30'), { serviceId: 1, phone: '9001234568' }),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  const loser = results.find((result) => !result.ok);
  expect(loser).toBeDefined();
  failed(loser!, 'slot_taken');
  expect(loser!.alternatives).toBeDefined();
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(1);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.clients).toHaveLength(1);
});

test('two parallel moves to one target have one winner and preserve loser location', async () => {
  const first = await created(at('10:00'));
  const second = await created(at('12:00'), { phone: '9001234568' });
  const results = await Promise.all([
    moveBooking(d, { bookingId: first.id, newStart: at('16:00'), actor: 'client_site' }),
    moveBooking(d, { bookingId: second.id, newStart: at('16:00'), actor: 'client_bot' }),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  const loser = results.find((result) => !result.ok);
  expect(loser).toBeDefined();
  failed(loser!, 'slot_taken');
  expect(loser!.alternatives).toBeDefined();
  const snapshot = await state();
  expect(snapshot.bookings).toHaveLength(2);
  expect(
    snapshot.bookings.filter((row) => row.starts_at.getTime() === at('16:00').getTime()),
  ).toHaveLength(1);
  expect(snapshot.bookings.find((row) => row.id === first.id)!.starts_at).toEqual(
    results[0].ok ? at('16:00') : at('10:00'),
  );
  expect(snapshot.bookings.find((row) => row.id === second.id)!.starts_at).toEqual(
    results[1].ok ? at('16:00') : at('12:00'),
  );
  expect(snapshot.events).toHaveLength(3);
  expect(snapshot.clients).toHaveLength(2);
});
