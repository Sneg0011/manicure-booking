import type { Deps } from '../booking/types';
import type { MessageSender } from './sender';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { bookings, clientChats, masters, notifications } from '../db/schema';
import { formatStudioDate, fromStudioTime } from '../lib/time';
import { nextStudioDate } from '../booking/rules';

export async function deliverPending(deps: Deps, sender: MessageSender): Promise<void> {
  // Capture the queue boundary so a concurrent producer cannot make this an unbounded loop.
  const [{ maxId }] = await deps.db
    .select({ maxId: sql<number>`coalesce(max(${notifications.id}), 0)` })
    .from(notifications);
  while (true) {
    const claimed = await deps.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.status, 'pending'), sql`${notifications.id} <= ${maxId}`))
        .orderBy(notifications.id)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!item) return false;
      let status: 'sent' | 'failed' | 'not_connected' | 'suppressed' = 'sent';
      let error: string | null = null;
      try {
        if (item.recipient === 'master') {
          const [master] = await tx
            .select({ chatId: masters.telegramChatId })
            .from(masters)
            .where(eq(masters.id, item.masterId!));
          if (!master?.chatId) status = 'not_connected';
          else {
            const date = formatStudioDate(deps.now());
            const [count] = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(notifications)
              .where(
                and(
                  eq(notifications.masterId, item.masterId!),
                  eq(notifications.status, 'sent'),
                  gte(notifications.sentAt, fromStudioTime(date, '00:00')),
                  lt(notifications.sentAt, fromStudioTime(nextStudioDate(date), '00:00')),
                ),
              );
            if (count.n >= 30) status = 'suppressed';
            else await sender.send(master.chatId, item.body);
          }
        } else if (item.recipient === 'client') {
          const chats = await tx
            .select({ chatId: clientChats.chatId })
            .from(clientChats)
            .where(eq(clientChats.bookingId, item.bookingId!));
          if (!chats.length) status = 'not_connected';
          else {
            let firstError: unknown;
            for (const chat of chats) {
              try {
                await sender.send(chat.chatId, item.body);
              } catch (cause) {
                firstError ??= cause;
              }
            }
            if (firstError !== undefined) throw firstError;
          }
        }
      } catch (cause) {
        status = 'failed';
        error = (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
      }
      await tx
        .update(notifications)
        .set({ status, error, sentAt: status === 'sent' ? deps.now() : null })
        .where(eq(notifications.id, item.id));
      if (
        item.recipient === 'client' &&
        (status === 'failed' || status === 'not_connected') &&
        item.bookingId
      )
        await tx
          .update(bookings)
          .set({ needsCall: 'changed' })
          .where(eq(bookings.id, item.bookingId));
      return true;
    });
    if (!claimed) return;
  }
}
