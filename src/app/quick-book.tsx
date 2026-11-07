'use client';

import { useState } from 'react';
import { durationText } from '../site/format';
import { SelectMenu } from './select-menu';

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
  const price = (rub: number) => `${rub.toLocaleString('ru-RU')} ₽`;
  const serviceOptions = services.map((item) => {
    const offered = Object.entries(item.byMaster).filter(
      (entry): entry is [string, { priceRub: number; durationMin: number }] => entry[1] !== null,
    );
    const variant = masterId
      ? item.byMaster[masterId]
      : offered.map(([, value]) => value).sort((a, b) => a.priceRub - b.priceRub)[0];
    return {
      value: String(item.id),
      label: item.name,
      note: variant ? durationText(variant.durationMin) : undefined,
      hint: variant
        ? `${masterId ? '' : 'от '}${price(variant.priceRub)}`
        : masterId
          ? 'нет у мастера'
          : undefined,
    };
  });
  const masterOptions = [
    {
      value: '',
      label: 'Любой мастер',
      hint: variants.length
        ? `от ${price(Math.min(...variants.map(([, value]) => value!.priceRub)))}`
        : undefined,
    },
    ...masters.map((item) => ({
      value: String(item.id),
      label: item.name,
      hint: service?.byMaster[item.id] ? price(service.byMaster[item.id]!.priceRub) : 'нет услуги',
    })),
  ];

  return (
    <div className="quick-wrap">
      <form className="quick-book" action="/book" method="get">
        <label>
          Услуга
          <SelectMenu
            name="service"
            label="Услуга"
            options={serviceOptions}
            value={String(serviceId)}
            onChange={(value) => setServiceId(Number(value))}
            tone="dark"
          />
        </label>
        <label>
          Мастер
          <SelectMenu
            name="master"
            label="Мастер"
            options={masterOptions}
            value={masterId ? String(masterId) : ''}
            onChange={(value) => setMasterId(Number(value))}
            tone="dark"
          />
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
