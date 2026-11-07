import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import type { Deps } from '../booking/types';
import { bookings, clients, masters, services } from '../db/schema';
import { formatStudioDate, formatStudioTime, fromStudioTime } from '../lib/time';
import { nextStudioDate } from '../booking/rules';
import { dateText } from '../site/format';
import type { BotEnv } from './index';

function secretMatches(input: string, secret?: string): boolean {
  if (!input || !secret) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
const keyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: 'Сегодня', callback_data: 'today' },
        { text: 'Завтра', callback_data: 'tomorrow' },
      ],
    ],
  },
};

async function schedule(ctx: Context, deps: Deps, tomorrow: boolean, edit: boolean): Promise<void> {
  if (!ctx.chat) return;
  const [master] = await deps.db
    .select({ id: masters.id })
    .from(masters)
    .where(eq(masters.telegramChatId, String(ctx.chat.id)))
    .limit(1);
  if (!master) {
    if (edit) await ctx.editMessageText('Эта команда только для мастеров');
    else await ctx.reply('Эта команда только для мастеров');
    return;
  }
  const date = tomorrow
    ? nextStudioDate(formatStudioDate(deps.now()))
    : formatStudioDate(deps.now());
  const rows = await deps.db
    .select({ startsAt: bookings.startsAt, clientName: clients.name, serviceName: services.name })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.masterId, master.id),
        eq(bookings.status, 'active'),
        gte(bookings.startsAt, fromStudioTime(date, '00:00')),
        lt(bookings.startsAt, fromStudioTime(nextStudioDate(date), '00:00')),
      ),
    )
    .orderBy(bookings.startsAt);
  const text = `${tomorrow ? 'Завтра' : 'Сегодня'}, ${dateText(date)} МСК\n${
    rows.length
      ? rows
          .map((row) => `${formatStudioTime(row.startsAt)} — ${row.clientName}, ${row.serviceName}`)
          .join('\n')
      : 'Записей нет'
  }`;
  if (edit) await ctx.editMessageText(text, keyboard);
  else await ctx.reply(text, keyboard);
}

export function registerMaster(bot: Bot, deps: Deps, env: BotEnv): void {
  bot.command('start', async (ctx, next) => {
    const code = ctx.match.trim();
    if (!code.startsWith('master_')) return next();
    const secret = code.slice('master_'.length);
    const id = secretMatches(secret, env.MASTER_1_INVITE)
      ? 1
      : secretMatches(secret, env.MASTER_2_INVITE)
        ? 2
        : null;
    if (!id) {
      await ctx.reply('Ссылка не найдена или уже использована');
      return;
    }
    const [master] = await deps.db
      .update(masters)
      .set({ telegramChatId: String(ctx.chat.id) })
      .where(eq(masters.id, id))
      .returning({ name: masters.name });
    if (!master) {
      await ctx.reply('Ссылка не найдена или уже использована');
      return;
    }
    await ctx.reply(`Вы подключены как мастер ${master.name}`, keyboard);
  });
  bot.command('today', async (ctx) => schedule(ctx, deps, false, false));
  bot.command('tomorrow', async (ctx) => schedule(ctx, deps, true, false));
}

export async function handleMasterCallback(ctx: Context, deps: Deps): Promise<void> {
  await schedule(ctx, deps, ctx.callbackQuery?.data === 'tomorrow', true);
}
