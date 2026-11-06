import { expect, test } from 'vitest';
import { normalizePhone } from '../../src/booking/phone';

test.each([
  '8 (900) 123-45-67',
  '+7 900 123 45 67',
  '9001234567',
  '+7000 123 45 67',
])('%s normalizes to E.164', (raw) => {
  expect(normalizePhone(raw)).toBe(raw.startsWith('+7000') ? '+70001234567' : '+79001234567');
});

test.each(['abc', '123'])('%s is rejected', (raw) => {
  expect(normalizePhone(raw)).toBeNull();
});
