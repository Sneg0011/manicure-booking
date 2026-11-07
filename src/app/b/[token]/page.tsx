import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getDeps } from '../../../lib/deps';
import { getBookingByToken, getBotCodeByToken } from '../../../booking/service';
import { getRules, nextStudioDate } from '../../../booking/rules';
import { formatStudioDate } from '../../../lib/time';
import { slotText } from '../../../site/format';
import { ManageControls } from './manage-controls';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ваша запись — Лунка', robots: { index: false, follow: false } };
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' ? 'https' : 'http';
  const personalPath = `/b/${encodeURIComponent(token)}`;
  const personalUrl = host ? `${protocol}://${host}${personalPath}` : personalPath;
  const deps = getDeps();
  const booking = await getBookingByToken(deps, token);
  if (!booking) notFound();
  const [rules, botCode] = await Promise.all([getRules(deps), getBotCodeByToken(deps, token)]);
  const dates: string[] = [];
  for (let date = formatStudioDate(deps.now()), i = 0; i < 14; i++, date = nextStudioDate(date))
    dates.push(date);
  const canChange =
    booking.status === 'active' &&
    booking.startsAt.getTime() - deps.now().getTime() >= rules.changeCutoffMin * 60_000;
  const remaining = Math.max(0, rules.maxClientMoves - booking.moveCount);
  const remainingWords =
    ['ноль', 'один', 'два', 'три', 'четыре', 'пять'][remaining] ?? String(remaining);
  const isNew = (await searchParams).new === '1';
  return (
    <>
      <div className="site-bar">
        <Link href="/">
          <b>лунка</b>
        </Link>
        <span>Демо: студия и записи вымышленные</span>
      </div>
      <main className="manage-page">
        <h1>{isNew ? 'Вы записаны' : 'Ваша запись'}</h1>
        <dl className="booking-details">
          <div>
            <dt>Услуга</dt>
            <dd>{booking.serviceName}</dd>
          </div>
          <div>
            <dt>Мастер</dt>
            <dd>{booking.masterName}</dd>
          </div>
          <div>
            <dt>Когда</dt>
            <dd>{slotText(booking.startsAt)}</dd>
          </div>
          <div>
            <dt>Адрес</dt>
            <dd>Москва, Лунный переулок, 7</dd>
          </div>
          <div>
            <dt>Цена</dt>
            <dd>{booking.priceRub.toLocaleString('ru-RU')} ₽</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>
              {booking.status === 'active'
                ? 'Активна'
                : booking.status === 'cancelled'
                  ? 'Отменена'
                  : 'Завершена'}
            </dd>
          </div>
        </dl>
        <section className="personal-link">
          <h2>Личная ссылка</h2>
          <p>Сохраните эту ссылку: по ней можно посмотреть и изменить запись без пароля.</p>
          <a className="personal-url" href={personalUrl}>{personalUrl}</a>
          <ManageControls
            token={token}
            personalUrl={personalUrl}
            booking={booking}
            dates={dates}
            canChange={canChange}
            remaining={remaining}
            copyOnly
          />
        </section>
        {botCode && process.env.BOT_USERNAME && booking.status === 'active' && (
          <section className="bot-block">
            <h2>Подключить Telegram</h2>
            <p>
              Если подключите бота, в базе сохранится ваш Telegram ID. Он удаляется при ежедневном
              сбросе демо.
            </p>
            <a
              className="button"
              href={`https://t.me/${process.env.BOT_USERNAME}?start=${botCode}`}
            >
              Открыть бота
            </a>
          </section>
        )}
        <section className="manage-actions">
          <h2>Изменить запись</h2>
          {booking.status === 'active' ? (
            <>
              <p>Осталось переносов: {remainingWords}.</p>
              <ManageControls
                token={token}
                booking={booking}
                dates={dates}
                canChange={canChange}
                remaining={remaining}
              />
            </>
          ) : (
            <p>Запись больше не активна.</p>
          )}
        </section>
      </main>
    </>
  );
}
