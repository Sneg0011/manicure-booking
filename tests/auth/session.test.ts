import { expect, test } from 'vitest';
import { createSession, verifySession } from '../../src/auth/session';

const secret = 'a-secret-longer-than-sixteen';

test('выданная сессия действует 12 часов', async () => {
  const token = await createSession(secret, new Date('2026-11-07T10:00:00Z'));
  expect(await verifySession(token, secret, new Date('2026-11-07T11:00:00Z'))).toBe(true);
  expect(await verifySession(token, secret, new Date('2026-11-07T22:00:01Z'))).toBe(false);
});

test('подпись и другой секрет не принимаются', async () => {
  const token = await createSession(secret);
  const parts = token.split('.');
  parts[2] = `${parts[2][0] === 'a' ? 'b' : 'a'}${parts[2].slice(1)}`;
  expect(await verifySession(parts.join('.'), secret)).toBe(false);
  expect(await verifySession(token, 'another-secret-long-enough')).toBe(false);
});

test('короткий секрет не создаёт и не проверяет сессию', async () => {
  await expect(createSession('short')).rejects.toThrow();
  const token = await createSession(secret);
  expect(await verifySession(token, 'short')).toBe(false);
  expect(await verifySession(token, undefined)).toBe(false);
});
