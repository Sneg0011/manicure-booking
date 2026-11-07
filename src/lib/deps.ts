import type { Deps } from '../booking/types';
import { createDb } from '../db/client';

let shared: ReturnType<typeof createDb> | undefined;

export function getDeps(): Deps {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL обязательна');
    shared = createDb(url);
  }
  return { db: shared.db, now: () => new Date() };
}
