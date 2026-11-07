import { and, eq, lt, sql } from 'drizzle-orm';
import { requestLog } from '../db/schema';
import type { Deps } from '../booking/types';
import type { Db } from '../db/client';

export async function hit(
  deps: Deps,
  key: string,
  limit: number,
  windowMin: number,
): Promise<boolean> {
  const cutoff = new Date(deps.now().getTime() - windowMin * 60_000);
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    await tx
      .delete(requestLog)
      .where(and(eq(requestLog.key, key), lt(requestLog.createdAt, cutoff)));
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(requestLog)
      .where(eq(requestLog.key, key));
    if (count >= limit) return false;
    await tx.insert(requestLog).values({ key, createdAt: deps.now() });
    return true;
  });
}
