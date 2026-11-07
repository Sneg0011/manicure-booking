import Link from 'next/link';
import { getDeps } from '../../../../lib/deps';
import { getCallList } from '../../../../booking/call-list';
import { markAdminWarnedAction } from '../../../actions/admin';
import { reasonText, when } from '../../../../admin/labels';

export default async function Page() {
  const rows = await getCallList(getDeps());
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">Связь · время Москвы</p>
      <h1>Позвонить</h1>
      {rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Причина</th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Мастер</th>
                <th>Услуга</th>
                <th>Дата и время</th>
                <th>Отметка</th>
                <th>Запись</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bookingId}>
                  <td>{reasonText[row.reason]}</td>
                  <td>{row.clientName}</td>
                  <td>
                    {row.clientPhone ? (
                      <a href={`tel:${row.clientPhone}`}>{row.clientPhone}</a>
                    ) : (
                      'Обезличено'
                    )}
                  </td>
                  <td>{row.masterName}</td>
                  <td>{row.serviceName}</td>
                  <td>{when(row.startsAt)}</td>
                  <td>
                    {row.warnedAt ? (
                      <>Менеджер предупредил · {when(row.warnedAt)}</>
                    ) : (
                      <form action={markAdminWarnedAction}>
                        <input type="hidden" name="bookingId" value={row.bookingId} />
                        <input type="hidden" name="returnTo" value="calls" />
                        <button type="submit">Менеджер предупредил</button>
                      </form>
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/admin/calendar?date=${when(row.startsAt).slice(0, 10)}&booking=${row.bookingId}`}
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Сейчас звонить некому</p>
      )}
    </div>
  );
}
