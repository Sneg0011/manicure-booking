import type { Deps } from './types';
import { sql } from 'drizzle-orm';
import { bookings, bookingEvents } from '../db/schema';
import { getCallList } from './call-list';

export interface Summary {
  bookingsSelf: number;
  bookingsManager: number;
  changesSelf: number;
  changesManager: number;
  callsLeft: number;
}

export async function getSummary(deps: Deps): Promise<Summary> {
  const [sources, changes, calls] = await Promise.all([
    deps.db
      .select({
        self: sql<number>`count(*) filter (where ${bookings.source} = 'site')::int`,
        manager: sql<number>`count(*) filter (where ${bookings.source} = 'manager')::int`,
      })
      .from(bookings),
    deps.db
      .select({
        self: sql<number>`count(*) filter (where ${bookingEvents.type} in ('moved','cancelled') and ${bookingEvents.actor} in ('client_site','client_bot'))::int`,
        manager: sql<number>`count(*) filter (where ${bookingEvents.type} in ('moved','cancelled') and ${bookingEvents.actor} = 'manager')::int`,
      })
      .from(bookingEvents),
    getCallList(deps),
  ]);
  return {
    bookingsSelf: sources[0].self,
    bookingsManager: sources[0].manager,
    changesSelf: changes[0].self,
    changesManager: changes[0].manager,
    callsLeft: calls.length,
  };
}
