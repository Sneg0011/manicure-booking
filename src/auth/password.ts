import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_BYTES = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_BYTES);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{128}$/.test(hashHex)) return false;
  try {
    const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), KEY_BYTES);
    return timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
  } catch {
    return false;
  }
}
