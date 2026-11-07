'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SlotPicker, type SiteSlot } from './slot-picker';
import { submitBookingAction } from '../actions/booking';
import { durationText, slotText } from '../../site/format';

type Service = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  durationMin: number;
  priceRub: number;
};
type Master = { id: number; name: string };
function errorText(error: string): string {
  if (error === 'slot_taken') return 'Это время только что заняли';
  if (['too_soon', 'too_far', 'outside_schedule'].includes(error))
    return 'Это время уже недоступно';
  if (error === 'not_found') return 'Данные демо обновились, начните заново';
  if (error === 'rate_limited') return 'Слишком много записей за час. Попробуйте позже.';
  return 'Не удалось записаться. Выберите другое время.';
}
export function BookingForm({
  services,
  masters,
  initialServiceId,
  initialMasterId,
  dates,
  demoVersion,
}: {
  services: Service[];
  masters: Master[];
  initialServiceId: number | null;
  initialMasterId: number | null;
  dates: string[];
  demoVersion: string;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<number | null>(initialServiceId);
  const [masterId, setMasterId] = useState<number | null>(initialMasterId);
  const [slot, setSlot] = useState<SiteSlot | null>(null);
  const [step, setStep] = useState(initialServiceId ? 'time' : 'service');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const [alternatives, setAlternatives] = useState<SiteSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const service = services.find((item) => item.id === serviceId);
  const master = masters.find((item) => item.id === (masterId ?? slot?.masterId));
  async function submit() {
    if (!serviceId || !slot) return;
    const errors: { name?: string; phone?: string } = {};
    if (name.trim().length < 2 || name.trim().length > 60)
      errors.name = 'Имя: от 2 до 60 символов.';
    if (
      !/^(\+7|7|8)?[\s()\-\d]{10,}$/.test(phone) ||
      phone.replace(/\D/g, '').length < 10 ||
      phone.replace(/\D/g, '').length > 11
    )
      errors.phone = 'Введите номер в формате +7 000 000-00-00.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError('');
    try {
      const result = await submitBookingAction({
        serviceId,
        masterId: slot.masterId,
        start: slot.start,
        name,
        phone,
        idempotencyKey: key,
        demoVersion,
      });
      if (result.ok) {
        // Кнопка остаётся заблокированной до конца перехода на страницу подтверждения.
        router.push(`/b/${result.manageToken}?new=1`);
        return;
      }
      if (result.error === 'invalid_name') setFieldErrors({ name: 'Имя: от 2 до 60 символов.' });
      if (result.error === 'invalid_phone')
        setFieldErrors({ phone: 'Введите номер в формате +7 000 000-00-00.' });
      setError(errorText(result.error));
      setAlternatives(result.alternatives ?? []);
    } catch {
      setError('Не удалось отправить форму. Попробуйте ещё раз.');
    }
    setBusy(false);
  }
  return (
    <>
      <main className="book-layout">
        <div className="book-intro">
          <h1>
            {step === 'service'
              ? 'Что вам сделать?'
              : step === 'time'
                ? 'Когда вам удобно?'
                : 'Как к вам обращаться?'}
          </h1>
          <dl className="pick-summary">
            <dt>Услуга</dt>
            <dd>
              {service
                ? `${service.name}, ${durationText(service.durationMin)}`
                : 'Выберите услугу'}
            </dd>
            {step !== 'service' && (
              <>
                <dt>Мастер</dt>
                <dd>
                  <div className="master-buttons">
                    <button
                      type="button"
                      aria-pressed={masterId === null}
                      onClick={() => {
                        setMasterId(null);
                        setSlot(null);
                      }}
                    >
                      Любой
                    </button>
                    {masters.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={masterId === item.id}
                        onClick={() => {
                          setMasterId(item.id);
                          setSlot(null);
                        }}
                      >
                        {item.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </dd>
              </>
            )}
            {slot && (
              <>
                <dt>Время</dt>
                <dd>{slotText(new Date(slot.start))}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="book-content">
          {step === 'service' && (
            <section>
              <h2>Услуга</h2>
              <div className="service-options">
                {services.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={serviceId === item.id}
                    onClick={() => {
                      setServiceId(item.id);
                      setStep('time');
                    }}
                  >
                    {item.name}
                    <small>
                      {item.category} · {item.description}
                    </small>
                    <span>
                      {durationText(item.durationMin)} · {item.priceRub.toLocaleString('ru-RU')} ₽
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 'time' && serviceId && (
            <SlotPicker
              serviceId={serviceId}
              masterId={masterId}
              dates={dates}
              selected={slot}
              onSelect={setSlot}
            />
          )}
          {step === 'contacts' && (
            <section className="contact-form">
              <h2>Имя и телефон</h2>
              <p className="demo-note">
                Это демо. Вводите выдуманные данные, настоящий номер не нужен.
              </p>
              <input type="hidden" name="idempotencyKey" value={key} />
              <label htmlFor="booking-name">Имя</label>
              <input
                id="booking-name"
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              />
              {fieldErrors.name && (
                <p id="name-error" className="field-error">
                  {fieldErrors.name}
                </p>
              )}
              <label htmlFor="booking-phone">Телефон</label>
              <input
                id="booking-phone"
                type="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={!!fieldErrors.phone}
                aria-describedby="phone-hint phone-error"
              />
              <p id="phone-hint" className="hint">
                Формат: +7 000 000-00-00
              </p>
              {fieldErrors.phone && (
                <p id="phone-error" className="field-error">
                  {fieldErrors.phone}
                </p>
              )}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setName('Тестовая запись');
                  setPhone(
                    `+7000${Math.floor(Math.random() * 10_000_000)
                      .toString()
                      .padStart(7, '0')}`,
                  );
                  setFieldErrors({});
                }}
              >
                Подставить тестовые данные
              </button>
            </section>
          )}
          {error && (
            <div role="alert" className="booking-error">
              <p>{error}</p>
              {error.includes('Данные демо') && <Link href="/book">Начать заново</Link>}
              {alternatives.length > 0 && (
                <div>
                  <p>Другие свободные варианты:</p>
                  {alternatives.map((alternative) => (
                    <button
                      className="text-button"
                      key={alternative.start}
                      type="button"
                      onClick={() => {
                        setSlot(alternative);
                        setError('');
                      }}
                    >
                      {slotText(new Date(alternative.start))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <div className="booking-bottom">
        <div>
          {slot ? (
            <>
              <b>{slotText(new Date(slot.start))}</b>
              {master && ` · ${master.name.split(' ')[0]}`}
            </>
          ) : service ? (
            <b>{service.name}</b>
          ) : (
            'Выберите услугу'
          )}
        </div>
        {step === 'time' && (
          <button
            className="button"
            type="button"
            disabled={!slot}
            onClick={() => setStep('contacts')}
          >
            Дальше
          </button>
        )}
        {step === 'contacts' && (
          <button className="button" type="button" disabled={busy} onClick={submit}>
            {busy ? 'Отправляем…' : 'Записаться'}
          </button>
        )}
      </div>
    </>
  );
}
