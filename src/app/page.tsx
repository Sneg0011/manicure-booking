import Image from 'next/image';
import { getDeps } from '../lib/deps';
import { getNextFreeSlot } from '../booking/next-slot';
import { getRules, nextStudioDate } from '../booking/rules';
import { formatStudioDate, formatStudioTime } from '../lib/time';
import { getCatalog } from '../site/catalog';
import { dateText } from '../site/format';
import { photoCredits } from '../lib/photo-credits';
import { Reveal } from './reveal';
import { HeroTryon } from './hero-tryon';
import { QuickBook } from './quick-book';
import { WorksRail } from './works-rail';
import { Pill } from './pill';
import { PriceTabs } from './price-tabs';
import { Satin } from './satin';

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
  // Цена «от» считается по маникюру: ремонт одного ногтя дал бы вводящую в заблуждение цифру.
  const manicure = catalog.services.filter((service) => service.category === 'Маникюр');
  const fromText = (values: number[]) =>
    values.length ? `от ${Math.min(...values).toLocaleString('ru-RU')} ₽` : 'Цены по записи';
  const priceFrom = fromText(
    manicure.flatMap((service) =>
      Object.values(service.byMaster).flatMap((value) => (value ? [value.priceRub] : [])),
    ),
  );
  const workData = [
    {
      src: '/photos/work-cherry.jpg',
      width: 960,
      height: 1200,
      chip: 'Наращивание',
      title: 'Вишня, длинный миндаль',
      description: 'Глубокий цвет и сильный глянец на длинной форме',
      alt: 'Вишнёвый маникюр на длинных миндалевидных ногтях',
    },
    {
      src: '/photos/work-tray.jpg',
      width: 960,
      height: 1200,
      chip: 'С покрытием',
      title: 'Тёмная вишня',
      description: 'Плотный цвет на аккуратной длине',
      alt: 'Рука с тёмно-вишнёвым маникюром над зеркальным подносом',
    },
    {
      src: '/photos/work-pastel.jpg',
      width: 960,
      height: 1200,
      chip: 'С покрытием',
      title: 'Жемчужная лаванда',
      description: 'Мягкий блеск и пастельный оттенок',
      alt: 'Рука с лавандовым жемчужным маникюром и розовым рукавом',
    },
    {
      src: '/photos/work-rose.jpg',
      width: 960,
      height: 1200,
      chip: 'Наращивание',
      title: 'Розовый миндаль',
      description: 'Спокойный оттенок на вытянутой форме',
      alt: 'Розовый маникюр на миндалевидных ногтях',
    },
    {
      src: '/photos/work-dark.jpg',
      width: 960,
      height: 1200,
      chip: 'Снятие и новое покрытие',
      title: 'Красный на коротких',
      description: 'Классика на аккуратных ногтях',
      alt: 'Руки с красным маникюром на тёмном платье',
    },
    {
      src: '/photos/work-book.jpg',
      width: 960,
      height: 1200,
      chip: 'Снятие и новое покрытие',
      title: 'Рубин',
      description: 'Спокойный красный на каждый день',
      alt: 'Рука с рубиновым маникюром на открытой книге',
    },
  ].map((work) => {
    const service = catalog.services.find((item) => item.name === work.chip);
    return { ...work, href: service ? `/book?service=${service.id}` : '/book' };
  });
  const masterPriceFrom = (masterId: number, category: string) =>
    fromText(
      catalog.services
        .filter((service) => service.category === category)
        .flatMap((service) =>
          service.byMaster[masterId] ? [service.byMaster[masterId]!.priceRub] : [],
        ),
    );
  return (
    <div className="site">
      <Reveal />
      <main>
        <HeroTryon nextLabel={nextLabel} priceFrom={priceFrom} />
        <QuickBook services={catalog.services} masters={catalog.masters} />
        <section className="price-section" id="price">
          <h2 className="giant reveal" aria-label="Прайс">
            <span aria-hidden="true">ПРАЙС</span>
          </h2>
          <Image
            className="price-hand"
            src="/photos/hand-price.webp"
            width={931}
            height={1523}
            alt="Рука с маникюром у прайса"
          />
          <div className="price-copy reveal">
            <PriceTabs groups={catalog.categories} masters={catalog.masters} />
            <Pill href="/book" rose>
              Записаться
            </Pill>
          </div>
        </section>
        <WorksRail works={workData} />
        <section className="masters-section" id="masters">
          <h2 className="giant reveal" aria-label="Мастера">
            <span aria-hidden="true">МАСТЕРА</span>
          </h2>
          <div className="master-grid">
            {catalog.masters.map((master, i) => (
              <div className={`master-pair master-pair-${i + 1}`} key={master.id}>
                <div className="master-hand reveal">
                  <Image
                    src={i === 0 ? '/photos/hand-daria.webp' : '/photos/hand-milana.webp'}
                    width={i === 0 ? 754 : 1227}
                    height={i === 0 ? 1651 : 1640}
                    alt={
                      i === 0
                        ? 'Рука с нюдовым маникюром, кольцами и ромашками'
                        : 'Руки с розовым маникюром и баночкой'
                    }
                  />
                </div>
                <article className="master-info reveal">
                  <h3>{master.name}</h3>
                  <p>{master.bio}</p>
                  <dl>
                    <div>
                      <dt>Маникюр</dt>
                      <dd>{masterPriceFrom(master.id, 'Маникюр')}</dd>
                    </div>
                    <div>
                      <dt>Педикюр</dt>
                      <dd>{masterPriceFrom(master.id, 'Педикюр')}</dd>
                    </div>
                  </dl>
                  <Pill href={`/book?master=${master.id}`} rose>
                    Записаться к {i === 0 ? 'Дарье' : 'Милане'}
                  </Pill>
                </article>
              </div>
            ))}
          </div>
        </section>
        <Satin />
        <section className="how-section" id="how">
          <h2 className="giant reveal" aria-label="Как устроена запись">
            <span aria-hidden="true">ЗАПИСЬ</span>
          </h2>
          <Image
            className="how-hand"
            src="/photos/hand-how.webp"
            width={1277}
            height={1187}
            alt="Рука с маникюром рядом с шагами записи"
          />
          <div className="how-copy reveal">
            <div className="how-grid">
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
                  До {rules.maxClientMoves} раз и не позже чем за {rules.changeCutoffMin / 60} часа
                  до визита.
                </p>
              </div>
              <div className="how-row reveal">
                <h3>Или отменяете</h3>
                <p>Время сразу освободится для других.</p>
              </div>
            </div>
            <a className="hero-ring" href="/book">
              <span>
                Выбрать
                <br className="desktop-only" /> время
              </span>
            </a>
          </div>
        </section>
        <section className="faq-section" id="faq">
          <h2 className="giant reveal" aria-label="Частые вопросы">
            <span aria-hidden="true">ВОПРОСЫ</span>
          </h2>
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
          <h2 className="giant reveal" aria-label="Контакты">
            <span aria-hidden="true">КОНТАКТЫ</span>
          </h2>
          <div className="contacts-grid">
            <div className="contacts-lines">
              <div className="contact-line reveal">Лунный переулок, 7</div>
              <div className="contact-line reveal">Москва</div>
              <div className="contact-line reveal">Пн-Пт 10:00-22:00</div>
              <div className="contact-line reveal">Сб 10:00-15:00</div>
              <div className="contact-line reveal">
                <a href="tel:+70000000000">+7 000 000-00-00</a>
              </div>
            </div>
            <div className="contacts-side reveal">
              <p className="hero-next">
                <small>Ближайшее свободное</small>
                {nextLabel}
              </p>
              <a className="hero-ring" href="/book">
                <span>
                  Выбрать
                  <br className="desktop-only" /> время
                </span>
              </a>
            </div>
          </div>
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
        <p>
          Фото: Pexels, снимки из фотостока, не работы студии. Цвет ногтей на первом экране меняется
          в браузере.
        </p>
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
    </div>
  );
}
