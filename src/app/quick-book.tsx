'use client';

import { useState } from 'react';
import { durationText } from '../site/format';

type Service = {
  id: number;
  name: string;
  byMaster: Record<number, { priceRub: number; durationMin: number } | null>;
};
type Master = { id: number; name: string };

export function QuickBook({ services, masters }: { services: Service[]; masters: Master[] }) {
  const defaultService = services.find((service) => service.name === 'С покрытием') ?? services[0];
  const [serviceId, setServiceId] = useState(defaultService?.id ?? 0);
  const [masterId, setMasterId] = useState(0);
  const service = services.find((item) => item.id === serviceId);
  const variants = service
    ? Object.entries(service.byMaster).filter(([, value]) => value !== null)
    : [];
  const available = masterId ? variants.find(([id]) => Number(id) === masterId)?.[1] : null;
  const best = masterId
    ? available
    : variants.map(([, value]) => value!).sort((a, b) => a.priceRub - b.priceRub)[0];

  return (
    <div className="quick-wrap">
      <form className="quick-book" action="/book" method="get">
        <label>
          Услуга
          <select
            name="service"
            value={serviceId}
            onChange={(event) => setServiceId(Number(event.target.value))}
          >
            {services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Мастер
          <select
            name="master"
            value={masterId || ''}
            onChange={(event) => setMasterId(Number(event.target.value))}
          >
            <option value="">Любой мастер</option>
            {masters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="quick-result" aria-live="polite">
          <strong>
            {best
              ? `${masterId && available ? '' : 'от '}${best.priceRub.toLocaleString('ru-RU')} ₽`
              : '—'}
          </strong>
          <small>{best ? durationText(best.durationMin) : 'Нет доступных услуг'}</small>
        </div>
        <button className="quick-submit" type="submit" aria-label="Выбрать время">
          <span>Выбрать время</span>
          <svg
            viewBox="0 0 24 24"
            width="25"
            height="25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
