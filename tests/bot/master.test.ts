import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { at, deps, seedFixtures } from '../helpers/fixtures';
import { callback, message, testBot, texts } from '../helpers/telegram';
import { createBooking } from '../../src/booking/service';
import { masters } from '../../src/db/schema';

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
async function create(masterId: number, date = '2026-12-07') {
  const result = await createBooking(d, {
    serviceId: 1,
    masterId,
    start: at('12:00', date),
    name: `Клиент ${masterId}`,
    phone: `+7900000000${masterId}`,
    idempotencyKey: `${masterId}-${date}`,
    actor: 'client_site',
  });
  if (!result.ok) throw new Error(result.error);
}

test('master invitation is exact, private and independent for both masters', async () => {
  await message(bot.bot, 301, '/start master_wrong');
  expect(texts(bot.calls).at(-1)).toBe('Ссылка не найдена или уже использована');
  await message(bot.bot, 301, '/today');
  expect(texts(bot.calls).at(-1)).toBe('Эта команда только для мастеров');
  await message(bot.bot, 301, '/start master_invite-one');
  expect(texts(bot.calls).at(-1)).toContain('Вы подключены как мастер Анна');
  await message(bot.bot, 302, '/start master_invite-two');
  expect(texts(bot.calls).at(-1)).toContain('Вы подключены как мастер Мария');
  expect((await fixture.db.select().from(masters).where(eq(masters.id, 1)))[0].telegramChatId).toBe(
    '301',
  );
  expect((await fixture.db.select().from(masters).where(eq(masters.id, 2)))[0].telegramChatId).toBe(
    '302',
  );
});

test('today and tomorrow show only own active bookings, without phones or edit buttons', async () => {
  await create(1);
  await create(2);
  await create(1, '2026-12-08');
  await message(bot.bot, 301, '/start master_invite-one');
  await message(bot.bot, 302, '/start master_invite-two');
  await message(bot.bot, 301, '/today');
  expect(texts(bot.calls).at(-1)).toContain('Клиент 1');
  expect(texts(bot.calls).at(-1)).not.toContain('Клиент 2');
  expect(texts(bot.calls).at(-1)).not.toContain('+7900');
  expect(texts(bot.calls).at(-1)).toContain('МСК');
  await callback(bot.bot, 301, 'tomorrow');
  expect(texts(bot.calls).at(-1)).toContain('Клиент 1');
  await message(bot.bot, 303, '/tomorrow');
  expect(texts(bot.calls).at(-1)).toBe('Эта команда только для мастеров');
});
