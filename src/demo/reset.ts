import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { Deps } from '../booking/types';
import { masters, settings } from '../db/schema';
import { demoMasters } from './catalog';
import { seedDemo } from './seed';

export async function resetDemo(deps: Deps): Promise<void> {
  await deps.db.transaction(async (tx) => {
    await tx.execute(sql`truncate table booking_events, notifications, client_chats, bookings, clients,
      closures, request_log, master_services, working_hours, services restart identity`);
    await tx.execute(sql`delete from masters where id not in (1, 2)`);
    for (const master of demoMasters) await tx.insert(masters).values({ ...master, isActive: true })
      .onConflictDoUpdate({ target: masters.id, set: { name: master.name, bio: master.bio,
        photo: master.photo, isActive: true, sort: master.sort } });
    await tx.execute(sql`select setval(pg_get_serial_sequence('masters', 'id'), (select max(id) from masters))`);
    await tx.delete(settings);
    await tx.insert(settings).values({ id: 1 });
    await seedDemo({ ...deps, db: tx as unknown as Db });
  });
}
