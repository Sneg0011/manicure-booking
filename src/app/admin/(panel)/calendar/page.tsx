import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { and, eq, gte, lt, asc } from 'drizzle-orm';
import { getDeps } from '../../../../lib/deps';
import {
  formatStudioDate,
  formatStudioTime,
  fromStudioTime,
  studioWeekday,
} from '../../../../lib/time';
import {
  bookings,
  bookingEvents,
  clients,
  closures,
  masters,
  services,
  workingHours,
} from '../../../../db/schema';
import {
  createAdminBookingAction,
  moveAdminBookingAction,
  cancelAdminBookingAction,
  setAdminVisitAction,
} from '../../../actions/admin';
import { WarnedCheck } from '../warned-check';

type Params = { date?: string; view?: string; booking?: string; error?: string };
const statusText = {
  active: 'Активна',
  cancelled: 'Отменена',
  attended: 'Пришла',
  no_show: 'Не пришла',
};
const actorText = {
  manager: 'Менеджер',
  client_site: 'Клиент на сайте',
  client_bot: 'Клиент в боте',
  system: 'Система',
};
const typeText: Record<string, string> = {
  created: 'создал запись',
  moved: 'перенёс запись',
  cancelled: 'отменил запись',
  visit_result: 'отметил визит',
  warned: 'отметил предупреждение',
  unwarned: 'Отметка снята',
};
const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function mins(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
function timeLabel(date: Date): string {
  return `${formatStudioDate(date)} ${formatStudioTime(date)}`;
}
function field(key: string, value: unknown, masterNames: Map<number, string>): string {
  if (value === null || value === undefined) return '—';
  if (key === 'masterId' && typeof value === 'number') return masterNames.get(value) ?? '—';
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.includes('T'))
    return timeLabel(new Date(value));
  if (value === 'active' || value === 'cancelled' || value === 'attended' || value === 'no_show')
    return statusText[value];
  return String(value);
}
function changes(value: unknown, masterNames: Map<number, string>): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '—';
  const labels: Record<string, string> = {
    startsAt: 'время',
    masterId: 'мастер',
    status: 'статус',
    reason: 'причина',
  };
  return (
    Object.entries(value)
      .filter(([key]) => key in labels)
      .map(([key, entry]) => `${labels[key]}: ${field(key, entry, masterNames)}`)
      .join(', ') || '—'
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const deps = getDeps();
  const today = formatStudioDate(deps.now());
  const date =
    params.date &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date) &&
    !Number.isNaN(Date.parse(`${params.date}T12:00:00Z`))
      ? params.date
      : today;
  const view = params.view === 'week' ? 'week' : 'day';
  const first =
    view === 'week'
      ? addDays(date, -((studioWeekday(fromStudioTime(date, '12:00')) + 6) % 7))
      : date;
  const dates = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(first, i));
  const last = addDays(dates.at(-1)!, 1);
  const db = deps.db;
  const [masterRows, serviceRows, hourRows, bookingRows, closureRows] = await Promise.all([
    db
      .select({ id: masters.id, name: masters.name })
      .from(masters)
      .where(eq(masters.isActive, true))
      .orderBy(asc(masters.sort)),
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(asc(services.sort)),
    db
      .select({
        masterId: workingHours.masterId,
        weekday: workingHours.weekday,
        opensAt: workingHours.opensAt,
        closesAt: workingHours.closesAt,
      })
      .from(workingHours),
    db
      .select({
        id: bookings.id,
        masterId: bookings.masterId,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
        clientName: clients.name,
        serviceName: services.name,
      })
      .from(bookings)
      .innerJoin(clients, eq(bookings.clientId, clients.id))
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(
        and(
          gte(bookings.startsAt, fromStudioTime(first, '00:00')),
          lt(bookings.startsAt, fromStudioTime(last, '00:00')),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    db
      .select({
        masterId: closures.masterId,
        startsAt: closures.startsAt,
        endsAt: closures.endsAt,
        reason: closures.reason,
      })
      .from(closures)
      .where(
        and(
          lt(closures.startsAt, fromStudioTime(last, '00:00')),
          gte(closures.endsAt, fromStudioTime(first, '00:00')),
        ),
      ),
  ]);
  const masterNames = new Map(masterRows.map((master) => [master.id, master.name]));
  const bookingId = Number(params.booking);
  const [detail] =
    Number.isSafeInteger(bookingId) && bookingId > 0
      ? await db
          .select({
            id: bookings.id,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            priceRub: bookings.priceRub,
            status: bookings.status,
            source: bookings.source,
            moveCount: bookings.moveCount,
            warnedAt: bookings.warnedAt,
            masterId: bookings.masterId,
            masterName: masters.name,
            serviceName: services.name,
            clientName: clients.name,
            clientPhone: clients.phone,
          })
          .from(bookings)
          .innerJoin(masters, eq(bookings.masterId, masters.id))
          .innerJoin(services, eq(bookings.serviceId, services.id))
          .innerJoin(clients, eq(bookings.clientId, clients.id))
          .where(eq(bookings.id, bookingId))
          .limit(1)
      : [];
  const events = detail
    ? await db
        .select({
          actor: bookingEvents.actor,
          type: bookingEvents.type,
          before: bookingEvents.before,
          after: bookingEvents.after,
          createdAt: bookingEvents.createdAt,
        })
        .from(bookingEvents)
        .where(eq(bookingEvents.bookingId, detail.id))
        .orderBy(asc(bookingEvents.createdAt))
    : [];
  const href = (value: string, mode = view, id?: number) =>
    `/admin/calendar?${new URLSearchParams({ date: value, view: mode, ...(id ? { booking: String(id) } : {}) })}`;
  const step = view === 'week' ? 7 : 1;
  const hoursFor = (day: string, masterId: number) =>
    hourRows.find(
      (row) =>
        row.masterId === masterId && row.weekday === studioWeekday(fromStudioTime(day, '12:00')),
    );
  const dayBookings = (day: string, masterId: number) =>
    bookingRows.filter(
      (row) => row.masterId === masterId && formatStudioDate(row.startsAt) === day,
    );
  const dayClosures = (day: string, masterId: number) =>
    closureRows.filter(
      (row) =>
        row.masterId === masterId &&
        row.startsAt < fromStudioTime(addDays(day, 1), '00:00') &&
        row.endsAt > fromStudioTime(day, '00:00'),
    );
  const opens = masterRows
    .map((master) => hoursFor(date, master.id)?.opensAt)
    .filter((v): v is string => !!v)
    .map(mins);
  const closes = masterRows
    .map((master) => hoursFor(date, master.id)?.closesAt)
    .filter((v): v is string => !!v)
    .map(mins);
  const opening = opens.length ? Math.min(...opens) : 600;
  const closing = closes.length ? Math.max(...closes) : 1320;
  const top = (moment: Date) => Math.max(0, (mins(formatStudioTime(moment)) - opening) * 1.2);
  const height = (start: Date, end: Date) =>
    Math.max(26, ((end.getTime() - start.getTime()) / 60000) * 1.2);
  return (
    <div className="admin-calendar-page">
      <header className="admin-calendar-head">
        <div>
          <p className="admin-eyebrow">Записи · время Москвы</p>
          <h1>Календарь</h1>
        </div>
        <details className="admin-new" open={!!params.error && !detail}>
          <summary role="button">Новая запись</summary>
          <form action={createAdminBookingAction} className="admin-form">
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label>
              Услуга
              <select name="serviceId" required>
                {serviceRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Мастер
              <select name="masterId" required>
                {masterRows.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дата
              <input name="newDate" type="date" defaultValue={date} required />
            </label>
            <label>
              Время
              <input name="time" type="time" step="300" defaultValue="10:00" required />
            </label>
            <label>
              Имя
              <input name="name" minLength={2} maxLength={60} required />
              {params.error === 'Укажите имя от 2 до 60 символов' && (
                <span className="field-error">{params.error}</span>
              )}
            </label>
            <label>
              Телефон
              <input name="phone" type="tel" required />
              {params.error === 'Укажите телефон в правильном формате' && (
                <span className="field-error">{params.error}</span>
              )}
            </label>
            <button type="submit">Создать запись</button>
          </form>
        </details>
      </header>
      <div className="admin-controls">
        <div className="admin-view">
          <Link aria-current={view === 'day' ? 'page' : undefined} href={href(date, 'day')}>
            День
          </Link>
          <Link aria-current={view === 'week' ? 'page' : undefined} href={href(date, 'week')}>
            Неделя
          </Link>
        </div>
        <div className="admin-date-controls">
          <Link aria-label="Назад" href={href(addDays(date, -step))}>
            ←
          </Link>
          <strong>{view === 'week' ? `${dates[0]} — ${dates[6]}` : date}</strong>
          <Link aria-label="Вперёд" href={href(addDays(date, step))}>
            →
          </Link>
          <Link href={href(today)}>Сегодня</Link>
        </div>
      </div>
      {params.error ? (
        <p className="admin-error" role="alert">
          {params.error}
        </p>
      ) : null}
      <div className={`admin-calendar-content ${detail ? 'has-detail' : ''}`}>
        <div
          className="admin-calendar-scroll"
          aria-label={view === 'day' ? 'Календарь на день' : 'Календарь на неделю'}
        >
          {view === 'day' ? (
            <div className="admin-day-grid">
              <div className="admin-time-head">МСК</div>
              {masterRows.map((master) => (
                <div className="admin-master-head" key={master.id}>
                  {master.name}
                  {!hoursFor(date, master.id) && <small>выходной</small>}
                </div>
              ))}
              <div className="admin-time-axis" style={{ height: (closing - opening) * 1.2 }}>
                {Array.from({ length: Math.floor((closing - opening) / 60) + 1 }, (_, i) => (
                  <span key={i} style={{ top: i * 72 }}>
                    {String(Math.floor(opening / 60) + i).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
              {masterRows.map((master) => {
                const hours = hoursFor(date, master.id);
                return (
                  <div
                    className="admin-day-track"
                    key={master.id}
                    style={{ height: (closing - opening) * 1.2 }}
                  >
                    {!hours && <div className="admin-closed-all">Выходной</div>}
                    {hours && (
                      <div
                        className="admin-open-range"
                        style={{
                          top: (mins(hours.opensAt) - opening) * 1.2,
                          height: (mins(hours.closesAt) - mins(hours.opensAt)) * 1.2,
                        }}
                      />
                    )}
                    {dayClosures(date, master.id).map((closed, i) => (
                      <div
                        key={i}
                        className="admin-closure"
                        style={{
                          top: top(closed.startsAt),
                          height: height(closed.startsAt, closed.endsAt),
                        }}
                      >
                        Закрытое время{closed.reason ? ` · ${closed.reason}` : ''}
                      </div>
                    ))}
                    {dayBookings(date, master.id)
                      .filter((b) => b.status !== 'cancelled')
                      .map((b) => (
                        <Link
                          key={b.id}
                          className={`admin-booking status-${b.status}`}
                          style={{ top: top(b.startsAt), height: height(b.startsAt, b.endsAt) }}
                          href={href(date, view, b.id)}
                        >
                          <b>
                            {formatStudioTime(b.startsAt)} {b.clientName}
                          </b>
                          <span>{b.serviceName}</span>
                        </Link>
                      ))}
                    {dayBookings(date, master.id)
                      .filter((b) => b.status === 'cancelled')
                      .map((b) => (
                        <Link
                          key={b.id}
                          className="admin-booking-cancelled"
                          href={href(date, view, b.id)}
                        >
                          {formatStudioTime(b.startsAt)} {b.clientName} · Отменена
                        </Link>
                      ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-week-grid">
              {dates.map((day) => (
                <section key={day} className="admin-week-day">
                  <h2>
                    {weekdays[studioWeekday(fromStudioTime(day, '12:00'))]} · {day}
                  </h2>
                  {masterRows.map((master) => (
                    <div key={master.id}>
                      <h3>{master.name}</h3>
                      {!hoursFor(day, master.id) ? (
                        <p>Выходной</p>
                      ) : dayBookings(day, master.id).length === 0 ? (
                        <p>Записей нет</p>
                      ) : (
                        dayBookings(day, master.id).map((b) => (
                          <Link
                            key={b.id}
                            className={`admin-week-booking status-${b.status}`}
                            href={href(day, view, b.id)}
                          >
                            {formatStudioTime(b.startsAt)} · {b.clientName}
                          </Link>
                        ))
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
        {detail && (
          <aside className="admin-detail">
            <h2>Запись #{detail.id}</h2>
            <dl>
              <dt>Услуга</dt>
              <dd>{detail.serviceName}</dd>
              <dt>Мастер</dt>
              <dd>{detail.masterName}</dd>
              <dt>Клиент</dt>
              <dd>{detail.clientName}</dd>
              <dt>Телефон</dt>
              <dd>
                {detail.clientPhone ? (
                  <a href={`tel:${detail.clientPhone}`}>{detail.clientPhone}</a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Дата</dt>
              <dd>{formatStudioDate(detail.startsAt)}</dd>
              <dt>Время</dt>
              <dd>
                {formatStudioTime(detail.startsAt)}–{formatStudioTime(detail.endsAt)}
              </dd>
              <dt>Цена</dt>
              <dd>{detail.priceRub.toLocaleString('ru-RU')} ₽</dd>
              <dt>Статус</dt>
              <dd>{statusText[detail.status]}</dd>
              <dt>Источник</dt>
              <dd>{detail.source === 'site' ? 'Сайт' : 'Менеджер'}</dd>
              <dt>Переносов</dt>
              <dd>{detail.moveCount}</dd>
            </dl>
            <div className="admin-detail-actions">
              {detail.status === 'active' && (
                <>
                  <details>
                    <summary role="button">Перенести</summary>
                    <form action={moveAdminBookingAction} className="admin-form">
                      <ContextFields date={date} view={view} id={detail.id} />
                      <label>
                        Дата
                        <input
                          type="date"
                          name="newDate"
                          defaultValue={formatStudioDate(detail.startsAt)}
                          required
                        />
                      </label>
                      <label>
                        Время
                        <input
                          type="time"
                          name="time"
                          step="300"
                          defaultValue={formatStudioTime(detail.startsAt)}
                          required
                        />
                      </label>
                      <label>
                        Мастер
                        <select name="masterId" defaultValue={detail.masterId}>
                          {masterRows.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit">Сохранить перенос</button>
                    </form>
                  </details>
                  <form action={cancelAdminBookingAction} className="admin-form">
                    <ContextFields date={date} view={view} id={detail.id} />
                    <label>
                      Причина отмены
                      <input name="reason" />
                    </label>
                    <button type="submit">Отменить</button>
                  </form>
                </>
              )}
              {detail.status === 'active' && detail.startsAt <= deps.now() && (
                <form action={setAdminVisitAction}>
                  <ContextFields date={date} view={view} id={detail.id} />
                  <button type="submit" name="result" value="attended">
                    Пришла
                  </button>
                  <button type="submit" name="result" value="no_show">
                    Не пришла
                  </button>
                </form>
              )}
              <WarnedCheck
                bookingId={detail.id}
                warnedAt={detail.warnedAt}
                date={date}
                view={view}
              />
            </div>
            <h3>История</h3>
            <ol className="admin-events">
              {events.map((event, i) => (
                <li key={i}>
                  <b>
                    {actorText[event.actor]} {typeText[event.type] ?? event.type}
                  </b>
                  <time>{timeLabel(event.createdAt)}</time>
                  <div>Было: {changes(event.before, masterNames)}</div>
                  <div>Стало: {changes(event.after, masterNames)}</div>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}

function ContextFields({ date, view, id }: { date: string; view: string; id: number }) {
  return (
    <>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="bookingId" value={id} />
    </>
  );
}
