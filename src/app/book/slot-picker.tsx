'use client';
import { useEffect, useState } from 'react';
import { getSlotsAction } from '../actions/booking';
import { formatStudioTime } from '../../lib/time';
import { dateText } from '../../site/format';

export type SiteSlot = { start: string; masterId: number };
export function SlotPicker({
  serviceId,
  masterId,
  dates,
  selected,
  onSelect,
}: {
  serviceId: number;
  masterId: number | null;
  dates: string[];
  selected: SiteSlot | null;
  onSelect: (slot: SiteSlot | null) => void;
}) {
  const [availability, setAvailability] = useState<Record<string, SiteSlot[]>>({});
  const [day, setDay] = useState(dates[0]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(
      dates.map(async (date) => [date, await getSlotsAction(serviceId, masterId, date)] as const),
    ).then((pairs) => {
      if (live) {
        const values = Object.fromEntries(pairs);
        setAvailability(values);
        setDay((current) =>
          values[current]?.length
            ? current
            : (dates.find((date) => values[date]?.length) ?? dates[0]),
        );
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [serviceId, masterId, dates]);
  const slots = availability[day] ?? [];
  return (
    <div className="picker">
      <div className="days" aria-label="Выберите день">
        {dates.map((date) => {
          const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
          const off = weekday === 0;
          const busy = !off && !loading && !availability[date]?.length;
          return (
            <button
              type="button"
              key={date}
              disabled={off || busy || loading}
              aria-pressed={day === date}
              onClick={() => {
                setDay(date);
                onSelect(null);
              }}
              aria-label={`${dateText(date)}${off ? ', выходной' : busy ? ', занято' : ''}`}
            >
              <small>
                {new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(
                  new Date(`${date}T12:00:00Z`),
                )}
              </small>
              <b>{Number(date.slice(-2))}</b>
              {off && <small>выходной</small>}
              {busy && <small>занято</small>}
            </button>
          );
        })}
      </div>
      {loading && <p>Ищем свободное время…</p>}
      {!loading && !slots.length && <p>На этот день свободного времени нет.</p>}
      {(['Утро', 'День', 'Вечер'] as const).map((period) => {
        const inPeriod = slots.filter((slot) => {
          const hour = Number(formatStudioTime(new Date(slot.start)).slice(0, 2));
          return period === 'Утро'
            ? hour < 12
            : period === 'День'
              ? hour < 18 && hour >= 12
              : hour >= 18;
        });
        return inPeriod.length ? (
          <section className="slot-group" key={period}>
            <h2>{period}</h2>
            <div className="slots">
              {inPeriod.map((slot) => (
                <button
                  className="slot"
                  type="button"
                  key={`${slot.start}-${slot.masterId}`}
                  aria-pressed={
                    selected?.start === slot.start && selected.masterId === slot.masterId
                  }
                  aria-label={`${formatStudioTime(new Date(slot.start))} МСК, ${dateText(day)}`}
                  onClick={() => onSelect(slot)}
                >
                  <span>{formatStudioTime(new Date(slot.start))}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null;
      })}
    </div>
  );
}
