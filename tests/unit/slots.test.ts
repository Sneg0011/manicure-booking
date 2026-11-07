import { test, expect } from 'vitest';
import { computeDaySlots } from '../../src/booking/slots';
import {
  formatStudioDate,
  formatStudioTime,
  fromStudioTime,
  studioWeekday,
} from '../../src/lib/time';

const date = '2026-12-07';
const weekdayHours = { opens: '10:00', closes: '22:00' };
const saturdayHours = { opens: '10:00', closes: '15:00' };
const base = {
  date,
  hours: weekdayHours,
  durationMin: 60,
  bufferMin: 15,
  busy: [] as { start: Date; end: Date }[],
  stepMin: 30,
  now: fromStudioTime('2026-12-01', '09:00'),
  minLeadMin: 60,
  horizonDays: 30,
};
const times = (slots: Date[]) => slots.map(formatStudioTime);

test('Пн 2026-12-07, 60 мин: первый 10:00, последний 21:00', () => {
  expect(studioWeekday(fromStudioTime(date, '10:00'))).toBe(1);
  expect(times(computeDaySlots(base))).toEqual([
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00',
    '12:30',
    '13:00',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
    '21:00',
  ]);
});

test('Сб 2026-12-12, 75 мин: последний старт 13:30', () => {
  const slots = computeDaySlots({
    ...base,
    date: '2026-12-12',
    hours: saturdayHours,
    durationMin: 75,
  });
  expect(studioWeekday(slots[0])).toBe(6);
  expect(times(slots)).toEqual([
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00',
    '12:30',
    '13:00',
    '13:30',
  ]);
});

test('Сб, 60 мин: старт 14:00 есть, пауза выходит за закрытие', () => {
  expect(times(computeDaySlots({ ...base, date: '2026-12-12', hours: saturdayHours }))).toEqual([
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00',
    '12:30',
    '13:00',
    '13:30',
    '14:00',
  ]);
});

test('Вс: hours=null даёт []', () => {
  expect(studioWeekday(fromStudioTime('2026-12-13', '10:00'))).toBe(0);
  expect(computeDaySlots({ ...base, date: '2026-12-13', hours: null })).toEqual([]);
});

test('занято 10:00–11:30: первый слот 11:30', () => {
  const slots = computeDaySlots({
    ...base,
    busy: [{ start: fromStudioTime(date, '10:00'), end: fromStudioTime(date, '11:30') }],
  });
  expect(times(slots)).toEqual([
    '11:30',
    '12:00',
    '12:30',
    '13:00',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
    '21:00',
  ]);
});

test('90+15 перед занятым 12:00: 10:00 есть, 10:30 нет', () => {
  const slots = computeDaySlots({
    ...base,
    durationMin: 90,
    busy: [{ start: fromStudioTime(date, '12:00'), end: fromStudioTime(date, '13:00') }],
  });
  expect(times(slots)).toEqual([
    '10:00',
    '13:00',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
  ]);
});

test('now 2026-12-07 12:10: первый слот 13:30', () => {
  const slots = computeDaySlots({ ...base, now: fromStudioTime(date, '12:10') });
  expect(times(slots)).toEqual([
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
    '21:00',
  ]);
});

test('now 2026-12-07 09:00: 2027-01-06 есть, 2027-01-07 пусто', () => {
  const now = fromStudioTime(date, '09:00');
  const lastDay = computeDaySlots({ ...base, date: '2027-01-06', now });
  expect(lastDay).toHaveLength(23);
  expect(formatStudioDate(lastDay[0])).toBe('2027-01-06');
  expect(times(lastDay)[0]).toBe('10:00');
  expect(times(lastDay).at(-1)).toBe('21:00');
  expect(computeDaySlots({ ...base, date: '2027-01-07', now })).toEqual([]);
});
