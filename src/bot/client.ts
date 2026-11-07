import { and, eq } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { getAvailability } from '../booking/availability';
import { cancelBooking, moveBooking } from '../booking/service';
import { getRules, nextStudioDate } from '../booking/rules';
import type { BookingView, Deps, Slot } from '../booking/types';
import { bookings, clientChats, masters, services } from '../db/schema';
import { formatStudioDate, formatStudioTime, fromStudioTime } from '../lib/time';
import { dateText, slotText } from '../site/format';

type Buttons = { text: string; callback_data: string }[][];
const unavailable = 'Запись уже изменена или недоступна';
const statusText = {
  active: 'Активна',
  cancelled: 'Отменена',
  attended: 'Завершена',
  no_show: 'Неявка',
};
const button = (text: string, callback_data: string) => ({ text, callback_data });
const keyboard = (inline_keyboard: Buttons) => ({ reply_markup: { inline_keyboard } });

async function view(deps: Deps, id: number, chatId: string): Promise<BookingView | null> {
  const [row] = await deps.db
    .select({ booking: bookings, master: masters, service: services })
    .from(clientChats)
    .innerJoin(bookings, eq(bookings.id, clientChats.bookingId))
    .innerJoin(masters, eq(masters.id, bookings.masterId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(and(eq(clientChats.chatId, chatId), eq(clientChats.bookingId, id)))
    .limit(1);
  if (!row) return null;
  const { booking, master, service } = row;
  return {
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    masterId: booking.masterId,
    masterName: master.name,
    serviceId: booking.serviceId,
    serviceName: service.name,
    priceRub: booking.priceRub,
    clientName: '',
    clientPhone: null,
    moveCount: booking.moveCount,
    source: booking.source,
  };
}
function card(v: BookingView): { text: string; buttons: Buttons } {
  return {
    text: `Запись №${v.id}\n${v.serviceName}\nМастер: ${v.masterName}\n${slotText(v.startsAt)}\nЦена: ${v.priceRub} ₽\nСтатус: ${statusText[v.status]}`,
    buttons:
      v.status === 'active'
        ? [[button('Перенести', `mv:${v.id}`), button('Отменить', `cx:${v.id}`)]]
        : [],
  };
}
async function edit(ctx: Context, text: string, buttons: Buttons = []): Promise<void> {
  await ctx.editMessageText(text, keyboard(buttons));
}
function dateFromCompact(raw: string): string | null {
  if (!/^\d{8}$/.test(raw)) return null;
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return formatStudioDate(fromStudioTime(date, '12:00')) === date ? date : null;
}
function instant(raw: string): Date | null {
  const date = dateFromCompact(raw.slice(0, 8));
  if (!date || !/^\d{12}$/.test(raw)) return null;
  const hh = Number(raw.slice(8, 10));
  const mm = Number(raw.slice(10, 12));
  if (hh > 23 || mm > 59) return null;
  const time = `${raw.slice(8, 10)}:${raw.slice(10, 12)}`;
  const start = fromStudioTime(date, time);
  return formatStudioDate(start) === date && formatStudioTime(start) === time ? start : null;
}
function slotButton(id: number, slot: Slot) {
  const raw = `${formatStudioDate(slot.start).replaceAll('-', '')}${formatStudioTime(slot.start).replace(':', '')}`;
  return button(formatStudioTime(slot.start), `mt:${id}:${raw}`);
}
async function dates(ctx: Context, deps: Deps, v: BookingView): Promise<void> {
  let date = formatStudioDate(deps.now());
  const rows: Buttons = [];
  for (let day = 0; day < 7; day++, date = nextStudioDate(date)) {
    if (
      (await getAvailability(deps, { serviceId: v.serviceId, masterId: v.masterId, date })).length
    )
      rows.push([button(dateText(date), `md:${v.id}:${date.replaceAll('-', '')}`)]);
  }
  rows.push([button('Назад', `card:${v.id}`)]);
  await edit(ctx, 'Выберите дату', rows);
}
async function times(ctx: Context, deps: Deps, v: BookingView, date: string): Promise<void> {
  const slots = await getAvailability(deps, { serviceId: v.serviceId, masterId: v.masterId, date });
  const rows: Buttons = [];
  for (let i = 0; i < slots.length; i += 4)
    rows.push(slots.slice(i, i + 4).map((s) => slotButton(v.id, s)));
  rows.push([button('Назад', `mv:${v.id}`)]);
  await edit(
    ctx,
    slots.length ? `${dateText(date)}, МСК — выберите время` : 'Свободного времени нет',
    rows,
  );
}

export function registerClient(bot: Bot, deps: Deps): void {
  bot.command('start', async (ctx, next) => {
    const code = ctx.match.trim();
    if (code.startsWith('master_')) return next();
    if (!code) {
      await ctx.reply('Записаться можно на сайте студии.');
      return;
    }
    const [row] = await deps.db
      .update(bookings)
      .set({ botCode: null })
      .where(eq(bookings.botCode, code))
      .returning({ id: bookings.id });
    if (!row) {
      await ctx.reply('Ссылка не найдена или уже использована');
      return;
    }
    await deps.db
      .insert(clientChats)
      .values({ chatId: String(ctx.chat.id), bookingId: row.id })
      .onConflictDoNothing();
    const v = await view(deps, row.id, String(ctx.chat.id));
    if (!v) {
      await ctx.reply(unavailable);
      return;
    }
    const shown = card(v);
    await ctx.reply(shown.text, keyboard(shown.buttons));
  });
  bot.command('my', async (ctx) => {
    const rows = await deps.db
      .select({ id: clientChats.bookingId, startsAt: bookings.startsAt })
      .from(clientChats)
      .innerJoin(bookings, eq(bookings.id, clientChats.bookingId))
      .where(eq(clientChats.chatId, String(ctx.chat.id)))
      .orderBy(bookings.startsAt);
    if (!rows.length) {
      await ctx.reply('У вас пока нет подключённых записей.');
      return;
    }
    await ctx.reply(
      'Ваши записи',
      keyboard(rows.map((row) => [button(slotText(row.startsAt), `card:${row.id}`)])),
    );
  });
}

export async function handleClientCallback(ctx: Context, deps: Deps): Promise<string | undefined> {
  const data = ctx.callbackQuery?.data ?? '';
  const match = /^(card|mv|md|mt|mc|cx|cy):(\d+)(?::(\d+))?$/.exec(data);
  if (!match) return unavailable;
  const [, action, idRaw, payload] = match;
  const id = Number(idRaw);
  if (!Number.isSafeInteger(id) || id < 1 || !ctx.chat) return unavailable;
  const v = await view(deps, id, String(ctx.chat.id));
  if (!v) return unavailable;
  if (action === 'card') {
    const shown = card(v);
    await edit(ctx, shown.text, shown.buttons);
    return;
  }
  if (v.status !== 'active') return unavailable;
  if (action === 'mv') {
    const rules = await getRules(deps);
    if (
      v.moveCount >= rules.maxClientMoves ||
      deps.now().getTime() > v.startsAt.getTime() - rules.changeCutoffMin * 60_000
    ) {
      await edit(ctx, 'Позвоните в студию');
      return;
    }
    await dates(ctx, deps, v);
    return;
  }
  if (action === 'md') {
    const date = payload && dateFromCompact(payload);
    if (!date) return unavailable;
    await times(ctx, deps, v, date);
    return;
  }
  if (action === 'mt' || action === 'mc') {
    const start = payload && instant(payload);
    if (!start) return unavailable;
    if (action === 'mt') {
      await edit(ctx, `Перенести запись на ${slotText(start)}?`, [
        [button('Подтвердить', `mc:${id}:${payload}`)],
        [button('Назад', `md:${id}:${payload!.slice(0, 8)}`)],
      ]);
      return;
    }
    const result = await moveBooking(deps, { bookingId: id, newStart: start, actor: 'client_bot' });
    if (result.ok) {
      const shown = card(result.value);
      await edit(ctx, shown.text, shown.buttons);
      return;
    }
    if (result.error === 'not_active' || result.error === 'not_found') return unavailable;
    if (result.error === 'too_late' || result.error === 'move_limit') {
      await edit(ctx, 'Позвоните в студию');
      return;
    }
    if (result.error === 'slot_taken') {
      const alternatives = (result.alternatives ?? []).map((slot) => slotButton(id, slot));
      await edit(
        ctx,
        'Это время только что заняли',
        alternatives.length ? [alternatives] : [[button('Выбрать дату', `mv:${id}`)]],
      );
      return;
    }
    await edit(ctx, 'Это время уже недоступно', [[button('Выбрать дату', `mv:${id}`)]]);
    return;
  }
  if (action === 'cx') {
    await edit(ctx, 'Отменить запись?', [
      [button('Да, отменить', `cy:${id}`)],
      [button('Назад', `card:${id}`)],
    ]);
    return;
  }
  const result = await cancelBooking(deps, { bookingId: id, actor: 'client_bot' });
  if (result.ok) {
    const shown = card(result.value);
    await edit(ctx, shown.text);
    return;
  }
  if (result.error === 'too_late') {
    await edit(ctx, 'Позвоните в студию');
    return;
  }
  return unavailable;
}
