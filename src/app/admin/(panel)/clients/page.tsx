import Link from 'next/link';
import { getDeps } from '../../../../lib/deps';
import { getClientCard, listClients } from '../../../../admin/clients';
import { actorText, statusText, when } from '../../../../admin/labels';
import { formatStudioDate } from '../../../../lib/time';

const eventText: Record<string, string> = {
  created: 'Создана запись',
  moved: 'Перенесена запись',
  cancelled: 'Отменена запись',
  visit_result: 'Отмечен визит',
  warned: 'Менеджер предупредил',
  unwarned: 'Отметка снята',
};
function eventDetails(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '—';
  const labels: Record<string, string> = {
    startsAt: 'время',
    masterId: 'мастер №',
    status: 'статус',
    reason: 'причина',
  };
  return (
    Object.entries(value)
      .map(([key, item]) => {
        let text = String(item ?? '—');
        if (key === 'startsAt' && typeof item === 'string') text = when(new Date(item));
        if (key === 'status' && item && typeof item === 'string' && item in statusText)
          text = statusText[item as keyof typeof statusText];
        return `${labels[key] || 'изменение'}: ${text}`;
      })
      .join(', ') || '—'
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const id = Number(params.id);
  const card = Number.isSafeInteger(id) && id > 0 ? await getClientCard(getDeps(), id) : null;
  const rows = card || params.id ? [] : await listClients(getDeps(), params.q || '');
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">База · время Москвы</p>
      <h1>Клиенты</h1>
      <p>Демо-данные</p>
      {card ? (
        <>
          <p>
            <Link href="/admin/clients">← Все клиенты</Link>
          </p>
          <h2>{card.name}</h2>
          <p>{card.phone ? <a href={`tel:${card.phone}`}>{card.phone}</a> : 'Обезличено'}</p>
          <h2>Записи</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Услуга</th>
                  <th>Мастер</th>
                  <th>Статус</th>
                  <th>Карточка</th>
                </tr>
              </thead>
              <tbody>
                {card.bookings.map((row) => (
                  <tr key={row.id}>
                    <td>{when(row.startsAt)}</td>
                    <td>{row.serviceName}</td>
                    <td>{row.masterName}</td>
                    <td>{statusText[row.status]}</td>
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
          <h2>История</h2>
          <ul className="admin-history">
            {card.history.map((event) => (
              <li key={event.id}>
                {when(event.createdAt)} · Запись #{event.bookingId} · {actorText[event.actor]} ·{' '}
                {eventText[event.type] || 'Изменение записи'} · Было: {eventDetails(event.before)} ·
                Стало: {eventDetails(event.after)}
              </li>
            ))}
          </ul>
        </>
      ) : params.id ? (
        <p>Клиент не найден</p>
      ) : (
        <>
          <form method="get" className="admin-search">
            <label>
              Поиск по имени или телефону <input name="q" defaultValue={params.q || ''} />
            </label>
            <button type="submit">Найти</button>
          </form>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Телефон</th>
                  <th>Следующая запись</th>
                  <th>Прошлых визитов</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/clients?id=${row.id}`}>{row.name}</Link>
                    </td>
                    <td>
                      {row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : 'Обезличено'}
                    </td>
                    <td>{row.nextBooking ? when(row.nextBooking) : '—'}</td>
                    <td>{row.pastVisits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p>Клиенты не найдены</p>}
        </>
      )}
    </div>
  );
}
