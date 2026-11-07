import type { Actor } from '../booking/types';
import type { Db } from '../db/client';
import { eq } from 'drizzle-orm';
import { bookings, clientChats, clients, notifications, services } from '../db/schema';
import { formatStudioDate, formatStudioTime } from '../lib/time';

export interface NotificationEvent {
  bookingId: number;
  actor: Actor;
  type: 'created' | 'moved' | 'cancelled';
  previousMasterId?: number;
}

export async function planNotifications(tx: Db, event: NotificationEvent): Promise<void> {
  const [row] = await tx
    .select({ booking: bookings, client: clients, service: services })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, event.bookingId));
  if (!row) throw new Error('booking missing for notification');
  const { booking, client, service } = row;
  const action =
    event.type === 'created'
      ? 'Запись создана'
      : event.type === 'moved'
        ? 'Запись перенесена'
        : 'Запись отменена';
  const when = `${formatStudioDate(booking.startsAt).split('-').reverse().join('.')} ${formatStudioTime(booking.startsAt)}`;
  const body = `${action}: ${client.name}, ${service.name}, ${when}`;
  let clientChannel: 'screen' | 'telegram' | 'journal' = 'screen';
  let clientStatus: 'sent' | 'pending' | 'not_connected' = 'sent';
  let clientBody = body;
  if (event.actor === 'manager' && event.type === 'created') {
    clientChannel = 'journal';
    clientStatus = 'not_connected';
    clientBody = `${body}. Менеджер сообщает клиенту во время звонка.`;
  } else if (event.actor === 'manager') {
    clientChannel = 'telegram';
    const [chat] = await tx
      .select({ chatId: clientChats.chatId })
      .from(clientChats)
      .where(eq(clientChats.bookingId, booking.id))
      .limit(1);
    clientStatus = chat ? 'pending' : 'not_connected';
    await tx
      .update(bookings)
      .set({ needsCall: chat ? null : 'changed' })
      .where(eq(bookings.id, booking.id));
  } else if (event.actor === 'client_bot') clientChannel = 'telegram';
  const masterIds = [
    ...new Set(
      [event.previousMasterId, booking.masterId].filter((id): id is number => id !== undefined),
    ),
  ];
  await tx
    .insert(notifications)
    .values([
      {
        bookingId: booking.id,
        recipient: 'client',
        channel: clientChannel,
        status: clientStatus,
        body: clientBody,
      },
      ...masterIds.map((masterId) => ({
        bookingId: booking.id,
        recipient: 'master' as const,
        masterId,
        channel: 'telegram' as const,
        status: 'pending' as const,
        body,
      })),
      { bookingId: booking.id, recipient: 'manager', channel: 'journal', status: 'sent', body },
    ]);
}
