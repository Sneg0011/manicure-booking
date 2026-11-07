import { desc, eq, sql } from 'drizzle-orm';
import type { Deps } from '../booking/types';
import { masters, notifications } from '../db/schema';

export async function listNotifications(
  deps: Deps,
  options: { page: number; onlyFailed: boolean },
) {
  const page = Number.isSafeInteger(options.page) && options.page > 0 ? options.page : 1;
  const condition = options.onlyFailed ? eq(notifications.status, 'failed') : undefined;
  const [items, count] = await Promise.all([
    deps.db
      .select({
        id: notifications.id,
        bookingId: notifications.bookingId,
        recipient: notifications.recipient,
        masterName: masters.name,
        channel: notifications.channel,
        body: notifications.body,
        status: notifications.status,
        error: notifications.error,
        createdAt: notifications.createdAt,
        sentAt: notifications.sentAt,
      })
      .from(notifications)
      .leftJoin(masters, eq(notifications.masterId, masters.id))
      .where(condition)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(50)
      .offset((page - 1) * 50),
    deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(condition),
  ]);
  return { items, page, total: count[0].count, pages: Math.ceil(count[0].count / 50) };
}
