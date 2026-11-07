import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const SESSION_COOKIE = 'manager_session';
export const SESSION_SECONDS = 12 * 60 * 60;

function key(secret?: string): Uint8Array | null {
  return secret && secret.length >= 16 ? new TextEncoder().encode(secret) : null;
}

export async function createSession(secret?: string, now = new Date()): Promise<string> {
  const signingKey = key(secret);
  if (!signingKey) throw new Error('Session unavailable');
  return new SignJWT({ role: 'manager' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + SESSION_SECONDS)
    .sign(signingKey);
}

export async function verifySession(
  token?: string,
  secret?: string,
  now = new Date(),
): Promise<boolean> {
  const signingKey = key(secret);
  if (!token || !signingKey) return false;
  try {
    const { payload } = await jwtVerify(token, signingKey, {
      algorithms: ['HS256'],
      currentDate: now,
      requiredClaims: ['iat', 'exp'],
    });
    return (
      payload.role === 'manager' &&
      typeof payload.exp === 'number' &&
      payload.exp > now.getTime() / 1000
    );
  } catch {
    return false;
  }
}

export async function managerSessionValid(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, process.env.SESSION_SECRET);
}

export async function requireManager(): Promise<void> {
  if (!(await managerSessionValid())) redirect('/admin/login');
}

export function managerAction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args): Promise<Result> => {
    if (!(await managerSessionValid())) throw new Error('Доступ запрещён');
    return fn(...args);
  };
}

export async function setManagerCookie(token: string): Promise<void> {
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
    secure,
  });
}

export async function clearManagerCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
