'use server';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { bookings } from '../../db/schema';
import { getDeps } from '../../lib/deps';
import { moveBooking, cancelBooking } from '../../booking/service';
import { deliverPending } from '../../notifications/deliver';
import { getSenderFromEnv } from '../../bot/sender';

async function bookingId(token: string): Promise<number | null> {
  const [row] = await getDeps()
    .db.select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.manageToken, token))
    .limit(1);
  return row?.id ?? null;
}
export async function moveByTokenAction(token: string, newStart: string) {
  if (!token || Number.isNaN(Date.parse(newStart)))
    return { ok: false as const, error: 'not_found' as const, alternatives: [] };
  const id = await bookingId(token);
  if (id === null) return { ok: false as const, error: 'not_found' as const, alternatives: [] };
  const deps = getDeps();
  const result = await moveBooking(deps, {
    bookingId: id,
    newStart: new Date(newStart),
    actor: 'client_site',
  });
  if (result.ok) {
    revalidatePath(`/b/${token}`);
    after(() => deliverPending(deps, getSenderFromEnv()));
  }
  return {
    ...result,
    alternatives: !result.ok
      ? result.alternatives?.map((slot) => ({
          start: slot.start.toISOString(),
          masterId: slot.masterId,
        }))
      : undefined,
  };
}
export async function cancelByTokenAction(token: string) {
  const id = await bookingId(token);
  if (id === null) return { ok: false as const, error: 'not_found' as const };
  const deps = getDeps();
  const result = await cancelBooking(deps, { bookingId: id, actor: 'client_site' });
  if (result.ok) {
    revalidatePath(`/b/${token}`);
    after(() => deliverPending(deps, getSenderFromEnv()));
  }
  return result;
}
