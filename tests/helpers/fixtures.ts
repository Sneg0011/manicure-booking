import type { Db } from '../../src/db/client';
import { masterServices, masters, services, settings, workingHours } from '../../src/db/schema';
import { fromStudioTime } from '../../src/lib/time';
import type { Deps } from '../../src/booking/types';

export const BOOKING_DAY = '2026-12-07';
export const BASE_NOW = fromStudioTime('2026-12-01', '09:00');
export const at = (time: string, date = BOOKING_DAY) => fromStudioTime(date, time);

export interface Clock { current: Date }
export function deps(db: Db, now: Clock): Deps {
  return { db, now: () => now.current };
}

export async function seedFixtures(db: Db): Promise<void> {
  await db.insert(settings).values({ id: 1 });
  await db.insert(masters).values([
    { id: 1, name: 'Анна' },
    { id: 2, name: 'Мария' },
  ]);
  await db.insert(services).values([
    { id: 1, name: 'Маникюр', durationMin: 60, bufferMin: 15, priceRub: 1000 },
    { id: 2, name: 'Длинный маникюр', durationMin: 90, bufferMin: 15, priceRub: 1500 },
  ]);
  await db.insert(masterServices).values([
    { masterId: 1, serviceId: 1 },
    { masterId: 1, serviceId: 2 },
    { masterId: 2, serviceId: 1, durationMin: 75, priceRub: 1300 },
    { masterId: 2, serviceId: 2 },
  ]);
  await db.insert(workingHours).values([1, 2].flatMap((masterId) =>
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      masterId,
      weekday,
      opensAt: '10:00',
      closesAt: weekday === 6 ? '15:00' : '22:00',
    })),
  ));
}
