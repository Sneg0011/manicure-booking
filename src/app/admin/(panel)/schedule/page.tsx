import Link from 'next/link';
import { getDeps } from '../../../../lib/deps';
import { getRules, getSchedule } from '../../../../admin/schedule';
import { formatStudioDate, formatStudioTime } from '../../../../lib/time';
import {
  addClosureAction,
  removeClosureAction,
  setHoursAction,
  setRulesAction,
} from '../../../actions/admin-settings';

const days = [
  [1, 'Понедельник'],
  [2, 'Вторник'],
  [3, 'Среда'],
  [4, 'Четверг'],
  [5, 'Пятница'],
  [6, 'Суббота'],
  [0, 'Воскресенье'],
] as const;
const fields = [
  ['slotStepMin', 'Шаг слотов', 'Интервал между предлагаемыми временами, минуты'],
  ['minLeadMin', 'Запас до записи', 'За сколько минут до визита можно записаться'],
  ['horizonDays', 'Горизонт записи', 'На сколько дней вперёд доступна запись'],
  ['changeCutoffMin', 'Срок изменений', 'За сколько минут до визита клиент может изменить запись'],
  ['maxClientMoves', 'Лимит переносов', 'Сколько раз клиент может перенести одну запись'],
] as const;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; conflicts?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const deps = getDeps();
  const [schedule, rules] = await Promise.all([getSchedule(deps), getRules(deps)]);
  const today = formatStudioDate(deps.now());
  return (
    <div className="admin-list-page">
      <p className="admin-eyebrow">Время Москвы · МСК</p>
      <h1>Расписание</h1>
      {params.error && (
        <p role="alert" className="admin-error">
          {params.error}
        </p>
      )}
      {params.saved && (
        <p role="status">
          Сохранено
          {params.conflicts ? (
            <>
              {' '}
              · Записей в конфликте: {params.conflicts}. <Link href="/admin/calls">Позвонить</Link>
            </>
          ) : null}
        </p>
      )}
      <h2>Часы работы</h2>
      {schedule.masters.map((master) => (
        <section key={master.id} className="admin-settings-section">
          <h3>{master.name}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Открытие</th>
                  <th>Закрытие</th>
                  <th>Выходной</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {days.map(([weekday, label]) => {
                  const row = schedule.hours.find(
                    (x) => x.masterId === master.id && x.weekday === weekday,
                  );
                  return (
                    <tr key={weekday}>
                      <td>{label}</td>
                      <td colSpan={4}>
                        <form action={setHoursAction} className="admin-inline-form">
                          <input type="hidden" name="masterId" value={master.id} />
                          <input type="hidden" name="weekday" value={weekday} />
                          <input
                            aria-label={`${master.name} ${label} открытие`}
                            type="time"
                            name="opens"
                            defaultValue={row?.opensAt.slice(0, 5) || '10:00'}
                          />
                          <input
                            aria-label={`${master.name} ${label} закрытие`}
                            type="time"
                            name="closes"
                            defaultValue={row?.closesAt.slice(0, 5) || '22:00'}
                          />
                          <label>
                            <input type="checkbox" name="off" defaultChecked={!row} /> Выходной
                          </label>
                          <button type="submit">Сохранить</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <h2>Закрытое время</h2>
      <form action={addClosureAction} className="admin-settings-form">
        <label>
          Мастер
          <select name="masterId">
            {schedule.masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          С даты
          <input type="date" name="startDate" defaultValue={today} required />
        </label>
        <label>
          Время начала
          <input type="time" name="startTime" />
        </label>
        <label>
          По дату
          <input type="date" name="endDate" defaultValue={today} required />
        </label>
        <label>
          Время конца
          <input type="time" name="endTime" />
        </label>
        <label>
          Причина
          <input name="reason" />
        </label>
        <p>Оставьте оба времени пустыми, чтобы закрыть весь день.</p>
        <button type="submit">Добавить закрытие</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Мастер</th>
              <th>Начало</th>
              <th>Конец</th>
              <th>Причина</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {schedule.closures.map((row) => (
              <tr key={row.id}>
                <td>{row.masterName}</td>
                <td>
                  {formatStudioDate(row.startsAt)} {formatStudioTime(row.startsAt)} МСК
                </td>
                <td>
                  {formatStudioDate(row.endsAt)} {formatStudioTime(row.endsAt)} МСК
                </td>
                <td>{row.reason || '—'}</td>
                <td>
                  <form action={removeClosureAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit">Удалить</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Правила записи</h2>
      <form action={setRulesAction} className="admin-settings-form">
        {fields.map(([key, label, hint]) => (
          <label key={key}>
            {label}
            <small>{hint}</small>
            <input type="number" name={key} defaultValue={rules[key]} required />
          </label>
        ))}
        <button type="submit">Сохранить правила</button>
      </form>
    </div>
  );
}
