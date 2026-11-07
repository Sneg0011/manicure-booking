import { createHash, timingSafeEqual } from 'node:crypto';
import type { Deps } from '../booking/types';
import { anonymizeExpired } from '../booking/retention';
import { resetDemo } from './reset';

export async function handleDailyCron(
  request: Request,
  deps: Deps,
  env: { CRON_SECRET?: string; DEMO_MODE?: string },
): Promise<Response> {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const actual = digest(request.headers.get('authorization') ?? '');
  const expected = digest(`Bearer ${env.CRON_SECRET ?? ''}`);
  if (!env.CRON_SECRET || !timingSafeEqual(actual, expected)) {
    return new Response(null, { status: 401 });
  }
  const anonymized = await anonymizeExpired(deps);
  const reset = env.DEMO_MODE === 'true';
  if (reset) await resetDemo(deps);
  return Response.json({ anonymized, reset });
}
