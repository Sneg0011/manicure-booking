import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { at, deps, seedFixtures } from '../helpers/fixtures';
import { botEnv, message, testBot } from '../helpers/telegram';
import { createBooking } from '../../src/booking/service';
import { handleTelegramWebhook } from '../../src/bot/webhook';
import { createTelegramSender, sanitizeTelegramError } from '../../src/bot/sender';
import { bookings, notifications } from '../../src/db/schema';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let d: ReturnType<typeof deps>;
let bot: ReturnType<typeof testBot>;
beforeEach(async () => {
  fixture = await createTestDb();
  await seedFixtures(fixture.db);
  d = deps(fixture.db, { current: at('09:00') });
  bot = testBot(d);
});
afterEach(async () => {
  if (fixture) await fixture.close();
});
function request(data: string, secret?: string): Request {
  return new Request('http://localhost/api/telegram', {
    method: 'POST',
    headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {},
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1000000),
      callback_query: {
        id: 'webhook-q',
        from: { id: 101, is_bot: false, first_name: 'A' },
        message: { message_id: 1, date: 0, chat: { id: 101, type: 'private' } },
        chat_instance: 'x',
        data,
      },
    }),
  });
}
async function create() {
  const result = await createBooking(d, {
    serviceId: 1,
    masterId: 1,
    start: at('12:00'),
    name: 'Клиент',
    phone: '+79000000001',
    idempotencyKey: 'webhook-booking',
    actor: 'client_site',
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test('secret header gates updates and successful move delivers a master notification', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await message(bot.bot, 301, '/start master_invite-one');
  const sender = createTelegramSender(bot.bot.api);
  const env = { ...botEnv, TELEGRAM_WEBHOOK_SECRET: 'webhook-secret' };
  expect(
    (await handleTelegramWebhook(request(`mc:${booking.id}:202612071400`), d, env, bot.bot, sender))
      .status,
  ).toBe(401);
  expect(
    (
      await handleTelegramWebhook(
        request(`mc:${booking.id}:202612071400`, 'wrong'),
        d,
        env,
        bot.bot,
        sender,
      )
    ).status,
  ).toBe(401);
  expect(
    (await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt,
  ).toEqual(at('12:00'));
  expect(
    (
      await handleTelegramWebhook(
        request(`mc:${booking.id}:202612071400`, 'webhook-secret'),
        d,
        env,
        bot.bot,
        sender,
      )
    ).status,
  ).toBe(200);
  expect(
    (await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt,
  ).toEqual(at('14:00'));
  expect(
    bot.calls.some(
      (call) =>
        call.method === 'sendMessage' &&
        call.payload.chat_id === '301' &&
        String(call.payload.text).includes('перенесена'),
    ),
  ).toBe(true);
});

test('sender failure does not roll back move and masks token in notification error', async () => {
  const booking = await create();
  await message(bot.bot, 101, `/start ${booking.botCode}`);
  await message(bot.bot, 301, '/start master_invite-one');
  const sender = {
    send: async () => {
      throw new Error('request /bot123:SECRET/sendMessage failed');
    },
  };
  const env = { ...botEnv, TELEGRAM_WEBHOOK_SECRET: 'webhook-secret' };
  expect(
    (
      await handleTelegramWebhook(
        request(`mc:${booking.id}:202612071400`, 'webhook-secret'),
        d,
        env,
        bot.bot,
        sender,
      )
    ).status,
  ).toBe(200);
  expect(
    (await fixture.db.select().from(bookings).where(eq(bookings.id, booking.id)))[0].startsAt,
  ).toEqual(at('14:00'));
  const failed = await fixture.db
    .select()
    .from(notifications)
    .where(eq(notifications.status, 'failed'));
  expect(failed.length).toBeGreaterThan(0);
  expect(failed.every((row) => !row.error?.includes('SECRET'))).toBe(true);
});

test('missing configured secret rejects update and sender strips token from API errors', async () => {
  const sender = createTelegramSender(bot.bot.api);
  expect(
    (await handleTelegramWebhook(request('today', 'anything'), d, botEnv, bot.bot, sender)).status,
  ).toBe(401);
  bot.bot.api.config.use(async () => {
    throw new Error('failed at /bot123:SECRET/sendMessage');
  });
  await expect(sender.send('301', 'Test')).rejects.toThrow('bot***');
  await expect(sender.send('301', 'Test')).rejects.not.toThrow('SECRET');
  expect(sanitizeTelegramError(new Error('/bot123:ABC and 123:SECRET'), '123:SECRET')).toBe(
    '/bot*** and bot***',
  );
});
