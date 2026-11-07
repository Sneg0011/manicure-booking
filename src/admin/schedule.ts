import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import type { BookingRules, Deps } from '../booking/types';
import { getRules as readRules } from '../booking/rules';
import { bookings, closures, masters, settings, workingHours } from '../db/schema';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export async function getSchedule(deps: Deps) {
  const [masterRows, hours, closureRows] = await Promise.all([
    deps.db
      .select({ id: masters.id, name: masters.name })
      .from(masters)
      .orderBy(asc(masters.sort), asc(masters.id)),
    deps.db.select().from(workingHours),
    deps.db
      .select({
        id: closures.id,
        masterId: closures.masterId,
        masterName: masters.name,
        startsAt: closures.startsAt,
        endsAt: closures.endsAt,
        reason: closures.reason,
      })
      .from(closures)
      .innerJoin(masters, eq(closures.masterId, masters.id))
      .where(gt(closures.endsAt, deps.now()))
      .orderBy(asc(closures.startsAt)),
  ]);
  return { masters: masterRows, hours, closures: closureRows };
}

export async function setWorkingHours(
  deps: Deps,
  masterId: number,
  weekday: number,
  value: { opens: string; closes: string } | null,
): Promise<Result<null>> {
  if (!validId(masterId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    return fail('Неверный мастер или день недели');
  if (value && (!validTime(value.opens) || !validTime(value.closes) || value.closes <= value.opens))
    return fail('Укажите время в формате ЧЧ:ММ; закрытие должно быть позже открытия');
  const [master] = await deps.db
    .select({ id: masters.id })
    .from(masters)
    .where(eq(masters.id, masterId));
  if (!master) return fail('Мастер не найден');
  if (value)
    await deps.db
      .insert(workingHours)
      .values({ masterId, weekday, opensAt: value.opens, closesAt: value.closes })
      .onConflictDoUpdate({
        target: [workingHours.masterId, workingHours.weekday],
        set: { opensAt: value.opens, closesAt: value.closes },
      });
  else
    await deps.db
      .delete(workingHours)
      .where(and(eq(workingHours.masterId, masterId), eq(workingHours.weekday, weekday)));
  return { ok: true, value: null };
}

export async function addClosure(
  deps: Deps,
  input: { masterId: number; startsAt: Date; endsAt: Date; reason: string },
): Promise<Result<{ id: number; conflicts: number }>> {
  if (
    !validId(input.masterId) ||
    !Number.isFinite(input.startsAt?.getTime()) ||
    !Number.isFinite(input.endsAt?.getTime()) ||
    input.endsAt <= input.startsAt
  )
    return fail('Конец закрытия должен быть позже начала');
  const [master] = await deps.db
    .select({ id: masters.id })
    .from(masters)
    .where(eq(masters.id, input.masterId));
  if (!master) return fail('Мастер не найден');
  const [row] = await deps.db
    .insert(closures)
    .values({
      masterId: input.masterId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason.trim() || null,
    })
    .returning({ id: closures.id });
  const [count] = await deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.masterId, input.masterId),
        eq(bookings.status, 'active'),
        lt(bookings.startsAt, input.endsAt),
        gt(bookings.occupiedUntil, input.startsAt),
      ),
    );
  return { ok: true, value: { id: row.id, conflicts: count.count } };
}

export async function removeClosure(deps: Deps, id: number): Promise<Result<null>> {
  if (!validId(id)) return fail('Закрытие не найдено');
  const rows = await deps.db
    .delete(closures)
    .where(eq(closures.id, id))
    .returning({ id: closures.id });
  return rows.length ? { ok: true, value: null } : fail('Закрытие не найдено');
}

export const getRules = readRules;
export async function setRules(deps: Deps, value: BookingRules): Promise<Result<BookingRules>> {
  const ranges: [keyof BookingRules, number, number, string][] = [
    ['minLeadMin', 0, 1440, 'Запас до записи'],
    ['horizonDays', 1, 180, 'Горизонт записи'],
    ['changeCutoffMin', 0, 10080, 'Срок изменений'],
    ['maxClientMoves', 0, 20, 'Лимит переносов'],
  ];
  if (![15, 30, 60].includes(value.slotStepMin)) return fail('Шаг слотов: 15, 30 или 60 минут');
  for (const [key, min, max, label] of ranges)
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)
      return fail(`${label}: от ${min} до ${max}`);
  await deps.db
    .insert(settings)
    .values({ id: 1, ...value })
    .onConflictDoUpdate({ target: settings.id, set: value });
  return { ok: true, value };
}
