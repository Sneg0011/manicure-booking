import Image from 'next/image';
import { getDeps } from '../lib/deps';
import { getNextFreeSlot } from '../booking/next-slot';
import { getRules, nextStudioDate } from '../booking/rules';
import { formatStudioDate, formatStudioTime } from '../lib/time';
import { getCatalog } from '../site/catalog';
import { dateText } from '../site/format';
import { photoCredits } from '../lib/photo-credits';
import { Reveal } from './reveal';
import { Nail } from './nail';
import { Pill } from './pill';
import { PriceTabs } from './price-tabs';

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
    : 'Сейчас свободного времени нет';
  const workPhotos = [
    {
      src: '/photos/work-cherry.jpg',
      width: 1600,
      height: 2400,
      alt: 'Вишнёвый маникюр на длинных миндалевидных ногтях',
      caption: 'Вишня, длинный миндаль',
    },
    {
      src: '/photos/work-pearl.jpg',
      width: 1600,
      height: 2131,
      alt: 'Нюдовый маникюр на коротких ногтях',
      caption: 'Нюд, короткая длина',
    },
    {
      src: '/photos/work-rose.jpg',
      width: 1600,
      height: 2400,
      alt: 'Розовый маникюр на миндалевидных ногтях',
      caption: 'Розовый миндаль',
    },
  ];
  return (
    <>
      <Reveal />
      <main>
        <header className="hero" id="top">
          <div className="stone" aria-hidden="true" />
          <div className="hero-bar">
            <nav aria-label="Разделы">
              <a href="#price">Прайс</a>
              <a href="#works">Работы</a>
              <a href="#masters">Мастера</a>
              <a href="#contacts">Контакты</a>
            </nav>
            <Pill href="/book">Записаться</Pill>
          </div>
          <p className="hero-intro">
            Маникюр и педикюр у двух мастеров. Запись онлайн, только на свободное время.
          </p>
          <h1 className="hero-word" aria-label="Лунка, студия маникюра">
            <span>ЛУ</span>
            <span className="nail-place" aria-hidden="true">
              <Nail />
            </span>
            <span>НКА</span>
          </h1>
          <p className="hero-sub">Студия маникюра</p>
          <div className="hero-cta">
            <p>
              <small>Ближайшее свободное</small>
              {nextLabel}
            </p>
            <Pill href="/book" rose>
              Выбрать время
            </Pill>
          </div>
        </header>
        <section className="price-section" id="price">
          <div className="price-copy">
            <h2 className="reveal">ПРАЙС</h2>
            <PriceTabs groups={catalog.categories} masters={catalog.masters} />
          </div>
          <figure className="price-photo reveal">
            <Image
              src="/photos/price-hands.jpg"
              width={1600}
              height={1067}
              alt="Руки с нюдовым маникюром на светлой ткани"
            />
          </figure>
        </section>
        <section className="works-section" id="works">
          <h2 className="reveal">Работы</h2>
          <div className="works-grid">
            {workPhotos.map((photo, i) => (
              <figure className={`work work-${i + 1} reveal`} key={photo.src}>
                <Image src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} />
                <figcaption>{photo.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section className="masters-section" id="masters">
          <h2 className="reveal">Мастера</h2>
          <div className="master-grid">
            {catalog.masters.map((master, i) => (
              <article className={`master-card master-${i + 1} reveal`} key={master.id}>
                <Image
                  src={master.photo ?? ''}
                  width={1600}
                  height={i === 0 ? 2400 : 2133}
                  alt={
                    i === 0
                      ? 'Руки с аккуратным маникюром на светлом фоне'
                      : 'Руки с маникюром и золотыми украшениями'
                  }
                />
                <h3>{master.name}</h3>
                <p>{master.bio}</p>
                <Pill href={`/book?master=${master.id}`}>
                  Записаться к {master.name.split(' ')[0] === 'Дарья' ? 'Дарье' : 'Милане'}
                </Pill>
              </article>
            ))}
          </div>
        </section>
        <section className="how-section" id="how">
          <figure className="how-photo reveal">
            <Image
              src="/photos/howto-brush.jpg"
              width={1600}
              height={1067}
              alt="Кисть наносит покрытие на ноготь"
            />
          </figure>
          <div>
            <h2 className="reveal">Как устроена запись</h2>
            <div className="how-row reveal">
              <h3>Выбираете время</h3>
              <p>Видно только свободное: занятое время на сайте не показывается.</p>
            </div>
            <div className="how-row reveal">
              <h3>Получаете личную ссылку</h3>
              <p>По ней запись можно посмотреть без пароля. Можно подключить Telegram.</p>
            </div>
            <div className="how-row reveal">
              <h3>Переносите сами</h3>
              <p>
                До {rules.maxClientMoves} раз и не позже чем за {rules.changeCutoffMin / 60} часа до
                визита.
              </p>
            </div>
            <div className="how-row reveal">
              <h3>Или отменяете</h3>
              <p>Время сразу освободится для других.</p>
            </div>
          </div>
        </section>
        <section className="faq-section" id="faq">
          <h2 className="reveal">Частые вопросы</h2>
          <div className="faq-list reveal">
            <details>
              <summary>Нужна ли предоплата?</summary>
              <p>Нет. Оплата в студии после процедуры.</p>
            </details>
            <details>
              <summary>Запись подтверждается сразу?</summary>
              <p>
                Да. Если время показано на сайте, оно свободно, и запись подтверждается
                автоматически.
              </p>
            </details>
            <details>
              <summary>За какое время можно перенести запись?</summary>
              <p>
                Не позже чем за {rules.changeCutoffMin / 60} часа до визита, до{' '}
                {rules.maxClientMoves} раз. Позже позвоните в студию.
              </p>
            </details>
            <details>
              <summary>Нужен ли Telegram?</summary>
              <p>Нет. Запись работает на сайте, а бота можно подключить по желанию.</p>
            </details>
            <details>
              <summary>Где вы находитесь?</summary>
              <p>Москва, Лунный переулок, 7.</p>
            </details>
          </div>
        </section>
        <section className="contacts-section" id="contacts">
          <h2 className="reveal">Контакты</h2>
          <div className="contact-line reveal">Лунный переулок, 7</div>
          <div className="contact-line reveal">Москва</div>
          <div className="contact-line reveal">Пн-Пт 10:00-22:00, Сб 10:00-15:00</div>
          <div className="contact-line reveal">
            <a href="tel:+70000000000">+7 000 000-00-00</a>
          </div>
          <Pill href="/book" rose>
            Выбрать время
          </Pill>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-cols">
          <div>
            Лунный переулок, 7<br />
            Москва
          </div>
          <nav aria-label="Разделы в подвале">
            <a href="#price">Прайс</a>
            <a href="#works">Работы</a>
            <a href="#masters">Мастера</a>
            <a href="#contacts">Контакты</a>
          </nav>
          <div>
            Пн-Пт 10:00-22:00
            <br />
            Сб 10:00-15:00
          </div>
          <div>
            Демонстрационный проект. Студия, мастера и записи вымышленные, настоящие услуги не
            оказываются.
          </div>
        </div>
        <p>Фото: Pexels, снимки из фотостока, не работы студии. Ноготь нарисован в коде.</p>
        <p className="photo-credits">
          {photoCredits.map((credit, i) => (
            <span key={credit.url}>
              <a href={credit.url} target="_blank" rel="noreferrer">
                {credit.label}
              </a>
              {i < photoCredits.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
        <div className="footer-word">ЛУНКА</div>
      </footer>
    </>
  );
}
