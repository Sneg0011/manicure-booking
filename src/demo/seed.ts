import { randomBytes } from 'node:crypto';
import type { Deps } from '../booking/types';
import {
  bookingEvents,
  bookings,
  clients,
  closures,
  masterServices,
  notifications,
  services,
  workingHours,
} from '../db/schema';
import { formatStudioDate, fromStudioTime, studioWeekday } from '../lib/time';
import { demoServices } from './catalog';

const names = [
  'Алина Морозова',
  'Елена Белова',
  'Полина Крылова',
  'Мария Зайцева',
  'Ольга Миронова',
  'Анна Лебедева',
  'Вера Фомина',
  'Ирина Волкова',
  'Юлия Тихонова',
  'Наталья Егорова',
  'Ксения Романова',
  'София Павлова',
  'Екатерина Соколова',
  'Татьяна Алексеева',
  'Дарья Кузнецова',
  'Лидия Смирнова',
  'Виктория Орлова',
  'Нина Васильева',
];
const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const workday = (date: string): boolean => studioWeekday(fromStudioTime(date, '12:00')) !== 0;

export async function seedDemo(deps: Deps): Promise<void> {
  const now = deps.now();
  const today = formatStudioDate(now);
  const savedServices = await deps.db
    .insert(services)
    .values(demoServices.map((value, index) => ({ ...value, sort: index + 1 })))
    .returning({ id: services.id });
  await deps.db.insert(masterServices).values(
    [1, 2].flatMap((masterId) =>
      savedServices.map((service, index) => ({
        masterId,
        serviceId: service.id,
        durationMin: masterId === 2 && index === 3 ? 195 : null,
        priceRub:
          masterId === 2 && index === 3 ? 4800 : masterId === 2 && index === 1 ? 2900 : null,
      })),
    ),
  );
  await deps.db.insert(workingHours).values(
    [1, 2].flatMap((masterId) =>
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        masterId,
        weekday,
        opensAt: '10:00',
        closesAt: weekday === 6 ? '15:00' : '22:00',
      })),
    ),
  );

  type Entry = {
    date: string;
    time: string;
    masterId: number;
    serviceIndex: number;
    status?: 'attended' | 'no_show' | 'cancelled';
    special?: 'conflict' | 'changed' | 'client_cancel' | 'manager_cancel';
  };
  const entries: Entry[] = [];
  for (let offset = -6; offset <= 6; offset++) {
    const date = addDays(today, offset);
    if (!workday(date)) continue;
    if (offset === 0) {
      const close = studioWeekday(fromStudioTime(date, '12:00')) === 6 ? 15 : 22;
      for (let minute = 600; minute + 15 <= close * 60; minute += 30) {
        const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        if (fromStudioTime(date, time) > now) {
          entries.push({ date, time, masterId: 2, serviceIndex: 4 });
          break;
        }
      }
      continue;
    }
    entries.push({
      date,
      time: '10:00',
      masterId: offset < 0 ? 1 : 2,
      serviceIndex: studioWeekday(fromStudioTime(date, '12:00')) === 6 ? 1 : Math.abs(offset) % 6,
      status:
        offset < 0
          ? offset % 4 === 0
            ? 'cancelled'
            : offset % 3 === 0
              ? 'no_show'
              : 'attended'
          : undefined,
    });
  }
  const next = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).find(workday)!;
  entries.push({ date: next, time: '10:00', masterId: 1, serviceIndex: 0, special: 'conflict' });
  entries.push({ date: next, time: '13:00', masterId: 2, serviceIndex: 4, special: 'changed' });
  entries.push({
    date: next,
    time: '13:00',
    masterId: 1,
    serviceIndex: 4,
    status: 'cancelled',
    special: 'client_cancel',
  });
  const later = Array.from({ length: 7 }, (_, i) => addDays(next, i + 1)).find(workday)!;
  entries.push({
    date: later,
    time: '14:00',
    masterId: 1,
    serviceIndex: 4,
    status: 'cancelled',
    special: 'manager_cancel',
  });

  for (const [index, entry] of entries.entries()) {
    const service = demoServices[entry.serviceIndex];
    const duration = entry.masterId === 2 && entry.serviceIndex === 3 ? 195 : service.durationMin;
    const price =
      entry.masterId === 2 && entry.serviceIndex === 3
        ? 4800
        : entry.masterId === 2 && entry.serviceIndex === 1
          ? 2900
          : service.priceRub;
    const start = fromStudioTime(entry.date, entry.time);
    const end = new Date(start.getTime() + duration * 60_000);
    const occupied = new Date(end.getTime() + service.bufferMin * 60_000);
    const createdAt = new Date(Math.min(now.getTime(), start.getTime()) - 86_400_000);
    const [client] = await deps.db
      .insert(clients)
      .values({
        name: names[index],
        phone: `+7000${String(index + 1).padStart(7, '0')}`,
        createdAt,
      })
      .returning({ id: clients.id });
    const source = index % 4 === 0 ? 'manager' : 'site';
    const [booking] = await deps.db
      .insert(bookings)
      .values({
        clientId: client.id,
        masterId: entry.masterId,
        serviceId: savedServices[entry.serviceIndex].id,
        startsAt: start,
        endsAt: end,
        occupiedUntil: occupied,
        priceRub: price,
        status: entry.status ?? 'active',
        source,
        needsCall: entry.special === 'changed' ? 'changed' : null,
        manageToken: randomBytes(32).toString('base64url'),
        botCode: randomBytes(16).toString('base64url'),
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: bookings.id });
    await deps.db
      .insert(bookingEvents)
      .values({
        bookingId: booking.id,
        actor: source === 'manager' ? 'manager' : 'client_site',
        type: 'created',
        createdAt,
      });
    await deps.db
      .insert(notifications)
      .values({
        bookingId: booking.id,
        recipient: 'manager',
        channel: 'journal',
        body: `Создана демо-запись: ${names[index]}`,
        status: index % 3 === 0 ? 'not_connected' : 'sent',
        createdAt,
      });
    if (entry.special === 'changed' || index === 1 || index === 3) {
      const actor = entry.special === 'changed' || index === 3 ? 'manager' : 'client_site';
      await deps.db
        .insert(bookingEvents)
        .values({
          bookingId: booking.id,
          actor,
          type: 'moved',
          before: { startsAt: new Date(start.getTime() - 30 * 60_000).toISOString() },
          after: { startsAt: start.toISOString() },
          createdAt,
        });
      await deps.db
        .insert(notifications)
        .values({
          bookingId: booking.id,
          recipient: 'manager',
          channel: 'journal',
          body: `Перенесена демо-запись: ${names[index]}`,
          status: 'sent',
          createdAt,
        });
    }
    if (entry.status === 'cancelled') {
      await deps.db
        .insert(bookingEvents)
        .values({
          bookingId: booking.id,
          actor: entry.special === 'manager_cancel' ? 'manager' : 'client_site',
          type: 'cancelled',
          createdAt,
        });
      await deps.db
        .insert(notifications)
        .values({
          bookingId: booking.id,
          recipient: 'manager',
          channel: 'journal',
          body: `Отменена демо-запись: ${names[index]}`,
          status: 'sent',
          createdAt,
        });
    }
    if (entry.special === 'conflict')
      await deps.db
        .insert(closures)
        .values({
          masterId: entry.masterId,
          startsAt: new Date(start.getTime() + 10 * 60_000),
          endsAt: new Date(start.getTime() + 25 * 60_000),
          reason: 'Пример конфликта',
          createdAt,
        });
  }
}
