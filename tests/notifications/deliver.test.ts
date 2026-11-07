import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { createBooking, moveBooking } from '../../src/booking/service';
import type { Deps } from '../../src/booking/types';
import type { Db } from '../../src/db/client';
import { bookings, clientChats, masters, notifications } from '../../src/db/schema';
import { deliverPending } from '../../src/notifications/deliver';
import type { MessageSender } from '../../src/notifications/sender';
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

async function create(name = 'Клиент <b>x</b>') {
  const result = await createBooking(d, { serviceId: 1, masterId: 1, start: at('10:00'), name,
    phone: '+79001234567', idempotencyKey: `deliver-${++serial}`, actor: 'manager' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function fake(failChat?: string): MessageSender & { calls: { chatId: string; text: string; buttons: unknown }[] } {
  const calls: { chatId: string; text: string; buttons: unknown }[] = [];
  return { calls, async send(chatId, text, buttons) {
    calls.push({ chatId, text, buttons });
    if (chatId === failChat) throw new Error('send failed');
  } };
}
async function rows() { return db.select().from(notifications); }

test('master without chat is not_connected', async () => {
  await create();
  const sender = fake();
  await deliverPending(d, sender);
  expect(sender.calls).toHaveLength(0);
  expect((await rows()).find((r) => r.recipient === 'master')?.status).toBe('not_connected');
});

test('master text contains name, service, studio date and time, but no phone or parse mode', async () => {
  await db.update(masters).set({ telegramChatId: 'master-1' }).where(eq(masters.id, 1));
  await create();
  const sender = fake();
  await deliverPending(d, sender);
  expect(sender.calls).toHaveLength(1);
  expect(sender.calls[0].text).toContain('Клиент <b>x</b>');
  expect(sender.calls[0].text).toContain('Маникюр');
  expect(sender.calls[0].text).toContain('07.12.2026');
  expect(sender.calls[0].text).toContain('10:00');
  expect(sender.calls[0].text).not.toContain('+79001234567');
  expect(sender.calls[0].buttons).toBeUndefined();
  expect((await rows()).find((r) => r.recipient === 'master')).toMatchObject({ status: 'sent', error: null });
  expect((await rows()).find((r) => r.recipient === 'master')?.sentAt).toBeInstanceOf(Date);
});

test('manager move sends to every booking chat, then repeat delivery sends nothing', async () => {
  const booking = await create();
  await db.insert(clientChats).values([{ bookingId: booking.id, chatId: 'client-a' }, { bookingId: booking.id, chatId: 'client-b' }]);
  await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' });
  const sender = fake();
  await deliverPending(d, sender);
  expect(sender.calls.map((c) => c.chatId).sort()).toEqual(['client-a', 'client-b']);
  await deliverPending(d, sender);
  expect(sender.calls).toHaveLength(2);
  expect((await rows()).find((r) => r.recipient === 'client' && r.channel === 'telegram')?.status).toBe('sent');
  expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].needsCall).toBeNull();
});

test('failed client send persists failed row, active booking and changed call flag; other rows continue', async () => {
  await db.update(masters).set({ telegramChatId: 'master-1' }).where(eq(masters.id, 1));
  const booking = await create();
  await db.insert(clientChats).values({ bookingId: booking.id, chatId: 'client-a' });
  await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' });
  const sender = fake('client-a');
  await deliverPending(d, sender);
  const row = (await rows()).find((r) => r.recipient === 'client' && r.channel === 'telegram');
  expect(row).toMatchObject({ status: 'failed', error: 'send failed' });
  expect((await db.select().from(bookings).where(eq(bookings.id, booking.id)))[0]).toMatchObject({ status: 'active', needsCall: 'changed' });
  expect((await rows()).filter((r) => r.recipient === 'master' && r.status === 'sent')).toHaveLength(2);
});

test('one failed client chat does not block the other chat', async () => {
  const booking = await create();
  await db.insert(clientChats).values([{ bookingId: booking.id, chatId: 'client-a' }, { bookingId: booking.id, chatId: 'client-b' }]);
  await moveBooking(d, { bookingId: booking.id, newStart: at('12:00'), actor: 'manager' });
  const sender = fake('client-a');
  await deliverPending(d, sender);
  expect(sender.calls.map((c) => c.chatId).sort()).toEqual(['client-a', 'client-b']);
  expect((await rows()).find((r) => r.recipient === 'client' && r.channel === 'telegram')?.status).toBe('failed');
});

test('31st master message in a studio day is suppressed', async () => {
  await db.update(masters).set({ telegramChatId: 'master-1' }).where(eq(masters.id, 1));
  await create();
  await db.insert(notifications).values(Array.from({ length: 30 }, () => ({ recipient: 'master' as const, masterId: 1,
    channel: 'telegram' as const, status: 'sent' as const, body: 'prior', sentAt: BASE_NOW })));
  const sender = fake();
  await deliverPending(d, sender);
  expect(sender.calls).toHaveLength(0);
  expect((await rows()).find((r) => r.recipient === 'master' && r.status === 'suppressed')).toBeDefined();
});

test('parallel delivery claims pending notification once', async () => {
  await db.update(masters).set({ telegramChatId: 'master-1' }).where(eq(masters.id, 1));
  await create();
  const sender = fake();
  await Promise.all([deliverPending(d, sender), deliverPending(d, sender)]);
  expect(sender.calls).toHaveLength(1);
});
