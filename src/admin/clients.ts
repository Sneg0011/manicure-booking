import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Deps } from '../booking/types';
import { bookingEvents, bookings, clients, masters, services } from '../db/schema';

export async function listClients(deps: Deps, q = '') {
  const pattern = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await deps.db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      anonymizedAt: clients.anonymizedAt,
      nextBooking: sql<Date | null>`min(${bookings.startsAt}) filter (where ${bookings.status} = 'active' and ${bookings.startsAt} >= ${deps.now()})`,
      pastVisits: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'attended')::int`,
    })
    .from(clients)
    .leftJoin(bookings, eq(bookings.clientId, clients.id))
    .where(q.trim() ? or(ilike(clients.name, pattern), ilike(clients.phone, pattern)) : undefined)
    .groupBy(clients.id)
    .orderBy(asc(clients.name), asc(clients.id));
  return rows.map((row) => ({
    ...row,
    name: row.anonymizedAt ? 'Обезличено' : row.name,
    phone: row.anonymizedAt ? null : row.phone,
    // Drizzle отдаёт время из сырого SQL строкой.
    nextBooking: row.nextBooking ? new Date(row.nextBooking) : null,
  }));
}

export async function getClientCard(deps: Deps, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [client] = await deps.db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      anonymizedAt: clients.anonymizedAt,
    })
    .from(clients)
    .where(eq(clients.id, id));
  if (!client) return null;
  const records = await deps.db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      masterName: masters.name,
      serviceName: services.name,
    })
    .from(bookings)
    .innerJoin(masters, eq(bookings.masterId, masters.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.clientId, id))
    .orderBy(asc(bookings.startsAt));
  const history = await deps.db
    .select({
      id: bookingEvents.id,
      bookingId: bookingEvents.bookingId,
      actor: bookingEvents.actor,
      type: bookingEvents.type,
      before: bookingEvents.before,
      after: bookingEvents.after,
      createdAt: bookingEvents.createdAt,
    })
    .from(bookingEvents)
    .innerJoin(bookings, eq(bookingEvents.bookingId, bookings.id))
    .where(eq(bookings.clientId, id))
    .orderBy(asc(bookingEvents.createdAt));
  return {
    ...client,
    name: client.anonymizedAt ? 'Обезличено' : client.name,
    phone: client.anonymizedAt ? null : client.phone,
    bookings: records,
    history,
  };
}
