import Link from 'next/link';
import { getDeps } from '../../../../lib/deps';
import { listNotifications } from '../../../../admin/journal';
import { when } from '../../../../admin/labels';

const recipients = { client: 'Клиент', master: 'Мастер', manager: 'Менеджер' };
const channels = { screen: 'Экран', telegram: 'Telegram', journal: 'Журнал' };
const statuses = {
  sent: 'Отправлено',
  failed: 'Ошибка',
  not_connected: 'Бот не подключён',
  suppressed: 'Сверх лимита',
  pending: 'В очереди',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; onlyFailed?: string }>;
}) {
  const params = await searchParams;
  const onlyFailed = params.onlyFailed === '1';
  const result = await listNotifications(getDeps(), { page: Number(params.page) || 1, onlyFailed });
  const href = (page: number) =>
    `/admin/journal?${new URLSearchParams({ page: String(page), ...(onlyFailed ? { onlyFailed: '1' } : {}) })}`;
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">Сообщения · время Москвы</p>
      <h1>Журнал</h1>
      <p>
        <Link href="/admin/journal">Все</Link> ·{' '}
        <Link href="/admin/journal?onlyFailed=1">Только ошибки</Link>
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Кому</th>
              <th>Канал</th>
              <th>Статус</th>
              <th>Текст</th>
              <th>Ошибка</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((row) => (
              <tr key={row.id}>
                <td>
                  {recipients[row.recipient]}
                  {row.recipient === 'master' && row.masterName ? ` ${row.masterName}` : ''}
                </td>
                <td>{channels[row.channel]}</td>
                <td>{statuses[row.status]}</td>
                <td>{row.body}</td>
                <td>{row.status === 'failed' ? row.error || '—' : '—'}</td>
                <td>{when(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.items.length && <p>Уведомлений нет</p>}
      <nav className="admin-pagination">
        {result.page > 1 && <Link href={href(result.page - 1)}>Назад</Link>}
        <span>
          Страница {result.page} из {Math.max(1, result.pages)}
        </span>
        {result.page < result.pages && <Link href={href(result.page + 1)}>Дальше</Link>}
      </nav>
    </div>
  );
}
