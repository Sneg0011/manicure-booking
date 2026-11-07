import { expect, test } from 'vitest';
import { createTestDb } from '../helpers/db';
import { deps, seedFixtures, at } from '../helpers/fixtures';
import {
  getSchedule,
  setWorkingHours,
  addClosure,
  removeClosure,
  setRules,
} from '../../src/admin/schedule';
import { getCallList } from '../../src/booking/call-list';
import { createBooking } from '../../src/booking/service';
import { getAvailability } from '../../src/booking/availability';
import { getRules } from '../../src/booking/rules';

test('закрытие и часы влияют на запись и конфликт, ошибки не меняют данные', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const available = () => getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' });
    expect((await available()).some((x) => x.start.getTime() === at('10:00').getTime())).toBe(true);
    const booking = await createBooking(d, {
      serviceId: 1,
      masterId: 1,
      start: at('10:00'),
      name: 'Клиент',
      phone: '+79000000001',
      idempotencyKey: 'schedule',
      actor: 'manager',
    });
    expect(booking.ok).toBe(true);
    expect((await setWorkingHours(d, 1, 1, { opens: '20:00', closes: '10:00' })).ok).toBe(false);
    expect(
      (await getSchedule(d)).hours.find((x) => x.masterId === 1 && x.weekday === 1)?.opensAt,
    ).toBe('10:00:00');
    expect(
      (
        await addClosure(d, {
          masterId: 1,
          startsAt: at('10:00'),
          endsAt: at('11:00'),
          reason: 'Тест',
        })
      ).ok,
    ).toBe(true);
    expect((await available()).some((x) => x.start.getTime() === at('10:00').getTime())).toBe(
      false,
    );
    expect((await getCallList(d)).some((x) => x.reason === 'conflict')).toBe(true);
    expect(
      await createBooking(d, {
        serviceId: 1,
        masterId: 1,
        start: at('10:00'),
        name: 'Другой',
        phone: '+79000000002',
        idempotencyKey: 'closed',
        actor: 'manager',
      }),
    ).toMatchObject({ ok: false, error: 'outside_schedule' });
    expect((await setWorkingHours(d, 1, 1, null)).ok).toBe(true);
    expect((await getSchedule(d)).hours.some((x) => x.masterId === 1 && x.weekday === 1)).toBe(
      false,
    );
    expect(await available()).toEqual([]);
    expect(
      (
        await setRules(d, {
          slotStepMin: 17,
          minLeadMin: 60,
          horizonDays: 30,
          changeCutoffMin: 120,
          maxClientMoves: 3,
        })
      ).ok,
    ).toBe(false);
    expect((await getRules(d)).slotStepMin).toBe(30);
    const closure = (await getSchedule(d)).closures[0];
    expect((await removeClosure(d, closure.id)).ok).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('правила меняют шаг и горизонт сразу после сохранения', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00', '2026-12-01') });
    const input = { serviceId: 1, masterId: 1, date: '2026-12-07' };
    const before = await getAvailability(d, input);
    expect(
      (
        await setRules(d, {
          slotStepMin: 15,
          minLeadMin: 0,
          horizonDays: 30,
          changeCutoffMin: 120,
          maxClientMoves: 3,
        })
      ).ok,
    ).toBe(true);
    expect((await getAvailability(d, input)).length).toBeGreaterThan(before.length);
    expect(
      (
        await setRules(d, {
          slotStepMin: 15,
          minLeadMin: 0,
          horizonDays: 1,
          changeCutoffMin: 120,
          maxClientMoves: 3,
        })
      ).ok,
    ).toBe(true);
    expect(await getAvailability(d, input)).toEqual([]);
  } finally {
    await fixture.close();
  }
});

test('каждое неверное правило отклоняется без изменения базы', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const initial = await getRules(d);
    const cases = [
      { slotStepMin: 45 },
      { minLeadMin: -1 },
      { minLeadMin: 1441 },
      { horizonDays: 0 },
      { horizonDays: 181 },
      { changeCutoffMin: -1 },
      { changeCutoffMin: 10081 },
      { maxClientMoves: -1 },
      { maxClientMoves: 21 },
    ];
    for (const change of cases) {
      expect((await setRules(d, { ...initial, ...change })).ok).toBe(false);
      expect(await getRules(d)).toEqual(initial);
    }
    expect((await setWorkingHours(d, 1, 1, { opens: 'oops', closes: '22:00' })).ok).toBe(false);
    expect(
      (await addClosure(d, { masterId: 1, startsAt: at('12:00'), endsAt: at('10:00'), reason: '' }))
        .ok,
    ).toBe(false);
    expect((await getSchedule(d)).closures).toEqual([]);
  } finally {
    await fixture.close();
  }
});

test('сокращение часов убирает поздние слоты и помечает существующую запись конфликтом', async () => {
  const fixture = await createTestDb();
  try {
    await seedFixtures(fixture.db);
    const d = deps(fixture.db, { current: at('09:00') });
    const booking = await createBooking(d, {
      serviceId: 1,
      masterId: 1,
      start: at('19:00'),
      name: 'Клиент',
      phone: '+79000000004',
      idempotencyKey: 'hours',
      actor: 'manager',
    });
    expect(booking.ok).toBe(true);
    expect((await setWorkingHours(d, 1, 1, { opens: '10:00', closes: '18:00' })).ok).toBe(true);
    expect(
      (await getAvailability(d, { serviceId: 1, masterId: 1, date: '2026-12-07' })).some(
        (x) => x.start.getTime() >= at('18:00').getTime(),
      ),
    ).toBe(false);
    expect(
      (await getCallList(d)).some(
        (x) => x.bookingId === (booking.ok ? booking.value.id : -1) && x.reason === 'conflict',
      ),
    ).toBe(true);
  } finally {
    await fixture.close();
  }
});
