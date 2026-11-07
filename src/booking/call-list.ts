import type { BookingStatus, Deps } from './types';
import { eq, sql } from 'drizzle-orm';
import { bookingEvents, bookings } from '../db/schema';
import { formatStudioDate } from '../lib/time';
import { nextStudioDate } from './rules';

export interface CallItem {
  bookingId: number;
  reason: 'remind' | 'changed' | 'conflict';
  clientName: string;
  clientPhone: string | null;
  masterName: string;
  serviceName: string;
  startsAt: Date;
  status: BookingStatus;
  warnedAt: Date | null;
}

export async function getCallList(deps: Deps): Promise<CallItem[]> {
  const now = deps.now();
  const today = formatStudioDate(now);
  const afterTomorrow = nextStudioDate(nextStudioDate(today));
  const result = await deps.db.execute(sql`
    select b.id as "bookingId", c.name as "clientName", c.phone as "clientPhone",
      m.name as "masterName", s.name as "serviceName", b.starts_at as "startsAt",
      b.status, b.warned_at as "warnedAt",
      case
        when b.status = 'active' and b.ends_at > ${now} and (
          not exists (select 1 from working_hours h where h.master_id = b.master_id
            and h.weekday = extract(dow from b.starts_at at time zone 'Europe/Moscow')
            and (b.starts_at at time zone 'Europe/Moscow')::time >= h.opens_at
            and (b.ends_at at time zone 'Europe/Moscow')::time <= h.closes_at)
          or exists (select 1 from closures x where x.master_id = b.master_id
            and x.starts_at < b.occupied_until and x.ends_at > b.starts_at)
        ) then 'conflict'
        when b.needs_call = 'changed' then 'changed'
        when b.status = 'active' and b.starts_at > ${now} and b.warned_at is null
          and (b.starts_at at time zone 'Europe/Moscow')::date >= ${today}::date
          and (b.starts_at at time zone 'Europe/Moscow')::date < ${afterTomorrow}::date then 'remind'
        else null end as reason
    from bookings b join clients c on c.id = b.client_id
      join masters m on m.id = b.master_id join services s on s.id = b.service_id
    order by b.starts_at, b.id
  `);
  // Drizzle отдаёт время из сырого SQL строкой, а CallItem обещает Date.
  return (result.rows as unknown as (CallItem & { reason: CallItem['reason'] | null })[])
    .filter((row) => row.reason !== null)
    .map((row) => ({
      ...row,
      startsAt: new Date(row.startsAt),
      warnedAt: row.warnedAt ? new Date(row.warnedAt) : null,
    }));
}

export async function markWarned(deps: Deps, bookingId: number): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookings)
      .set({ warnedAt: deps.now(), needsCall: null })
      .where(eq(bookings.id, bookingId))
      .returning({ id: bookings.id });
    if (!row) throw new Error('booking not found');
    await tx.insert(bookingEvents).values({ bookingId, actor: 'manager', type: 'warned' });
  });
}
