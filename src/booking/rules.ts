import { and, eq, lt, gt } from 'drizzle-orm';
import { TZDate } from '@date-fns/tz';
import { closures, masterServices, masters, services, settings, workingHours } from '../db/schema';
import { formatStudioDate, fromStudioTime, STUDIO_TZ, studioWeekday } from '../lib/time';
import type { BookingError, BookingRules, Deps } from './types';

export const MANAGER_STEP_MIN = 5;

export async function getRules(deps: Deps): Promise<BookingRules> {
  const [row] = await deps.db.select().from(settings).where(eq(settings.id, 1));
  if (!row)
    return {
      slotStepMin: 30,
      minLeadMin: 60,
      horizonDays: 30,
      changeCutoffMin: 120,
      maxClientMoves: 3,
    };
  return {
    slotStepMin: row.slotStepMin,
    minLeadMin: row.minLeadMin,
    horizonDays: row.horizonDays,
    changeCutoffMin: row.changeCutoffMin,
    maxClientMoves: row.maxClientMoves,
  };
}

export async function getCandidates(deps: Deps, serviceId: number, masterId: number | null) {
  return deps.db
    .select({ master: masters, service: services, assignment: masterServices })
    .from(masterServices)
    .innerJoin(masters, eq(masters.id, masterServices.masterId))
    .innerJoin(services, eq(services.id, masterServices.serviceId))
    .where(
      and(
        eq(masterServices.serviceId, serviceId),
        eq(services.isActive, true),
        eq(masters.isActive, true),
        ...(masterId === null ? [] : [eq(masters.id, masterId)]),
      ),
    );
}

export type Candidate = Awaited<ReturnType<typeof getCandidates>>[number];

export function serviceValues(candidate: Candidate) {
  return {
    durationMin: candidate.assignment.durationMin ?? candidate.service.durationMin,
    bufferMin: candidate.service.bufferMin,
    priceRub: candidate.assignment.priceRub ?? candidate.service.priceRub,
  };
}

export function nextStudioDate(date: string): string {
  const day = new TZDate(fromStudioTime(date, '12:00').getTime(), STUDIO_TZ);
  day.setDate(day.getDate() + 1);
  return formatStudioDate(day);
}

export function horizonDate(now: Date, days: number): string {
  const day = new TZDate(now.getTime(), STUDIO_TZ);
  day.setDate(day.getDate() + days);
  return formatStudioDate(day);
}

export async function checkTime(
  deps: Deps,
  input: {
    start: Date;
    masterId: number;
    durationMin: number;
    bufferMin: number;
    actor: 'client' | 'manager';
    rules: BookingRules;
  },
): Promise<BookingError | null> {
  const { start, masterId, durationMin, bufferMin, actor, rules } = input;
  const now = deps.now();
  if (start.getTime() < now.getTime() + (actor === 'manager' ? 0 : rules.minLeadMin * 60_000))
    return 'too_soon';
  const date = formatStudioDate(start);
  if (actor !== 'manager' && date > horizonDate(now, rules.horizonDays)) return 'too_far';
  const [hours] = await deps.db
    .select()
    .from(workingHours)
    .where(
      and(eq(workingHours.masterId, masterId), eq(workingHours.weekday, studioWeekday(start))),
    );
  if (!hours) return 'outside_schedule';
  const opens = fromStudioTime(date, hours.opensAt).getTime();
  const closes = fromStudioTime(date, hours.closesAt).getTime();
  const step = (actor === 'manager' ? MANAGER_STEP_MIN : rules.slotStepMin) * 60_000;
  const time = start.getTime();
  if (time < opens || (time - opens) % step !== 0 || time + durationMin * 60_000 > closes)
    return 'outside_schedule';
  const occupiedUntil = new Date(time + (durationMin + bufferMin) * 60_000);
  const closed = await deps.db
    .select({ id: closures.id })
    .from(closures)
    .where(
      and(
        eq(closures.masterId, masterId),
        lt(closures.startsAt, occupiedUntil),
        gt(closures.endsAt, start),
      ),
    )
    .limit(1);
  return closed.length ? 'outside_schedule' : null;
}
