import { formatStudioDate, formatStudioTime } from '../lib/time';
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} минут`;
}
export function dateText(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
export function slotText(start: Date): string {
  return `${dateText(formatStudioDate(start))}, ${formatStudioTime(start)} МСК`;
}
