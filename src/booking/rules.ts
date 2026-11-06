import type { BookingRules, Deps } from './types';

export const MANAGER_STEP_MIN = 5;

export async function getRules(deps: Deps): Promise<BookingRules> {
  throw new Error('not implemented');
}
