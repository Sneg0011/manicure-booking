import Image from 'next/image';
import Link from 'next/link';
import { getDeps } from '../lib/deps';
import { getNextFreeSlot } from '../booking/next-slot';
import { getRules } from '../booking/rules';
import { nextStudioDate } from '../booking/rules';
import { formatStudioDate, formatStudioTime } from '../lib/time';
import { getCatalog } from '../site/catalog';
import { durationText, dateText } from '../site/format';
import { photoCredits } from '../lib/photo-credits';
import { Reveal } from './reveal';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const deps = getDeps();
  const [catalog, next, rules] = await Promise.all([
    getCatalog(deps),
    getNextFreeSlot(deps),
    getRules(deps),
  ]);
  const today = formatStudioDate(deps.now());
  const nextLabel = next
    ? `${formatStudioDate(next.start) === today ? 'сегодня' : formatStudioDate(next.start) === nextStudioDate(today) ? 'завтра' : dateText(formatStudioDate(next.start))}, ${formatStudioTime(next.start)} МСК`
    : null;
  return (
    <>
      <Reveal />
      <main>
        <header className="hero" id="top">
          <Image
            src="/photos/hero.jpg"
            alt="Рука наносит красный лак на ноготь рядом с флаконом"
            width={1920}
            height={1282}
            priority
            className="hero-photo"
          />
          <div className="hero-bar">
            <Link className="moon" href="/" aria-label="Лунка, на главную" />
            <nav aria-label="Разделы">
              <a href="#services">Услуги и цены</a>
              <a href="#masters">Мастера</a>
              <a href="#how">Как изменить запись</a>
              <a href="#contacts">Контакты</a>
            </nav>
          </div>
          <Link className="button hero-book" href="/book">
            Записаться
          </Link>
          <div className="hero-foot">
            <div className="hero-lead">
              <p>
                Студия маникюра на двух мастеров.
                <br />
                Запись онлайн, только на свободное время.
              </p>
              {nextLabel && <p className="hero-next">Ближайшее свободное время: {nextLabel}</p>}
            </div>
            <h1 aria-label="Лунка, студия маникюра">лунка</h1>
          </div>
        </header>
        <section className="service-list" id="services">
          <h2 className="reveal">Услуги и цены</h2>
          {catalog.services.map((service) => (
            <Link
              className="service-row reveal"
              key={service.id}
              href={`/book?service=${service.id}`}
            >
              <strong>{service.name}</strong>
              <span>
                {durationText(service.durationMin)} · {service.variedPrice ? 'от ' : ''}
                {service.priceRub.toLocaleString('ru-RU')} ₽
              </span>
            </Link>
          ))}
        </section>
        <section className="masters-section" id="masters">
          <h2 className="masters-title reveal">Мастера</h2>
          <div className="portrait-list">
            {catalog.masters.map((master, index) => (
              <article className="portrait reveal" key={master.id}>
                <Image
                  src={index === 0 ? '/photos/technician.jpg' : '/photos/coral-nails.webp'}
                  alt={index === 0 ? 'Мастер за работой' : 'Коралловый маникюр'}
                  width={index === 0 ? 1920 : 1024}
                  height={index === 0 ? 2876 : 768}
                />
                <h3>{master.name}</h3>
                <p>{master.bio}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="how-section" id="how">
          <div className="how-grid">
            <div className="how-step reveal">
              <h2>Сначала вы выбираете время.</h2>
              <p>Видно только свободное: занятое время на сайте не показывается.</p>
            </div>
            <div className="how-step reveal">
              <h3>Потом получаете личную ссылку.</h3>
              <p>По ней запись можно посмотреть без пароля. Можно подключить Telegram.</p>
            </div>
            <div className="how-step reveal">
              <h3>Передумали? Перенесите сами.</h3>
              <p>
                До {rules.maxClientMoves} раз и не позже чем за {rules.changeCutoffMin / 60} часа до
                визита.
              </p>
            </div>
            <div className="how-step reveal">
              <h3>Или отмените запись.</h3>
              <p>Время сразу освободится для других.</p>
            </div>
            <Image
              className="how-photo reveal"
              src="/photos/hand.webp"
              alt="Рука с аккуратным маникюром"
              width={1024}
              height={682}
            />
          </div>
        </section>
        <section className="contacts-section" id="contacts">
          <h2 className="reveal">Контакты</h2>
          <div className="contact-row reveal">Лунка</div>
          <div className="contact-row reveal">Лунный переулок, 7</div>
          <div className="contact-row reveal">Москва</div>
          <div className="contact-row reveal">Пн–Пт 10:00–22:00, Сб 10:00–15:00</div>
          <div className="contact-row reveal">
            <a href="tel:+70000000000">+7 000 000-00-00</a>
          </div>
          <div className="contact-row contact-action reveal">
            Записаться{' '}
            <Link className="button" href="/book">
              Выбрать время
            </Link>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-cols">
          <div>
            Лунка
            <br />
            Лунный переулок, 7<br />
            Москва
          </div>
          <div>
            <a href="#services">Услуги</a>
            <a href="#masters">Мастера</a>
            <a href="#how">Как изменить запись</a>
            <a href="#contacts">Контакты</a>
          </div>
          <div>
            Пн–Пт 10:00–22:00
            <br />
            Сб 10:00–15:00
            <br />
            <a href="tel:+70000000000">+7 000 000-00-00</a>
          </div>
          <div>
            Демонстрационный проект. Студия, мастера и записи вымышленные, настоящие услуги не
            оказываются.
          </div>
        </div>
        <div className="footer-bottom">
          <div className="photo-credits">
            Источники фото:{' '}
            {photoCredits.map((credit, i) => (
              <span key={credit.url}>
                <a href={credit.url} target="_blank" rel="noreferrer">
                  {credit.label}
                </a>
                {i < photoCredits.length - 1 ? '; ' : ''}
              </span>
            ))}
          </div>
          <div className="footer-word">лунка</div>
        </div>
      </footer>
    </>
  );
}
