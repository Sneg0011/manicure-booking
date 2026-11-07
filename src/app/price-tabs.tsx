'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { durationText } from '../site/format';

type Item = {
  id: number;
  name: string;
  description: string | null;
  byMaster: Record<number, { priceRub: number; durationMin: number } | null>;
};
type Group = { name: string; services: Item[] };

export function PriceTabs({
  groups,
  masters,
}: {
  groups: Group[];
  masters: { id: number; name: string }[];
}) {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setReady(true), []);
  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % groups.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + groups.length) % groups.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = groups.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }
  return (
    <div className={ready ? 'price-tabs tabs-ready' : 'price-tabs'}>
      <div className="tabs" role="tablist" aria-label="Категории услуг">
        {groups.map((group, i) => (
          <button
            key={group.name}
            ref={(node) => {
              refs.current[i] = node;
            }}
            id={`tab-${i}`}
            type="button"
            role="tab"
            aria-controls={`panel-${i}`}
            aria-selected={active === i}
            tabIndex={ready && active !== i ? -1 : 0}
            onClick={() => setActive(i)}
            onKeyDown={(event) => keyDown(event, i)}
          >
            {group.name}
          </button>
        ))}
      </div>
      {groups.map((group, i) => (
        <div
          className="price-panel"
          id={`panel-${i}`}
          key={group.name}
          role="tabpanel"
          aria-labelledby={`tab-${i}`}
          data-active={active === i}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Услуга</th>
                {masters.map((master) => (
                  <th key={master.id} scope="col">
                    {master.name.split(' ')[0]}
                  </th>
                ))}
                <th className="time-col" scope="col">
                  Время
                </th>
              </tr>
            </thead>
            <tbody>
              {group.services.map((item) => {
                const durations = Object.values(item.byMaster)
                  .filter(
                    (value): value is { priceRub: number; durationMin: number } => value !== null,
                  )
                  .map((value) => value.durationMin);
                const time = durations.length
                  ? `${new Set(durations).size > 1 ? 'от ' : ''}${durationText(Math.min(...durations))}`
                  : '—';
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/book?service=${item.id}`}>{item.name}</Link>
                      <small>{item.description}</small>
                      <small className="mobile-time">{time}</small>
                    </td>
                    {masters.map((master) => (
                      <td key={master.id}>
                        {item.byMaster[master.id]?.priceRub.toLocaleString('ru-RU') ?? '—'}
                        {item.byMaster[master.id] ? ' ₽' : ''}
                      </td>
                    ))}
                    <td className="time-col">{time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
