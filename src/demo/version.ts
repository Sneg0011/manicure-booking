import { sql } from 'drizzle-orm';
import type { Deps } from '../booking/types';
export async function getDemoVersion(deps: Deps): Promise<string> {
  const result = await deps.db.execute(
    sql`select xmin::text as version from settings where id = 1`,
  );
  return String(result.rows[0]?.version ?? 'missing');
}
