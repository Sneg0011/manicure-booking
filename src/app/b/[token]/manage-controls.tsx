'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlotPicker, type SiteSlot } from '../../book/slot-picker';
import { cancelByTokenAction, moveByTokenAction } from '../../actions/manage';
import type { BookingView } from '../../../booking/types';
import { slotText } from '../../../site/format';

export function ManageControls({
  token,
  booking,
  dates,
  canChange,
  remaining,
  copyOnly = false,
  personalUrl,
}: {
  token: string;
  booking: BookingView;
  dates: string[];
  canChange: boolean;
  remaining: number;
  copyOnly?: boolean;
  personalUrl?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [moving, setMoving] = useState(false);
  const [slot, setSlot] = useState<SiteSlot | null>(null);
  const [error, setError] = useState('');
  const [alternatives, setAlternatives] = useState<SiteSlot[]>([]);
  const [busy, setBusy] = useState(false);
  if (copyOnly)
    return (
      <button
        type="button"
        className="button"
        onClick={async () => {
          await navigator.clipboard.writeText(personalUrl ?? `/b/${encodeURIComponent(token)}`);
          setCopied(true);
        }}
      >
        {copied ? 'Ссылка скопирована' : 'Копировать ссылку'}
      </button>
    );
  const phone = (
    <p>
      Позвоните в студию: <a href="tel:+70000000000">+7 000 000-00-00</a>
    </p>
  );
  async function move() {
    if (!slot) return;
    setBusy(true);
    const result = await moveByTokenAction(token, slot.start);
    setBusy(false);
    if (result.ok) {
      setMoving(false);
      setSlot(null);
      router.refresh();
    } else {
      setError(
        result.error === 'slot_taken'
          ? 'Это время только что заняли'
          : result.error === 'not_found'
            ? 'Данные демо обновились, начните заново'
            : 'Это время уже недоступно',
      );
      setAlternatives(result.alternatives ?? []);
    }
  }
  async function cancel() {
    if (!window.confirm('Отменить запись?')) return;
    setBusy(true);
    const result = await cancelByTokenAction(token);
    setBusy(false);
    if (result.ok) router.refresh();
    else
      setError(
        result.error === 'not_found'
          ? 'Данные демо обновились, начните заново'
          : 'Не удалось отменить запись',
      );
  }
  return (
    <div>
      {canChange && remaining > 0 ? (
        <button className="button" type="button" onClick={() => setMoving(!moving)}>
          Перенести
        </button>
      ) : (
        phone
      )}
      {canChange && (
        <button className="button secondary-button" type="button" disabled={busy} onClick={cancel}>
          Отменить запись
        </button>
      )}
      {moving && (
        <div className="move-panel">
          <h3>Выберите новое время</h3>
          <p>Мастер: {booking.masterName}. Время указано по МСК.</p>
          <SlotPicker
            serviceId={booking.serviceId}
            masterId={booking.masterId}
            dates={dates}
            selected={slot}
            onSelect={setSlot}
          />
          {slot && <p>{slotText(new Date(slot.start))}</p>}
          <button className="button" type="button" disabled={!slot || busy} onClick={move}>
            Подтвердить перенос
          </button>
        </div>
      )}
      {error && (
        <div className="booking-error" role="alert">
          <p>{error}</p>
          {alternatives.map((alt) => (
            <button
              className="text-button"
              key={alt.start}
              onClick={() => {
                setSlot(alt);
                setError('');
              }}
              type="button"
            >
              {slotText(new Date(alt.start))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
