import type { Deps, Slot } from './types';

export async function getAvailability(
  deps: Deps,
  input: { serviceId: number; masterId: number | null; date: string },
): Promise<Slot[]> {
  throw new Error('not implemented');
}
