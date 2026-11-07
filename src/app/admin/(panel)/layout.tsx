import Link from 'next/link';
import { requireManager } from '../../../auth/session';
import { logoutAction } from '../../actions/admin';

const navigation = [
  ['/admin', 'Сводка'],
  ['/admin/calendar', 'Календарь'],
  ['/admin/calls', 'Позвонить'],
  ['/admin/clients', 'Клиенты'],
  ['/admin/schedule', 'Расписание'],
  ['/admin/services', 'Услуги'],
  ['/admin/journal', 'Журнал'],
] as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireManager();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin/calendar" className="admin-brand">
          Лунка <small>Управление</small>
        </Link>
        <nav aria-label="Панель менеджера">
          {navigation.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction}>
          <button type="submit">Выйти</button>
        </form>
        <p className="admin-demo">Демо-данные: записи вымышленные</p>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
