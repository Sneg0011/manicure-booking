import { TZDate } from '@date-fns/tz';

export const STUDIO_TZ = 'Europe/Moscow';

/** Convert a studio calendar date and wall-clock time to an instant. */
export function fromStudioTime(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new TZDate(year, month - 1, day, hour, minute, STUDIO_TZ);
}

export function formatStudioTime(date: Date): string {
  const studioDate = new TZDate(date.getTime(), STUDIO_TZ);
  return `${String(studioDate.getHours()).padStart(2, '0')}:${String(studioDate.getMinutes()).padStart(2, '0')}`;
}

export function formatStudioDate(date: Date): string {
  const studioDate = new TZDate(date.getTime(), STUDIO_TZ);
  return `${studioDate.getFullYear()}-${String(studioDate.getMonth() + 1).padStart(2, '0')}-${String(studioDate.getDate()).padStart(2, '0')}`;
}

export function studioWeekday(date: Date): number {
  return new TZDate(date.getTime(), STUDIO_TZ).getDay();
}
