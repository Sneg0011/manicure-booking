import { sql } from 'drizzle-orm';
import type { Deps } from './types';

export async function anonymizeExpired(deps: Deps, years = 3): Promise<number> {
  if (!Number.isInteger(years) || years < 1) throw new Error('years must be a positive integer');
  const now = deps.now();
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return deps.db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      update clients c set name = 'Обезличено', phone = null, anonymized_at = ${now}
      where c.anonymized_at is null
        and not exists (select 1 from bookings b where b.client_id = c.id and b.status = 'active' and b.starts_at > ${now})
        and coalesce((select max(b.starts_at) from bookings b where b.client_id = c.id), c.created_at) < ${cutoff}
      returning c.id`);
    const ids = result.rows.map((row) => Number(row.id));
    if (!ids.length) return 0;
    const idList = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );
    await tx.execute(
      sql`delete from client_chats where booking_id in (select id from bookings where client_id in (${idList}))`,
    );
    await tx.execute(sql`update notifications set body = 'Текст удалён по сроку хранения'
      where booking_id in (select id from bookings where client_id in (${idList}))`);
    return ids.length;
  });
}
