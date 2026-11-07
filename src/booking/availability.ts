import { and, eq, gte, lt, gt } from 'drizzle-orm';
import { bookings, closures, workingHours } from '../db/schema';
import { computeDaySlots } from './slots';
import { fromStudioTime, studioWeekday } from '../lib/time';
import { getCandidates, getRules, nextStudioDate, serviceValues } from './rules';
import type { Deps, Slot } from './types';

export async function getAvailability(
  deps: Deps,
  input: { serviceId: number; masterId: number | null; date: string },
): Promise<Slot[]> {
  const [candidates, rules] = await Promise.all([
    getCandidates(deps, input.serviceId, input.masterId),
    getRules(deps),
  ]);
  if (!candidates.length) return [];
  const dayStart = fromStudioTime(input.date, '00:00');
  const dayEnd = fromStudioTime(nextStudioDate(input.date), '00:00');
  const perMaster = await Promise.all(
    candidates.map(async (candidate) => {
      const masterId = candidate.master.id;
      const [hours] = await deps.db
        .select()
        .from(workingHours)
        .where(
          and(
            eq(workingHours.masterId, masterId),
            eq(workingHours.weekday, studioWeekday(dayStart)),
          ),
        );
      const [active, closed] = await Promise.all([
        deps.db
          .select({ start: bookings.startsAt, end: bookings.occupiedUntil })
          .from(bookings)
          .where(
            and(
              eq(bookings.masterId, masterId),
              eq(bookings.status, 'active'),
              lt(bookings.startsAt, dayEnd),
              gt(bookings.occupiedUntil, dayStart),
            ),
          ),
        deps.db
          .select({ start: closures.startsAt, end: closures.endsAt })
          .from(closures)
          .where(
            and(
              eq(closures.masterId, masterId),
              lt(closures.startsAt, dayEnd),
              gt(closures.endsAt, dayStart),
            ),
          ),
      ]);
      const load = await deps.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.masterId, masterId),
            eq(bookings.status, 'active'),
            gte(bookings.startsAt, dayStart),
            lt(bookings.startsAt, dayEnd),
          ),
        );
      const { durationMin, bufferMin } = serviceValues(candidate);
      return {
        masterId,
        load: load.length,
        slots: computeDaySlots({
          date: input.date,
          hours: hours ? { opens: hours.opensAt, closes: hours.closesAt } : null,
          durationMin,
          bufferMin,
          busy: [...active, ...closed],
          stepMin: rules.slotStepMin,
          now: deps.now(),
          minLeadMin: rules.minLeadMin,
          horizonDays: rules.horizonDays,
        }),
      };
    }),
  );
  const chosen = new Map<number, { start: Date; masterId: number; load: number }>();
  for (const { masterId, load, slots } of perMaster)
    for (const start of slots) {
      const time = start.getTime();
      const previous = chosen.get(time);
      if (
        !previous ||
        load < previous.load ||
        (load === previous.load && masterId < previous.masterId)
      )
        chosen.set(time, { start, masterId, load });
    }
  return [...chosen.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ start, masterId }) => ({ start, masterId }));
}
