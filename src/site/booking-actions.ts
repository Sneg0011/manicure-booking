import { createHash } from 'node:crypto';
import { createBooking } from '../booking/service';
import type { Deps, Result, CreatedBooking } from '../booking/types';
import { hit } from '../lib/rate-limit';

export type SubmitInput = Omit<Parameters<typeof createBooking>[1], 'actor'>;
export type SubmitResult = Result<CreatedBooking> | { ok: false; error: 'rate_limited' };

export async function submitBooking(
  deps: Deps,
  input: SubmitInput,
  ip: string,
  limits: { perHour: number } = { perHour: 5 },
): Promise<SubmitResult> {
  const key = `book:${createHash('sha256').update(ip).digest('hex')}`;
  if (!(await hit(deps, key, limits.perHour, 60))) return { ok: false, error: 'rate_limited' };
  return createBooking(deps, { ...input, actor: 'client_site' });
}
