'use server';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAvailability } from '../../booking/availability';
import { getDeps } from '../../lib/deps';
import { submitBooking } from '../../site/booking-actions';
import { deliverPending } from '../../notifications/deliver';
import { getSenderFromEnv } from '../../bot/sender';
import { getDemoVersion } from '../../demo/version';

export async function getSlotsAction(serviceId: number, masterId: number | null, date: string) {
  if (
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    (masterId !== null && (!Number.isSafeInteger(masterId) || masterId <= 0))
  )
    return [];
  return (await getAvailability(getDeps(), { serviceId, masterId, date })).map((slot) => ({
    start: slot.start.toISOString(),
    masterId: slot.masterId,
  }));
}
export async function submitBookingAction(input: {
  serviceId: number;
  masterId: number | null;
  start: string;
  name: string;
  phone: string;
  idempotencyKey: string;
  demoVersion: string;
}) {
  const deps = getDeps();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (
    !Number.isSafeInteger(input.serviceId) ||
    !input.idempotencyKey ||
    Number.isNaN(Date.parse(input.start))
  )
    return { ok: false as const, error: 'not_found' as const, alternatives: [] };
  if (process.env.DEMO_MODE === 'true' && input.demoVersion !== (await getDemoVersion(deps)))
    return { ok: false as const, error: 'not_found' as const, alternatives: [] };
  const perHour = Number(process.env.RATE_LIMIT_BOOKINGS_PER_HOUR) || 5;
  const result = await submitBooking(
    deps,
    {
      serviceId: input.serviceId,
      masterId: input.masterId,
      start: new Date(input.start),
      name: input.name,
      phone: input.phone,
      idempotencyKey: input.idempotencyKey,
    },
    ip,
    { perHour },
  );
  if (!result.ok)
    return {
      ...result,
      alternatives:
        'alternatives' in result
          ? result.alternatives?.map((slot) => ({
              start: slot.start.toISOString(),
              masterId: slot.masterId,
            }))
          : undefined,
    };
  after(() => deliverPending(deps, getSenderFromEnv()));
  redirect(`/b/${result.value.manageToken}?new=1`);
}
