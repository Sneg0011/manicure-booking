import { beforeEach, afterEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { at, BASE_NOW, deps, seedFixtures } from '../helpers/fixtures';
import { callback, message, testBot, texts, buttons } from '../helpers/telegram';
import { createBooking } from '../../src/booking/service';
import { bookingEvents, bookings, clientChats, settings } from '../../src/db/schema';
import type { CreatedBooking } from '../../src/booking/types';
import { resetDemo } from '../../src/demo/reset';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let d: ReturnType<typeof deps>;
let bot: ReturnType<typeof testBot>;
let key: number;
beforeEach(async () => { fixture = await createTestDb(); await seedFixtures(fixture.db); d = deps(fixture.db, { current: new Date(BASE_NOW) }); bot = testBot(d); key = 0; });
afterEach(async () => { if (fixture) await fixture.close(); });
async function create(start = at('10:00'), masterId = 1): Promise<CreatedBooking> {
  const result = await createBooking(d, { serviceId: 1, masterId, start, name: 'Клиент', phone: `+7900000${String(++key).padStart(4, '0')}`, idempotencyKey: `bot-${key}`, actor: 'client_site' });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test('/start binds one booking once, stores only IDs, /my opens a card', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  expect(texts(bot.calls).at(-1)).toContain('Маникюр');
  expect(texts(bot.calls).at(-1)).toContain('МСК');
  expect(buttons(bot.calls).map((b) => b.text)).toEqual(expect.arrayContaining(['Перенести', 'Отменить']));
  expect(await fixture.db.select().from(clientChats)).toMatchObject([{ chatId: '101', bookingId: booking.id }]);
  expect(Object.keys((await fixture.db.select().from(clientChats))[0])).not.toContain('username');
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].botCode).toBeNull();
  await message(bot.bot, 102, `/start ${booking.botCode}`);
  expect(texts(bot.calls).at(-1)).toBe('Ссылка не найдена или уже использована');
  await message(bot.bot, 101, '/my');
  expect(buttons(bot.calls).some((b) => b.callback_data === `card:${booking.id}`)).toBe(true);
  await callback(bot.bot, 101, `card:${booking.id}`);
  expect(texts(bot.calls).at(-1)).toContain('Маникюр');
  await message(bot.bot, 103, '/start');
  expect(texts(bot.calls).at(-1)).toContain('сайте');
});

test('move flow uses client_bot and cancellation requires confirmation', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await callback(bot.bot, 101, `mv:${booking.id}`);
  expect(buttons(bot.calls).some((b) => b.callback_data.startsWith(`md:${booking.id}:`))).toBe(true);
  await callback(bot.bot, 101, `md:${booking.id}:20261207`);
  expect(buttons(bot.calls).some((b) => b.callback_data === `mt:${booking.id}:202612071200`)).toBe(true);
  await callback(bot.bot, 101, `mt:${booking.id}:202612071200`);
  expect(buttons(bot.calls).some((b) => b.callback_data === `mc:${booking.id}:202612071200`)).toBe(true);
  await callback(bot.bot, 101, `mc:${booking.id}:202612071200`);
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt).toEqual(at('12:00'));
  expect((await fixture.db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, booking.id))).at(-1)).toMatchObject({ actor: 'client_bot', type: 'moved' });
  await callback(bot.bot, 101, `cx:${booking.id}`);
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].status).toBe('active');
  await callback(bot.bot, 101, `cy:${booking.id}`);
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].status).toBe('cancelled');
  expect(bot.calls.filter((c) => c.method === 'answerCallbackQuery')).toHaveLength(6);
});

test('cancelled booking still opens from /my as a card without action buttons', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await callback(bot.bot, 101, `cy:${booking.id}`);
  const before = bot.calls.length;
  await callback(bot.bot, 101, `card:${booking.id}`);
  const after = bot.calls.slice(before);
  expect(texts(after)).toHaveLength(1);
  expect(texts(after)[0]).toContain('Отменена');
  expect(buttons(after)).toEqual([]);
});

test('foreign, inactive, reset and malformed buttons never change a booking', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await callback(bot.bot, 102, `card:${booking.id}`);
  expect(bot.calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', payload: { text: 'Запись уже изменена или недоступна' } });
  await callback(bot.bot, 101, 'mv:abc');
  await callback(bot.bot, 101, 'mc:1:99999999999999');
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt).toEqual(at('10:00'));
  await callback(bot.bot, 101, `cy:${booking.id}`);
  await callback(bot.bot, 101, `mv:${booking.id}`);
  expect(bot.calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', payload: { text: 'Запись уже изменена или недоступна' } });
  await resetDemo(d);
  await callback(bot.bot, 101, `card:${booking.id}`);
  expect(bot.calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', payload: { text: 'Запись уже изменена или недоступна' } });
});

test('move_limit and too_late tell client to call, callback data fits Telegram', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await fixture.db.update(settings).set({ maxClientMoves: 0 }).where(eq(settings.id, 1));
  await callback(bot.bot, 101, `mc:${booking.id}:202612071200`);
  expect(texts(bot.calls).at(-1)).toContain('Позвоните в студию');
  await fixture.db.update(settings).set({ maxClientMoves: 3 }).where(eq(settings.id, 1));
  d.now = () => at('09:00');
  await callback(bot.bot, 101, `cy:${booking.id}`);
  expect(texts(bot.calls).at(-1)).toContain('Позвоните в студию');
  expect(buttons(bot.calls).every((b) => Buffer.byteLength(b.callback_data, 'utf8') <= 64)).toBe(true);
});

test('stale move buttons show alternatives or return to dates', async () => {
  const booking = await create();
  await create(at('12:00'));
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await callback(bot.bot, 101, `mc:${booking.id}:202612071200`);
  expect(texts(bot.calls).at(-1)).toBe('Это время только что заняли');
  expect(buttons(bot.calls).some((b) => b.callback_data.startsWith(`mt:${booking.id}:`))).toBe(true);
  await callback(bot.bot, 101, `mc:${booking.id}:202612061200`);
  expect(texts(bot.calls).at(-1)).toBe('Это время уже недоступно');
  expect(buttons(bot.calls).at(-1)?.callback_data).toBe(`mv:${booking.id}`);
  await callback(bot.bot, 101, `mc:${booking.id}:202701151200`);
  expect(texts(bot.calls).at(-1)).toBe('Это время уже недоступно');
  expect((await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt).toEqual(at('10:00'));
});
