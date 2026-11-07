import { createHash } from 'node:crypto';
import type { Deps } from '../booking/types';
import { hit } from '../lib/rate-limit';
import { verifyPassword } from './password';

export const BAD_LOGIN = 'Неверный логин или пароль';
export const TOO_MANY_LOGINS = 'Слишком много попыток, попробуйте позже';

export async function checkLogin(
  deps: Deps,
  ip: string,
  login: string,
  password: string,
  config: { login?: string; passwordHash?: string; sessionSecret?: string } = {
    login: process.env.MANAGER_LOGIN,
    passwordHash: process.env.MANAGER_PASSWORD_HASH,
    sessionSecret: process.env.SESSION_SECRET,
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ipHash = createHash('sha256').update(ip).digest('hex');
  if (!(await hit(deps, `login:${ipHash}`, 5, 15))) return { ok: false, error: TOO_MANY_LOGINS };
  if (
    !config.sessionSecret ||
    config.sessionSecret.length < 16 ||
    !config.login ||
    !config.passwordHash ||
    login !== config.login ||
    !verifyPassword(password, config.passwordHash)
  )
    return { ok: false, error: BAD_LOGIN };
  return { ok: true };
}
