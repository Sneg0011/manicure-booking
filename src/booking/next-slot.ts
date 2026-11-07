import { eq, asc } from 'drizzle-orm';
import { services } from '../db/schema';
import { formatStudioDate } from '../lib/time';
import { getAvailability } from './availability';
import { getRules, nextStudioDate, horizonDate } from './rules';
import type { Deps, Slot } from './types';

export async function getNextFreeSlot(deps: Deps): Promise<Slot | null> {
  const available = await deps.db
    .select()
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sort), asc(services.id));
  const selected = available.find((service) => service.durationMin > 60) ?? available[0];
  if (!selected) return null;
  const rules = await getRules(deps);
  const end = horizonDate(deps.now(), rules.horizonDays);
  for (let date = formatStudioDate(deps.now()); date <= end; date = nextStudioDate(date)) {
    const slots = await getAvailability(deps, { serviceId: selected.id, masterId: null, date });
    if (slots.length) return slots[0];
  }
  return null;
}
