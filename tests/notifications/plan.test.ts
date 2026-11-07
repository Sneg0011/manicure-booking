import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { cancelBooking, createBooking, moveBooking } from '../../src/booking/service';
import type { CreatedBooking, Deps } from '../../src/booking/types';
import type { Db } from '../../src/db/client';
import { bookings, clientChats, notifications } from '../../src/db/schema';
import { createTestDb } from '../helpers/db';
import { at, BASE_NOW, deps, seedFixtures } from '../helpers/fixtures';

let db: Db, pool: Pool, close: () => Promise<void>, d: Deps;
let serial = 0;
beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
  await seedFixtures(db);
  d = deps(db, { current: BASE_NOW });
  serial = 0;
});
afterEach(async () => { if (close) await close(); });

async function create(actor: 'client_site' | 'manager' = 'client_site', time = '10:00', masterId = 1) {
  const result = await createBooking(d, { serviceId: 1, masterId, start: at(time), name: 'Клиент',
    phone: `+79001234${String(++serial).padStart(3, '0')}`, idempotencyKey: `plan-${serial}`, actor });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function rows(id: number) {
  return db.select().from(notifications).where(eq(notifications.bookingId, id));
}
function matrix(items: Awaited<ReturnType<typeof rows>>) {
  return items.map(({ recipient, channel, status, masterId }) => ({ recipient, channel, status, masterId }));
}

test('client booking writes screen, master Telegram and manager journal in one transaction', async () => {
  const booking = await create();
  expect(matrix(await rows(booking.id))).toEqual([
    { recipient: 'client', channel: 'screen', status: 'sent', masterId: null },
    { recipient: 'master', channel: 'telegram', status: 'pending', masterId: 1 },
    { recipient: 'manager', channel: 'journal', status: 'sent', masterId: null },
  ]);
});

test.each(['moved', 'cancelled'] as const)('client site %s writes client screen and master pending', async (kind) => {
  const booking = await create();
  const result = kind === 'moved'
    ? await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'client_site' })
    : await cancelBooking(d, { bookingId: booking.id, actor: 'client_site' });
  expect(result.ok).toBe(true);
  expect(matrix((await rows(booking.id)).slice(3))).toEqual([
    { recipient: 'client', channel: 'screen', status: 'sent', masterId: null },
    { recipient: 'master', channel: 'telegram', status: 'pending', masterId: 1 },
    { recipient: 'manager', channel: 'journal', status: 'sent', masterId: null },
  ]);
});

test('client bot move records Telegram sent and no pending client delivery', async () => {
  const booking = await create();
  expect((await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'client_bot' })).ok).toBe(true);
  expect(matrix((await rows(booking.id)).slice(3))).toMatchObject([
    { recipient: 'client', channel: 'telegram', status: 'sent' },
    { recipient: 'master', channel: 'telegram', status: 'pending' },
    { recipient: 'manager', channel: 'journal', status: 'sent' },
  ]);
});

test('manager creation leaves client journal instruction without needs_call', async () => {
  const booking = await create('manager');
  const list = await rows(booking.id);
  expect(matrix(list)).toMatchObject([
    { recipient: 'client', channel: 'journal', status: 'not_connected' },
    { recipient: 'master', channel: 'telegram', status: 'pending' },
    { recipient: 'manager', channel: 'journal', status: 'sent' },
  ]);
  expect(list[0].body).toMatch(/звон|менеджер/i);
  expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].needsCall).toBeNull();
});

test.each(['moved', 'cancelled'] as const)('manager %s without chat sets changed and not_connected', async (kind) => {
  const booking = await create('manager');
  const result = kind === 'moved'
    ? await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' })
    : await cancelBooking(d, { bookingId: booking.id, actor: 'manager' });
  expect(result.ok).toBe(true);
  expect(matrix((await rows(booking.id)).slice(3))).toMatchObject([
    { recipient: 'client', channel: 'telegram', status: 'not_connected' },
    { recipient: 'master', channel: 'telegram', status: 'pending' },
    { recipient: 'manager', channel: 'journal', status: 'sent' },
  ]);
  expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].needsCall).toBe('changed');
});

test('manager move with chat queues client message and both masters after reassignment', async () => {
  const booking = await create('manager');
  await db.insert(clientChats).values({ bookingId: booking.id, chatId: 'chat-1' });
  expect((await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), newMasterId: 2, actor: 'manager' })).ok).toBe(true);
  const planned = matrix((await rows(booking.id)).slice(3));
  expect(planned).toContainEqual({ recipient: 'client', channel: 'telegram', status: 'pending', masterId: null });
  expect(planned.filter((r) => r.recipient === 'master').map((r) => r.masterId).sort()).toEqual([1, 2]);
  expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].needsCall).toBeNull();
});

test('same slot move is a no-op; slot_taken rolls back notifications', async () => {
  const first = await create();
  const second = await create('client_site', '12:00');
  expect((await moveBooking(d, { bookingId: first.id, newStart: first.startsAt, actor: 'manager' })).ok).toBe(true);
  expect(await rows(first.id)).toHaveLength(3);
  const blocked = await moveBooking(d, { bookingId: second.id, newStart: at('10:00'), actor: 'manager' });
  expect(blocked).toMatchObject({ ok: false, error: 'slot_taken' });
  expect(await rows(second.id)).toHaveLength(3);
  expect((await db.select().from(bookings).where(eq(bookings.id, second.id)))[0].startsAt).toEqual(at('12:00'));
});
