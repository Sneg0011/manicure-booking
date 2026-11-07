'use server';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { checkLogin, BAD_LOGIN } from '../../auth/login';
import {
  clearManagerCookie,
  createSession,
  managerAction,
  setManagerCookie,
} from '../../auth/session';
import { getDeps } from '../../lib/deps';
import { fromStudioTime } from '../../lib/time';
import { createBooking, moveBooking, cancelBooking, setVisitResult } from '../../booking/service';
import { markWarned } from '../../booking/call-list';
import { bookings } from '../../db/schema';
import { deliverPending } from '../../notifications/deliver';
import { getSenderFromEnv } from '../../bot/sender';
import type { BookingError } from '../../booking/types';

const messages: Record<BookingError, string> = {
  slot_taken: 'Это время уже занято',
  outside_schedule: 'Это время вне расписания',
  too_soon: 'Время уже прошло',
  too_far: 'Дата слишком далеко',
  too_late: 'Время изменения прошло',
  move_limit: 'Лимит переносов исчерпан',
  not_active: 'Запись уже изменена',
  not_found: 'Запись не найдена',
  invalid_name: 'Укажите имя от 2 до 60 символов',
  invalid_phone: 'Укажите телефон в правильном формате',
};

function target(form: FormData): string {
  const date = String(form.get('date') ?? '');
  const view = form.get('view') === 'week' ? 'week' : 'day';
  const booking = Number(form.get('bookingId'));
  const params = new URLSearchParams();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) params.set('date', date);
  params.set('view', view);
  if (Number.isSafeInteger(booking) && booking > 0) params.set('booking', String(booking));
  return `/admin/calendar?${params}`;
}

function finish(form: FormData, error?: BookingError | 'invalid_time'): never {
  revalidatePath('/admin/calendar');
  const url = new URL(target(form), 'http://localhost');
  if (error)
    url.searchParams.set(
      'error',
      error === 'invalid_time' ? 'Неверные дата или время' : messages[error],
    );
  redirect(`${url.pathname}${url.search}`);
}

function start(form: FormData): Date | null {
  const date = String(form.get('newDate') ?? '');
  const time = String(form.get('time') ?? '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    Number(time.slice(3)) % 5 !== 0
  )
    return null;
  const value = fromStudioTime(date, time);
  return Number.isNaN(value.getTime()) ? null : value;
}

function positive(value: FormDataEntryValue | null): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function notify(): void {
  after(() => deliverPending(getDeps(), getSenderFromEnv()));
}

export async function loginAction(form: FormData): Promise<void> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const result = await checkLogin(
    getDeps(),
    ip,
    String(form.get('login') ?? ''),
    String(form.get('password') ?? ''),
  );
  if (!result.ok) redirect(`/admin/login?error=${encodeURIComponent(result.error)}`);
  try {
    await setManagerCookie(await createSession(process.env.SESSION_SECRET));
  } catch {
    redirect(`/admin/login?error=${encodeURIComponent(BAD_LOGIN)}`);
  }
  redirect('/admin/calendar');
}

const guardedLogout = managerAction(async () => {
  await clearManagerCookie();
  redirect('/admin/login');
});
export async function logoutAction(): Promise<void> {
  return guardedLogout();
}

const guardedCreate = managerAction(async (form: FormData) => {
  const serviceId = positive(form.get('serviceId'));
  const masterId = positive(form.get('masterId'));
  const when = start(form);
  if (!serviceId || !masterId || !when) finish(form, 'invalid_time');
  const result = await createBooking(getDeps(), {
    serviceId,
    masterId,
    start: when,
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    idempotencyKey: String(form.get('idempotencyKey') ?? '') || randomUUID(),
    actor: 'manager',
  });
  if (!result.ok) finish(form, result.error);
  notify();
  const next = new FormData();
  next.set('date', String(form.get('newDate')));
  next.set('bookingId', String(result.value.id));
  finish(next);
});
export async function createAdminBookingAction(form: FormData): Promise<void> {
  return guardedCreate(form);
}

const guardedMove = managerAction(async (form: FormData) => {
  const id = positive(form.get('bookingId'));
  const masterId = positive(form.get('masterId'));
  const when = start(form);
  if (!id || !masterId || !when) finish(form, 'invalid_time');
  const result = await moveBooking(getDeps(), {
    bookingId: id,
    newStart: when,
    newMasterId: masterId,
    actor: 'manager',
  });
  if (!result.ok) finish(form, result.error);
  notify();
  finish(form);
});
export async function moveAdminBookingAction(form: FormData): Promise<void> {
  return guardedMove(form);
}

const guardedCancel = managerAction(async (form: FormData) => {
  const id = positive(form.get('bookingId'));
  if (!id) finish(form, 'not_found');
  const result = await cancelBooking(getDeps(), {
    bookingId: id,
    actor: 'manager',
    reason: String(form.get('reason') ?? '').trim(),
  });
  if (!result.ok) finish(form, result.error);
  notify();
  finish(form);
});
export async function cancelAdminBookingAction(form: FormData): Promise<void> {
  return guardedCancel(form);
}

const guardedVisit = managerAction(async (form: FormData) => {
  const id = positive(form.get('bookingId'));
  const result = form.get('result');
  if (!id || (result !== 'attended' && result !== 'no_show')) finish(form, 'not_found');
  const changed = await setVisitResult(getDeps(), { bookingId: id, result });
  if (!changed.ok) finish(form, changed.error);
  notify();
  finish(form);
});
export async function setAdminVisitAction(form: FormData): Promise<void> {
  return guardedVisit(form);
}

const guardedWarn = managerAction(async (form: FormData) => {
  const id = positive(form.get('bookingId'));
  if (!id) finish(form, 'not_found');
  const [row] = await getDeps()
    .db.select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  if (!row) finish(form, 'not_found');
  await markWarned(getDeps(), id);
  notify();
  if (form.get('returnTo') === 'calls') {
    revalidatePath('/admin/calls');
    redirect('/admin/calls');
  }
  finish(form);
});
export async function markAdminWarnedAction(form: FormData): Promise<void> {
  return guardedWarn(form);
}
