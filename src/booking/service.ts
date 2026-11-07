import { randomBytes } from 'node:crypto';
import { and, eq, gte, lt } from 'drizzle-orm';
import { bookingEvents, bookings, clients, masters, services } from '../db/schema';
import type { Db } from '../db/client';
import { formatStudioDate, fromStudioTime } from '../lib/time';
import { getAvailability } from './availability';
import { normalizePhone } from './phone';
import { planNotifications } from '../notifications/plan';
import { checkTime, getCandidates, getRules, horizonDate, nextStudioDate, serviceValues } from './rules';
import type { Actor, BookingError, BookingView, CreatedBooking, Deps, Result, Slot } from './types';

const fail = (error: BookingError): Result<never> => ({ ok: false, error });
const hasCode = (error: unknown, code: string): boolean => {
  if (!error || typeof error !== 'object') return false;
  const outer = error as { code?: string; cause?: { code?: string } };
  return outer.code === code || outer.cause?.code === code;
};

async function findView(deps: Deps, predicate: ReturnType<typeof eq>): Promise<CreatedBooking | null> {
  const [row] = await deps.db.select({ booking: bookings, client: clients, master: masters, service: services })
    .from(bookings).innerJoin(clients, eq(bookings.clientId, clients.id))
    .innerJoin(masters, eq(bookings.masterId, masters.id))
    .innerJoin(services, eq(bookings.serviceId, services.id)).where(predicate).limit(1);
  if (!row) return null;
  const { booking, client, master, service } = row;
  return { id: booking.id, status: booking.status, startsAt: booking.startsAt, endsAt: booking.endsAt,
    masterId: booking.masterId, masterName: master.name, serviceId: booking.serviceId,
    serviceName: service.name, priceRub: booking.priceRub, clientName: client.name,
    clientPhone: client.phone, moveCount: booking.moveCount, source: booking.source,
    manageToken: booking.manageToken, botCode: booking.botCode ?? '' };
}

function publicView(value: CreatedBooking): BookingView {
  const { manageToken: _manageToken, botCode: _botCode, ...view } = value;
  return view;
}

async function alternatives(deps: Deps, serviceId: number, masterId: number | null, start: Date): Promise<Slot[]> {
  const rules = await getRules(deps);
  const today = formatStudioDate(deps.now());
  const last = horizonDate(deps.now(), rules.horizonDays);
  let date = formatStudioDate(start);
  if (date < today || date > last) date = today;
  const result: Slot[] = [];
  while (date <= last && result.length < 3) {
    result.push(...(await getAvailability(deps, { serviceId, masterId, date })).slice(0, 3 - result.length));
    date = nextStudioDate(date);
  }
  return result;
}

async function rejection(deps: Deps, error: BookingError, serviceId: number, masterId: number | null, start: Date): Promise<Result<never>> {
  return error === 'too_soon' || error === 'too_far' || error === 'slot_taken'
    ? { ok: false, error, alternatives: await alternatives(deps, serviceId, masterId, start) }
    : fail(error);
}

async function dailyLoad(deps: Deps, date: string): Promise<Map<number, number>> {
  const rows = await deps.db.select({ masterId: bookings.masterId }).from(bookings)
    .where(and(eq(bookings.status, 'active'), gte(bookings.startsAt, fromStudioTime(date, '00:00')),
      lt(bookings.startsAt, fromStudioTime(nextStudioDate(date), '00:00'))));
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.masterId, (counts.get(row.masterId) ?? 0) + 1);
  return counts;
}

export async function createBooking(
  deps: Deps,
  input: {
    serviceId: number;
    masterId: number | null;
    start: Date;
    name: string;
    phone: string;
    idempotencyKey: string;
    actor: 'client_site' | 'manager';
  },
): Promise<Result<CreatedBooking>> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return fail('invalid_name');
  const phone = normalizePhone(input.phone);
  if (!phone) return fail('invalid_phone');
  const existing = await findView(deps, eq(bookings.idempotencyKey, input.idempotencyKey));
  if (existing) return { ok: true, value: existing };
  const candidates = await getCandidates(deps, input.serviceId, input.masterId);
  if (!candidates.length) return fail('not_found');
  const rules = await getRules(deps);
  const load = await dailyLoad(deps, formatStudioDate(input.start));
  candidates.sort((a, b) => (load.get(a.master.id) ?? 0) - (load.get(b.master.id) ?? 0) || a.master.id - b.master.id);
  let slotTaken = false;
  for (const candidate of candidates) {
    const values = serviceValues(candidate);
    const invalid = await checkTime(deps, { start: input.start, masterId: candidate.master.id,
      durationMin: values.durationMin, bufferMin: values.bufferMin,
      actor: input.actor === 'manager' ? 'manager' : 'client', rules });
    if (invalid) {
      if (input.masterId !== null || invalid === 'too_soon' || invalid === 'too_far')
        return rejection(deps, invalid, input.serviceId, input.masterId, input.start);
      continue;
    }
    for (let retry = 0; retry <= 3; retry++) {
      try {
        const bookingId = await deps.db.transaction(async (tx) => {
          const [client] = await tx.insert(clients).values({ name, phone })
            .onConflictDoUpdate({ target: clients.phone, set: { name } }).returning({ id: clients.id });
          const [booking] = await tx.insert(bookings).values({
            clientId: client.id, masterId: candidate.master.id, serviceId: input.serviceId,
            startsAt: input.start, endsAt: new Date(input.start.getTime() + values.durationMin * 60_000),
            occupiedUntil: new Date(input.start.getTime() + (values.durationMin + values.bufferMin) * 60_000),
            priceRub: values.priceRub, source: input.actor === 'manager' ? 'manager' : 'site',
            manageToken: randomBytes(32).toString('base64url'), botCode: randomBytes(16).toString('base64url'),
            idempotencyKey: input.idempotencyKey,
          }).returning({ id: bookings.id });
          await tx.insert(bookingEvents).values({ bookingId: booking.id, actor: input.actor, type: 'created' });
          await planNotifications(tx as unknown as Db, { bookingId: booking.id, actor: input.actor, type: 'created' });
          return booking.id;
        });
        const view = await findView(deps, eq(bookings.id, bookingId));
        if (!view) throw new Error('created booking missing');
        return { ok: true, value: view };
      } catch (error) {
        if (hasCode(error, '40P01')) {
          if (retry < 3) {
            await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 81)));
            continue;
          }
          slotTaken = true;
          break;
        }
        if (hasCode(error, '23505') || hasCode(error, '23P01')) {
          const duplicate = await findView(deps, eq(bookings.idempotencyKey, input.idempotencyKey));
          if (duplicate) return { ok: true, value: duplicate };
          if (hasCode(error, '23P01')) { slotTaken = true; break; }
        }
        throw error;
      }
    }
  }
  return rejection(deps, slotTaken ? 'slot_taken' : 'outside_schedule', input.serviceId, input.masterId, input.start);
}

export async function moveBooking(
  deps: Deps,
  input: { bookingId: number; newStart: Date; newMasterId?: number; actor: Actor },
): Promise<Result<BookingView>> {
  const rules = await getRules(deps);
  let serviceId = 0;
  let masterId = 0;
  for (let retry = 0; retry <= 3; retry++) {
  try {
    const result = await deps.db.transaction(async (tx): Promise<Result<number>> => {
      const [current] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).for('update');
      if (!current) return fail('not_found');
      if (current.status !== 'active') return fail('not_active');
      const transactionalDeps = { ...deps, db: tx as unknown as Db };
      serviceId = current.serviceId;
      masterId = input.newMasterId ?? current.masterId;
      if (current.startsAt.getTime() === input.newStart.getTime() && masterId === current.masterId)
        return { ok: true, value: current.id };
      const [candidate] = await getCandidates(transactionalDeps, current.serviceId, masterId);
      if (!candidate) return fail('not_found');
      if (input.actor !== 'manager') {
        if (deps.now().getTime() > current.startsAt.getTime() - rules.changeCutoffMin * 60_000) return fail('too_late');
        if (current.moveCount >= rules.maxClientMoves) return fail('move_limit');
      }
      const values = serviceValues(candidate);
      const invalid = await checkTime(transactionalDeps, { start: input.newStart, masterId, durationMin: values.durationMin,
        bufferMin: values.bufferMin, actor: input.actor === 'manager' ? 'manager' : 'client', rules });
      if (invalid) return fail(invalid);
      await tx.update(bookings).set({ masterId, startsAt: input.newStart,
        endsAt: new Date(input.newStart.getTime() + values.durationMin * 60_000),
        occupiedUntil: new Date(input.newStart.getTime() + (values.durationMin + values.bufferMin) * 60_000),
        priceRub: values.priceRub, moveCount: current.moveCount + (input.actor === 'manager' ? 0 : 1),
        warnedAt: null, updatedAt: new Date(),
      }).where(eq(bookings.id, current.id));
      await tx.insert(bookingEvents).values({ bookingId: current.id, actor: input.actor, type: 'moved',
        before: { startsAt: current.startsAt.toISOString(), masterId: current.masterId },
        after: { startsAt: input.newStart.toISOString(), masterId } });
      await planNotifications(tx as unknown as Db, { bookingId: current.id, actor: input.actor, type: 'moved', previousMasterId: current.masterId });
      return { ok: true, value: current.id };
    });
    if (!result.ok) return rejection(deps, result.error, serviceId, masterId, input.newStart);
    const view = await findView(deps, eq(bookings.id, result.value));
    if (!view) throw new Error('booking missing after move');
    return { ok: true, value: publicView(view) };
  } catch (error) {
    if (hasCode(error, '40P01') && retry < 3) {
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 81)));
      continue;
    }
    if (hasCode(error, '23P01') || hasCode(error, '40P01'))
      return rejection(deps, 'slot_taken', serviceId, masterId, input.newStart);
    throw error;
  }
  }
  throw new Error('unreachable move retry state');
}

export async function cancelBooking(
  deps: Deps,
  input: { bookingId: number; actor: Actor; reason?: string },
): Promise<Result<BookingView>> {
  const rules = await getRules(deps);
  const result = await deps.db.transaction(async (tx): Promise<Result<number>> => {
    const [current] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).for('update');
    if (!current) return fail('not_found');
    if (current.status !== 'active') return fail('not_active');
    if (input.actor !== 'manager' && deps.now().getTime() > current.startsAt.getTime() - rules.changeCutoffMin * 60_000)
      return fail('too_late');
    await tx.update(bookings).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(bookings.id, current.id));
    await tx.insert(bookingEvents).values({ bookingId: current.id, actor: input.actor, type: 'cancelled',
      before: { status: current.status }, after: { status: 'cancelled', reason: input.reason ?? null } });
    await planNotifications(tx as unknown as Db, { bookingId: current.id, actor: input.actor, type: 'cancelled' });
    return { ok: true, value: current.id };
  });
  if (!result.ok) return result;
  const view = await findView(deps, eq(bookings.id, result.value));
  if (!view) throw new Error('booking missing after cancellation');
  return { ok: true, value: publicView(view) };
}

export async function setVisitResult(
  deps: Deps,
  input: { bookingId: number; result: 'attended' | 'no_show' },
): Promise<Result<BookingView>> {
  const result = await deps.db.transaction(async (tx): Promise<Result<number>> => {
    const [current] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).for('update');
    if (!current) return fail('not_found');
    if (current.status === 'cancelled') return fail('not_active');
    if (deps.now().getTime() < current.startsAt.getTime()) return fail('too_soon');
    await tx.update(bookings).set({ status: input.result, updatedAt: new Date() }).where(eq(bookings.id, current.id));
    await tx.insert(bookingEvents).values({ bookingId: current.id, actor: 'manager', type: 'visit_result',
      before: { status: current.status }, after: { status: input.result } });
    return { ok: true, value: current.id };
  });
  if (!result.ok) return result;
  const view = await findView(deps, eq(bookings.id, result.value));
  if (!view) throw new Error('booking missing after visit result');
  return { ok: true, value: publicView(view) };
}

export async function getBookingByToken(deps: Deps, token: string): Promise<BookingView | null> {
  const view = await findView(deps, eq(bookings.manageToken, token));
  return view ? publicView(view) : null;
}
