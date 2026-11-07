import Link from 'next/link';
import { and, asc, eq, gt } from 'drizzle-orm';
import { getDeps } from '../../../lib/deps';
import { getSummary } from '../../../booking/summary';
import { bookings, clients, masters, services } from '../../../db/schema';
import { when } from '../../../admin/labels';
import { formatStudioDate } from '../../../lib/time';

export default async function AdminPage() {
  const deps = getDeps();
  const [summary, upcoming] = await Promise.all([
    getSummary(deps),
    deps.db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        clientName: clients.name,
        masterName: masters.name,
        serviceName: services.name,
      })
      .from(bookings)
      .innerJoin(clients, eq(bookings.clientId, clients.id))
      .innerJoin(masters, eq(bookings.masterId, masters.id))
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(and(eq(bookings.status, 'active'), gt(bookings.startsAt, deps.now())))
      .orderBy(asc(bookings.startsAt))
      .limit(5),
  ]);
  const share =
    summary.bookingsSelf + summary.bookingsManager
      ? Math.round((summary.bookingsSelf * 100) / (summary.bookingsSelf + summary.bookingsManager))
      : 0;
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">Панель · время Москвы</p>
      <h1>Сводка</h1>
      <p>Считается по демо-записям</p>
      <div className="admin-stats">
        {[
          ['Записались сами', summary.bookingsSelf],
          ['Записал менеджер', summary.bookingsManager],
          ['Изменили сами', summary.changesSelf],
          ['Изменил менеджер', summary.changesManager],
          ['Осталось позвонить', summary.callsLeft],
          ['Доля самостоятельных записей', `${share}%`],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h2>Ближайшие записи</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Имя</th>
              <th>Мастер</th>
              <th>Услуга</th>
              <th>Запись</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((row) => (
              <tr key={row.id}>
                <td>{when(row.startsAt)}</td>
                <td>{row.clientName}</td>
                <td>{row.masterName}</td>
                <td>{row.serviceName}</td>
                <td>
                  <Link
                    href={`/admin/calendar?date=${formatStudioDate(row.startsAt)}&booking=${row.id}`}
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/admin/calls">Позвонить →</Link>
      </p>
    </div>
  );
}
