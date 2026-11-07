import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password';

test('принимает верный пароль и отклоняет неверный', () => {
  const hash = hashPassword('secret pass');
  expect(hash).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/);
  expect(verifyPassword('secret pass', hash)).toBe(true);
  expect(verifyPassword('wrong', hash)).toBe(false);
});

test('в хэше нет символа $: Next подставляет переменные в файлах .env и испортил бы значение', () => {
  expect(hashPassword('any')).not.toContain('$');
});

test('каждый хэш получает новую соль', () => {
  expect(hashPassword('same')).not.toBe(hashPassword('same'));
});

test('битый хэш безопасно отклоняется', () => {
  for (const stored of ['', 'plain', 'scrypt:bad:hex', 'scrypt:aa:bb', 'scrypt::']) {
    expect(verifyPassword('pass', stored)).toBe(false);
  }
});
