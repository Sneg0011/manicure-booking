import { TZDate } from '@date-fns/tz';
import { formatStudioDate, fromStudioTime, STUDIO_TZ } from '../lib/time';

export function computeDaySlots(input: {
  date: string;
  hours: { opens: string; closes: string } | null;
  durationMin: number;
  bufferMin: number;
  busy: { start: Date; end: Date }[];
  stepMin: number;
  now: Date;
  minLeadMin: number;
  horizonDays: number;
}): Date[] {
  const { date, hours, durationMin, bufferMin, busy, stepMin, now, minLeadMin, horizonDays } =
    input;
  if (hours === null) return [];

  const horizon = new TZDate(now.getTime(), STUDIO_TZ);
  horizon.setDate(horizon.getDate() + horizonDays);
  if (date > formatStudioDate(horizon)) return [];

  const opens = fromStudioTime(date, hours.opens).getTime();
  const closes = fromStudioTime(date, hours.closes).getTime();
  const durationMs = durationMin * 60_000;
  const occupiedMs = (durationMin + bufferMin) * 60_000;
  const earliest = now.getTime() + minLeadMin * 60_000;
  const slots: Date[] = [];

  for (let start = opens; start + durationMs <= closes; start += stepMin * 60_000) {
    if (start < earliest) continue;
    const occupiedUntil = start + occupiedMs;
    if (
      busy.some(
        ({ start: busyStart, end: busyEnd }) =>
          start < busyEnd.getTime() && busyStart.getTime() < occupiedUntil,
      )
    )
      continue;
    slots.push(new Date(start));
  }

  return slots;
}
