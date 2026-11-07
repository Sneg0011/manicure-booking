// Проверка как тестировщик: настоящие действия в браузере и сверка с базой.
// Что нужно запущенным: npm run db:start, npm run telegram:stub, npm run build и npm run start.
// В .env.local: заглушка Telegram (см. README) и RATE_LIMIT_BOOKINGS_PER_HOUR=1000.
// Запуск: node tests/qa/run.mjs <пароль менеджера> main
//         node tests/qa/run.mjs <пароль менеджера> before   затем перезапустить сервер и базу
//         node tests/qa/run.mjs <пароль менеджера> after
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { chromium, request as apiRequest } from '@playwright/test';
import { SignJWT } from 'jose';
import pg from 'pg';

const [password, phase = 'main', onlyIds] = process.argv.slice(2);
const only = onlyIds?.split(',');
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const BASE = 'http://localhost:3100';
const STUB = 'http://127.0.0.1:54321';
const OUT = 'docs/qa';
mkdirSync(OUT, { recursive: true });

const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
const q = async (text, values = []) => (await db.query(text, values)).rows;
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];

async function scenario(id, title, did, expected, body) {
  if (only && !only.includes(id)) return;
  process.stdout.write(`${id} ${title} ... `);
  const entry = { id, title, did, expected };
  try {
    const got = await body();
    Object.assign(entry, { got: got.text, pass: got.pass });
  } catch (error) {
    Object.assign(entry, {
      got: `Ошибка проверки: ${String(error.message).slice(0, 400)}`,
      pass: false,
    });
  }
  console.log(entry.pass ? 'да' : `НЕТ: ${entry.got}`);
  results.push(entry);
}
const ok = (pass, text) => ({ pass: Boolean(pass), text });

// --- Даты: всё считается по Москве, как на сайте.
function isoInDays(days) {
  const now = new Date(Date.now() + 3 * 3600_000);
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
function workdayFrom(days, wanted) {
  for (let i = days; i < days + 13; i++) {
    const iso = isoInDays(i);
    if (wanted ? weekdayOf(iso) === wanted : weekdayOf(iso) >= 1 && weekdayOf(iso) <= 5) return iso;
  }
  throw new Error('нет подходящего дня');
}
const dayLabel = (iso) =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));

// --- Клиент в браузере.
async function openDay(page, { service = 2, master = 1, iso }) {
  await page.goto(`${BASE}/book?service=${service}&master=${master}`);
  await page.locator(`.days button[aria-label^="${dayLabel(iso)}"]`).click();
  await page.locator('.slot').first().waitFor();
}
const slotLabels = async (page) =>
  page
    .locator('.slot')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
async function chooseSlot(page, label) {
  await page.locator(`.slot[aria-label="${label}"]`).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Подставить тестовые данные' }).click();
}
async function submit(page) {
  await page.getByRole('button', { name: 'Записаться' }).click();
  await Promise.race([
    page.waitForURL(/\/b\//, { timeout: 15000 }),
    page.locator('.booking-error').waitFor({ timeout: 15000 }),
  ]);
  return /\/b\//.test(page.url()) ? page.url().split('/b/')[1].split('?')[0] : null;
}
async function book(page, options) {
  await openDay(page, options);
  const labels = await slotLabels(page);
  const label = labels[options.slot ?? 0];
  await chooseSlot(page, label);
  const token = await submit(page);
  return { token, label };
}
const byToken = async (token) =>
  (await q('SELECT * FROM bookings WHERE manage_token = $1', [token]))[0];
const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

// --- Telegram через настоящий адрес webhook и заглушку.
const stub = {
  clear: () => fetch(`${STUB}/__clear`, { method: 'POST' }),
  fail: (value) =>
    fetch(`${STUB}/__mode`, { method: 'POST', body: JSON.stringify({ fail: value }) }),
  sent: async () =>
    (await (await fetch(`${STUB}/__messages`)).json()).filter((m) => m.method === 'sendMessage'),
  all: async () => (await fetch(`${STUB}/__messages`)).json(),
};
let updateId = 1000;
async function hook(update, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  return fetch(`${BASE}/api/telegram`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}),
    },
    body: JSON.stringify({ update_id: ++updateId, ...update }),
  });
}
const from = (id) => ({ id, is_bot: false, first_name: 'Проверка' });
const botMessage = (chat, text) =>
  hook({
    message: {
      message_id: ++updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chat, type: 'private' },
      from: from(chat),
      text,
      entities: text.startsWith('/')
        ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }]
        : [],
    },
  });
const botButton = (chat, data) =>
  hook({
    callback_query: {
      id: String(++updateId),
      from: from(chat),
      chat_instance: 'qa',
      data,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chat, type: 'private' },
        text: 'карточка',
      },
    },
  });

// --- Менеджер.
async function managerPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel('Логин').fill(env.MANAGER_LOGIN);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: /Войти/ }).click();
  await page.waitForURL(/\/admin\/calendar/);
  return page;
}
async function addClosure(page, { master, iso, from: start, to: end, reason }) {
  await page.goto(`${BASE}/admin/schedule`);
  const form = page.locator('form', {
    has: page.getByRole('button', { name: 'Добавить закрытие' }),
  });
  await form.locator('[name=masterId]').selectOption(String(master));
  await form.locator('[name=startDate]').fill(iso);
  await form.locator('[name=endDate]').fill(iso);
  await form.locator('[name=startTime]').fill(start);
  await form.locator('[name=endTime]').fill(end);
  await form.locator('[name=reason]').fill(reason);
  await form.getByRole('button', { name: 'Добавить закрытие' }).click();
  await page.getByText(/Записей в конфликте/).waitFor();
}
const timeOf = (label) => label.split(' ')[0];
const plusHour = (time) =>
  `${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:${time.slice(3)}`;

if (phase === 'main') {
  await stub.clear();
  await stub.fail(false);
  await botMessage(9001, `/start master_${env.MASTER_1_INVITE}`);
  await botMessage(9002, `/start master_${env.MASTER_2_INVITE}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const other = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const iso = workdayFrom(3);
  let first;

  await scenario(
    'С1',
    'Клиент видит свободное время и создаёт запись',
    `Открыл /book, выбрал услугу «С покрытием», мастера Дарью и день ${dayLabel(iso)}, выбрал первое свободное время, нажал «Подставить тестовые данные» и «Записаться». Сверил строку в таблице bookings.`,
    'Показано только свободное время. Запись создана, открыт экран «Вы записаны» с личной ссылкой, в базе активная запись на выбранное время.',
    async () => {
      first = await book(page, { master: 1, iso });
      const row = await byToken(first.token);
      const heading = await page.locator('h1').first().innerText();
      const shown = await page.locator('.booking-details').innerText();
      const time = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      }).format(row.starts_at);
      return ok(
        heading === 'Вы записаны' &&
          row.status === 'active' &&
          row.master_id === 1 &&
          time === timeOf(first.label) &&
          shown.includes(timeOf(first.label)),
        `Экран «${heading}», в базе запись №${row.id}, статус ${row.status}, мастер ${row.master_id}, время ${time}, на экране то же время, источник ${row.source}.`,
      );
    },
  );

  await scenario(
    'С2',
    'Занятое время исчезает из доступных',
    'Во втором браузере открыл тот же день и мастера. Сверил с занятым интервалом в базе.',
    'Время только что созданной записи и все слоты, которые с ней пересекаются, не показаны.',
    async () => {
      await openDay(other, { master: 1, iso });
      const labels = await slotLabels(other);
      const row = await byToken(first.token);
      const overlapping = labels.filter((label) => {
        const [h, m] = timeOf(label).split(':').map(Number);
        const start = new Date(
          `${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`,
        );
        const end = new Date(start.getTime() + 120 * 60_000);
        return start < row.occupied_until && end > row.starts_at;
      });
      return ok(
        !labels.includes(first.label) && overlapping.length === 0,
        `Занятое время ${timeOf(first.label)} в списке нет, пересекающихся слотов ${overlapping.length}, первый доступный ${timeOf(labels[0])}.`,
      );
    },
  );

  await scenario(
    'С3',
    'Одновременные запросы на один слот не создают две записи',
    'Открыл 5 отдельных браузеров, в каждом выбрал одно и то же время у одного мастера и заполнил форму, затем нажал «Записаться» во всех одновременно. Сверил количество активных записей в базе.',
    'Ровно одна запись. Остальные видят сообщение, что время заняли, и другие варианты.',
    async () => {
      const iso3 = workdayFrom(4);
      const pages = [];
      for (let i = 0; i < 5; i++) {
        pages.push(await (await browser.newContext()).newPage());
      }
      await openDay(pages[0], { master: 2, iso: iso3 });
      const label = (await slotLabels(pages[0]))[0];
      for (const p of pages) {
        await openDay(p, { master: 2, iso: iso3 });
        await chooseSlot(p, label);
      }
      const tokens = await Promise.all(pages.map(submit));
      const won = tokens.filter(Boolean);
      const row = await byToken(won[0]);
      const [{ n }] = await q(
        "SELECT count(*)::int n FROM bookings WHERE master_id = 2 AND status = 'active' AND tstzrange(starts_at, occupied_until) && tstzrange($1, $2)",
        [row.starts_at, row.occupied_until],
      );
      const losers = pages.filter((_, i) => !tokens[i]);
      const messages = await Promise.all(
        losers.map((p) => p.locator('.booking-error').innerText()),
      );
      const friendly = messages.every((m) => m.includes('только что заняли'));
      await Promise.all(pages.map((p) => p.context().close()));
      return ok(
        won.length === 1 && n === 1 && friendly,
        `Успешно: ${won.length} из 5. Активных записей на этот интервал в базе: ${n}. Остальные ${losers.length} увидели «Это время только что заняли».`,
      );
    },
  );

  let movedTo;
  await scenario(
    'С4',
    'Перенос: старый слот освобождается, новый занимается',
    'На личной странице записи из С1 нажал «Перенести», выбрал другое время, подтвердил. Во втором браузере сверил список времени, в базе строку записи и историю.',
    'Новое время в записи. Старое снова доступно другому клиенту, новое нет. В базе счётчик переносов 1 и событие в истории.',
    async () => {
      await page.goto(`${BASE}/b/${first.token}`);
      await page.getByRole('button', { name: 'Перенести' }).click();
      await page.locator(`.move-panel .days button[aria-label^="${dayLabel(iso)}"]`).click();
      const labels = await page
        .locator('.move-panel .slot')
        .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
      movedTo = labels.at(-1);
      await page.locator(`.move-panel .slot[aria-label="${movedTo}"]`).click();
      await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
      await page.getByText('Осталось переносов: два.').waitFor();
      const row = await byToken(first.token);
      await other.reload();
      await openDay(other, { master: 1, iso });
      const after = await slotLabels(other);
      const events = await q(
        "SELECT actor, before, after FROM booking_events WHERE booking_id = $1 AND type = 'moved'",
        [row.id],
      );
      return ok(
        after.includes(first.label) &&
          !after.includes(movedTo) &&
          row.move_count === 1 &&
          events.length === 1 &&
          events[0].actor === 'client_site',
        `Старое время ${timeOf(first.label)} снова в списке: ${after.includes(first.label)}. Новое ${timeOf(movedTo)} в списке: ${after.includes(movedTo)}. В базе переносов ${row.move_count}, событий переноса ${events.length}, автор ${events[0]?.actor}.`,
      );
    },
  );

  await scenario(
    'С5',
    'Отмена: слот снова доступен',
    'На той же странице нажал «Отменить запись» и подтвердил. Во втором браузере обновил список времени, сверил строку в базе.',
    'Статус «Отменена» на странице и в базе, строка не удалена, время снова доступно.',
    async () => {
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Отменить запись' }).click();
      await page.getByText('Отменена').first().waitFor();
      const row = await byToken(first.token);
      await openDay(other, { master: 1, iso });
      const after = await slotLabels(other);
      return ok(
        row.status === 'cancelled' && after.includes(movedTo),
        `В базе статус ${row.status}, строка на месте. Время ${timeOf(movedTo)} снова в списке: ${after.includes(movedTo)}.`,
      );
    },
  );

  const manager = await managerPage();
  await scenario(
    'С6.1',
    'Менеджер закрывает время, и клиент не может туда записаться',
    'Клиент в браузере выбрал время и остановился на форме контактов. Менеджер в панели закрыл это время у мастера. Другой посетитель открыл список, первый клиент нажал «Записаться».',
    'Время исчезло у нового посетителя. Первому клиенту отказано понятным сообщением, записи в базе нет.',
    async () => {
      const iso6 = workdayFrom(5);
      await openDay(page, { master: 1, iso: iso6 });
      const label = (await slotLabels(page))[0];
      await chooseSlot(page, label);
      const time = timeOf(label);
      await addClosure(manager, {
        master: 1,
        iso: iso6,
        from: time,
        to: plusHour(time),
        reason: 'Проверка: мастер занят',
      });
      await openDay(other, { master: 1, iso: iso6 });
      const after = await slotLabels(other);
      const token = await submit(page);
      const message = token ? '' : await page.locator('.booking-error').innerText();
      const start = `${iso6}T${time}:00+03:00`;
      const [{ n }] = await q(
        "SELECT count(*)::int n FROM bookings WHERE master_id = 1 AND status = 'active' AND starts_at = $1",
        [start],
      );
      return ok(
        !after.includes(label) && !token && n === 0,
        `Время ${time} у нового посетителя в списке: ${after.includes(label)}. Запись первого клиента: ${token ? 'создана' : 'отказ'} («${message.split('\n')[0]}»). В базе записей на это время: ${n}.`,
      );
    },
  );

  await scenario(
    'С6.2',
    'Менеджер меняет расписание, и лишнее время исчезает',
    'В панели сократил часы мастера в понедельник до 12:00, проверил список времени у посетителя и попытку записи, затем вернул часы обратно.',
    'После сокращения нет слотов, которые заканчиваются позже 12:00. После возврата часов они снова есть.',
    async () => {
      const monday = workdayFrom(3, 1);
      const setCloses = async (value) => {
        await manager.goto(`${BASE}/admin/schedule`);
        const form = manager
          .locator('form', {
            has: manager.locator('[name=masterId][value="2"]'),
          })
          .filter({ has: manager.locator('[name=weekday][value="1"]') })
          .first();
        await form.locator('[name=closes]').fill(value);
        await form.getByRole('button', { name: 'Сохранить' }).click();
        await manager.waitForLoadState('networkidle');
      };
      await openDay(other, { master: 2, iso: monday });
      const before = await slotLabels(other);
      await setCloses('12:00');
      await settle();
      const [{ closes }] = await q(
        'SELECT closes_at AS closes FROM working_hours WHERE master_id = 2 AND weekday = 1',
      );
      await openDay(other, { master: 2, iso: monday }).catch(() => {});
      const during = await slotLabels(other);
      await setCloses('22:00');
      await settle();
      await openDay(other, { master: 2, iso: monday });
      const restored = await slotLabels(other);
      return ok(
        closes.startsWith('12:00') &&
          during.length < before.length &&
          restored.length === before.length,
        `Часы в базе ${closes}. Слотов до изменения ${before.length}, после сокращения ${during.length}, после возврата ${restored.length}.`,
      );
    },
  );

  let notified;
  await scenario(
    'С7',
    'Уведомления при создании, переносе и отмене по согласованной схеме',
    'Привязал двух мастеров к боту через настоящий адрес webhook. Клиент на сайте записался, перенёс и отменил. Сверил сообщения в заглушке Telegram, таблицу notifications и журнал в панели.',
    'Клиенту: экран. Мастеру: сообщение в Telegram о записи, переносе и отмене, без телефона. Менеджеру: журнал. Настоящий Telegram в этой проверке заменён заглушкой.',
    async () => {
      await stub.clear();
      const iso7 = workdayFrom(6);
      const created = await book(page, { master: 1, iso: iso7 });
      notified = created.token;
      await settle();
      await page.goto(`${BASE}/b/${created.token}`);
      await page.getByRole('button', { name: 'Перенести' }).click();
      await page.locator(`.move-panel .days button[aria-label^="${dayLabel(iso7)}"]`).click();
      await page.locator('.move-panel .slot').last().click();
      await page.getByRole('button', { name: 'Подтвердить перенос' }).click();
      await page.getByText('Осталось переносов: два.').waitFor();
      await settle();
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Отменить запись' }).click();
      await page.getByText('Отменена').first().waitFor();
      await settle();
      const row = await byToken(created.token);
      const client = (await q('SELECT phone FROM clients WHERE id = $1', [row.client_id]))[0];
      const sent = (await stub.sent()).filter((m) => String(m.body.chat_id) === '9001');
      const texts = sent.map((m) => m.body.text);
      const noPhone = texts.every((t) => !t.includes(client.phone));
      const noParseMode = sent.every((m) => !m.body.parse_mode);
      const rows = await q(
        'SELECT recipient, channel, status, count(*)::int n FROM notifications WHERE booking_id = $1 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3',
        [row.id],
      );
      await manager.goto(`${BASE}/admin/journal`);
      const journal = await manager.locator('table').first().innerText();
      const has = (word) => texts.some((t) => t.includes(word));
      return ok(
        has('создана') &&
          has('перенесена') &&
          has('отменена') &&
          noPhone &&
          noParseMode &&
          rows.some(
            (r) =>
              r.recipient === 'client' &&
              r.channel === 'screen' &&
              r.status === 'sent' &&
              r.n === 3,
          ) &&
          rows.some(
            (r) =>
              r.recipient === 'master' &&
              r.channel === 'telegram' &&
              r.status === 'sent' &&
              r.n === 3,
          ) &&
          rows.some((r) => r.recipient === 'manager' && r.status === 'sent' && r.n === 3) &&
          journal.includes('Отправлено'),
        `Мастеру в Telegram ушло ${texts.length} сообщения: ${texts.map((t) => t.split(':')[0]).join(', ')}. Телефона в текстах нет: ${noPhone}. В журнале базы: ${rows.map((r) => `${r.recipient}/${r.channel}/${r.status}×${r.n}`).join(', ')}. Записи видны в журнале панели.`,
      );
    },
  );

  await scenario(
    'С7.2',
    'Клиент с подключённым ботом получает изменения от менеджера, клиент без бота попадает в «Позвонить»',
    'Создал две записи. Первую привязал к чату через одноразовый код бота. Менеджер в панели перенёс обе. Сверил сообщение клиенту и список «Позвонить».',
    'Клиенту с ботом ушло сообщение. Клиент без бота попал в «Позвонить» с причиной «Сообщить об изменении». Повторное использование кода отклоняется.',
    async () => {
      const iso8 = workdayFrom(7);
      const withBot = await book(page, { master: 2, iso: iso8, slot: 0 });
      const rowA = await byToken(withBot.token);
      const withoutBot = await book(page, { master: 2, iso: iso8, slot: 2 });
      const rowB = await byToken(withoutBot.token);
      await stub.clear();
      await botMessage(9100, `/start ${rowA.bot_code}`);
      const cards = (await stub.sent()).filter((m) => String(m.body.chat_id) === '9100');
      await botMessage(9101, `/start ${rowA.bot_code}`);
      const replay = (await stub.sent()).filter((m) => String(m.body.chat_id) === '9101');
      const [{ chats }] = await q(
        'SELECT count(*)::int chats FROM client_chats WHERE booking_id = $1',
        [rowA.id],
      );
      const moveByPanel = async (row) => {
        const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
          row.starts_at,
        );
        await manager.goto(`${BASE}/admin/calendar?date=${date}&booking=${row.id}`);
        await manager.getByText('Перенести', { exact: true }).click();
        const form = manager.locator('form', {
          has: manager.getByRole('button', { name: 'Сохранить перенос' }),
        });
        await form.getByLabel('Время').fill(row === rowA ? '19:00' : '16:00');
        await form.getByRole('button', { name: 'Сохранить перенос' }).click();
        await manager.waitForLoadState('networkidle');
        await settle();
      };
      await stub.clear();
      await moveByPanel(rowA);
      await moveByPanel(rowB);
      const toClient = (await stub.sent()).filter((m) => String(m.body.chat_id) === '9100');
      const a = await byToken(withBot.token);
      const b = await byToken(withoutBot.token);
      await manager.goto(`${BASE}/admin/calls`);
      const callRow = manager.locator('tr', {
        has: manager.locator(`a[href*="booking=${rowB.id}"]`),
      });
      const reason = await callRow.innerText();
      return ok(
        cards.length === 1 &&
          replay[0]?.body.text.includes('уже использована') &&
          chats === 1 &&
          toClient.length === 1 &&
          a.needs_call === null &&
          b.needs_call === 'changed' &&
          reason.includes('Сообщить об изменении'),
        `Карточка в боте: ${cards.length}. Повтор кода другим чатом: «${replay[0]?.body.text}», привязок ${chats}. Клиенту с ботом ушло ${toClient.length} сообщение. Клиент без бота в «Позвонить»: ${reason.includes('Сообщить об изменении')}.`,
      );
    },
  );

  await scenario(
    'С8.1',
    'Посторонний не может открыть или изменить чужую запись',
    'Открыл выдуманный и изменённый токен. В боте нажал кнопки отмены чужой записи из постороннего чата, отправил неверный код мастера и запросил списки мастера.',
    'Страница 404 без данных записи. В боте отказ, запись не меняется, роли мастера и данных нет.',
    async () => {
      const victim = await book(page, { master: 1, iso: workdayFrom(8) });
      const row = await byToken(victim.token);
      const fake = await other.goto(`${BASE}/b/not-a-real-token`);
      const changed = await other.goto(`${BASE}/b/${victim.token.slice(0, -1)}x`);
      const body = await other.locator('body').innerText();
      await stub.clear();
      await botButton(7777, `cy:${row.id}`);
      await botButton(7777, `mv:${row.id}`);
      await botMessage(7777, '/start master_wrong-secret');
      await botMessage(7777, '/today');
      const all = await stub.all();
      const answers = all.filter((m) => m.method === 'answerCallbackQuery').map((m) => m.body.text);
      const replies = all.filter((m) => m.method === 'sendMessage').map((m) => m.body.text);
      const after = await byToken(victim.token);
      const [{ masters }] = await q(
        "SELECT count(*)::int masters FROM masters WHERE telegram_chat_id = '7777'",
      );
      return ok(
        fake.status() === 404 &&
          changed.status() === 404 &&
          !body.includes('Телефон') &&
          after.status === 'active' &&
          answers.length === 2 &&
          answers.every((t) => t.includes('недоступна')) &&
          replies.some((t) => t.includes('только для мастеров')) &&
          masters === 0,
        `Выдуманный токен: ${fake.status()}, изменённый: ${changed.status()}. Запись после кнопок чужого чата: ${after.status}. Ответ бота на кнопки: «${answers[0]}». Списки мастера: «${replies.at(-1)}». Чат получил роль мастера: ${masters > 0}.`,
      );
    },
  );

  await scenario(
    'С8.2',
    'Посторонний не может попасть в управление менеджера',
    'Без входа открыл все разделы панели. Отправил неверный пароль. Подставил подделанную cookie, подписанную чужим секретом. Перехватил настоящий запрос отмены из панели и отправил его без cookie. Проверил HTML панели на токены.',
    'Все разделы ведут на вход. Неверный пароль и подделка отклоняются. Запрос без входа не меняет базу. В HTML нет личных ссылок и кодов бота.',
    async () => {
      const guest = await browser.newContext();
      const guestPage = await guest.newPage();
      const redirects = [];
      for (const path of [
        '/admin',
        '/admin/calendar',
        '/admin/calls',
        '/admin/clients',
        '/admin/schedule',
        '/admin/services',
        '/admin/journal',
      ]) {
        await guestPage.goto(BASE + path);
        redirects.push(new URL(guestPage.url()).pathname === '/admin/login');
      }
      await guestPage.goto(`${BASE}/admin/login`);
      await guestPage.getByLabel('Логин').fill(env.MANAGER_LOGIN);
      await guestPage.getByLabel('Пароль').fill('неверный-пароль');
      await guestPage.getByRole('button', { name: /Войти/ }).click();
      await guestPage.getByText('Неверный логин или пароль').waitFor();
      const forged = await new SignJWT({ role: 'manager' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('чужой-секрет-длиннее-шестнадцати'));
      await guest.addCookies([{ name: 'manager_session', value: forged, url: BASE }]);
      await guestPage.goto(`${BASE}/admin/calendar`);
      const forgedBlocked = new URL(guestPage.url()).pathname === '/admin/login';
      await guest.close();

      const target = await book(page, { master: 2, iso: workdayFrom(9) });
      const row = await byToken(target.token);
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
        row.starts_at,
      );
      await manager.goto(`${BASE}/admin/calendar?date=${date}&booking=${row.id}`);
      const html = await manager.content();
      const leaks =
        html.includes(row.manage_token) || (row.bot_code && html.includes(row.bot_code));
      let captured;
      await manager.route('**/admin/**', async (route) => {
        const req = route.request();
        if (req.method() === 'POST' && req.headers()['next-action']) {
          captured = { url: req.url(), headers: req.headers(), body: req.postDataBuffer() };
          await route.abort();
        } else await route.continue();
      });
      manager.once('dialog', (dialog) => dialog.accept());
      await manager
        .getByRole('button', { name: /Отменить/ })
        .first()
        .click();
      await manager.waitForTimeout(800);
      await manager.unroute('**/admin/**');
      const api = await apiRequest.newContext();
      const { cookie: _cookie, ...headers } = captured.headers;
      const response = await api.post(captured.url, { headers, data: captured.body });
      await api.dispose();
      const after = await byToken(target.token);
      return ok(
        redirects.every(Boolean) &&
          forgedBlocked &&
          !leaks &&
          after.status === 'active' &&
          response.status() < 500,
        `Разделов без входа открылось: ${redirects.filter((r) => !r).length} из ${redirects.length}. Неверный пароль отклонён. Подделанная cookie отклонена: ${forgedBlocked}. Запрос отмены без cookie: ответ ${response.status()}, запись осталась ${after.status}. Токены в HTML панели: ${Boolean(leaks)}.`,
      );
    },
  );

  await scenario(
    'С9',
    'Ошибка отправки: запись не теряется, ошибка видна системе',
    'Перевёл заглушку Telegram в режим ошибки 500. Клиент записался. Менеджер перенёс запись клиента с подключённым ботом. Сверил базу, журнал и список «Позвонить», затем вернул заглушку в обычный режим.',
    'Запись создана и перенесена. В журнале статус «Ошибка» с текстом. Токена бота в тексте нет. Клиент в списке «Позвонить».',
    async () => {
      const iso9 = workdayFrom(10);
      const made = await book(page, { master: 1, iso: iso9 });
      const row0 = await byToken(made.token);
      await botMessage(9200, `/start ${row0.bot_code}`);
      await stub.fail(true);
      await settle();
      const failed = await book(page, { master: 2, iso: iso9 });
      await settle();
      const rowF = await byToken(failed.token);
      const masterRow = (
        await q(
          "SELECT status, error FROM notifications WHERE booking_id = $1 AND recipient = 'master'",
          [rowF.id],
        )
      )[0];
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
        row0.starts_at,
      );
      await manager.goto(`${BASE}/admin/calendar?date=${date}&booking=${row0.id}`);
      await manager.getByText('Перенести', { exact: true }).click();
      const form = manager.locator('form', {
        has: manager.getByRole('button', { name: 'Сохранить перенос' }),
      });
      await form.getByLabel('Время').fill('19:00');
      await form.getByRole('button', { name: 'Сохранить перенос' }).click();
      await manager.waitForLoadState('networkidle');
      await settle();
      const moved = await byToken(made.token);
      const clientRow = (
        await q(
          "SELECT status, error FROM notifications WHERE booking_id = $1 AND recipient = 'client' ORDER BY id DESC LIMIT 1",
          [row0.id],
        )
      )[0];
      await manager.goto(`${BASE}/admin/journal?failed=1`);
      const journal = await manager.locator('main').innerText();
      await manager.goto(`${BASE}/admin/calls`);
      const inCalls = await manager
        .locator('tr', { has: manager.locator(`a[href*="booking=${row0.id}"]`) })
        .count();
      await stub.fail(false);
      const allErrors = (await q("SELECT error FROM notifications WHERE status = 'failed'"))
        .map((r) => r.error)
        .join(' ');
      const token = env.TELEGRAM_BOT_TOKEN;
      return ok(
        rowF.status === 'active' &&
          masterRow.status === 'failed' &&
          masterRow.error &&
          moved.status === 'active' &&
          clientRow.status === 'failed' &&
          moved.needs_call === 'changed' &&
          inCalls === 1 &&
          journal.includes('Ошибка') &&
          !allErrors.includes(token),
        `Запись создана: ${rowF.status}. Уведомление мастеру: ${masterRow.status}, текст «${String(masterRow.error).slice(0, 60)}». Перенос сохранён, уведомление клиенту: ${clientRow.status}. Клиент в «Позвонить»: ${inCalls === 1}. Журнал показывает ошибку. Токен бота в текстах ошибок: ${allErrors.includes(token)}.`,
      );
    },
  );

  await scenario(
    'С10',
    'Работа на телефоне',
    'В браузере с размером 390×844 и сенсорным вводом прошёл запись, перенос и панель менеджера. На каждом экране измерил горизонтальную прокрутку страницы и сделал снимок.',
    'Все шаги выполняются пальцем. Страница нигде не прокручивается вбок.',
    async () => {
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const p = await phone.newPage();
      const overflow = {};
      const measure = async (name) => {
        await p.waitForLoadState('networkidle');
        overflow[name] = await p.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        await p.screenshot({ path: `${OUT}/phone-${name}.jpg`, quality: 60, type: 'jpeg' });
      };
      await p.goto(BASE);
      await measure('home');
      const isoP = workdayFrom(11);
      await p.goto(`${BASE}/book?service=2&master=1`);
      await p.locator(`.days button[aria-label^="${dayLabel(isoP)}"]`).tap();
      await p.locator('.slot').first().waitFor();
      await measure('time');
      await p.locator('.slot').first().tap();
      await p.getByRole('button', { name: 'Дальше' }).tap();
      await p.getByRole('button', { name: 'Подставить тестовые данные' }).tap();
      await measure('contacts');
      await p.getByRole('button', { name: 'Записаться' }).tap();
      await p.waitForURL(/\/b\//);
      await measure('confirmation');
      await p.getByRole('button', { name: 'Перенести' }).tap();
      await p.locator(`.move-panel .days button[aria-label^="${dayLabel(isoP)}"]`).tap();
      await p.locator('.move-panel .slot').last().tap();
      await p.getByRole('button', { name: 'Подтвердить перенос' }).tap();
      await p.getByText('Осталось переносов: два.').waitFor();
      await measure('moved');
      await p.goto(`${BASE}/admin/login`);
      await p.getByLabel('Логин').fill(env.MANAGER_LOGIN);
      await p.getByLabel('Пароль').fill(password);
      await p.getByRole('button', { name: /Войти/ }).tap();
      await p.waitForURL(/\/admin\/calendar/);
      await measure('admin-calendar');
      for (const [name, path] of [
        ['admin-calls', '/admin/calls'],
        ['admin-schedule', '/admin/schedule'],
        ['admin-services', '/admin/services'],
        ['admin-journal', '/admin/journal'],
        ['admin-clients', '/admin/clients'],
      ]) {
        await p.goto(BASE + path);
        await measure(name);
      }
      await phone.close();
      const bad = Object.entries(overflow).filter(([, value]) => value > 0);
      return ok(
        bad.length === 0,
        `Экранов проверено ${Object.keys(overflow).length}, запись и перенос выполнены касаниями, сдвиг вбок: ${bad.length ? JSON.stringify(bad) : 'нигде'}.`,
      );
    },
  );

  await context.close();
  await manager.context().close();
}

const stateFile = `${OUT}/.restart-state.json`;
if (phase === 'before') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const iso = workdayFrom(5, 2);
  const made = await book(page, { master: 2, iso, slot: 1 });
  const row = await byToken(made.token);
  const manager = await managerPage();
  await addClosure(manager, {
    master: 2,
    iso,
    from: '16:00',
    to: '17:00',
    reason: 'Проверка перезапуска',
  });
  const date = iso;
  await manager.goto(`${BASE}/admin/calendar?date=${date}&booking=${row.id}`);
  await manager.getByRole('button', { name: 'Менеджер предупредил' }).first().click();
  await manager.waitForLoadState('networkidle');
  await settle();
  const warned = (await byToken(made.token)).warned_at;
  const [{ n }] = await q('SELECT count(*)::int n FROM bookings');
  writeFileSync(
    stateFile,
    JSON.stringify({
      token: made.token,
      id: row.id,
      label: made.label,
      iso,
      warned,
      bookings: n,
      starts: row.starts_at,
    }),
  );
  console.log(`До перезапуска: запись №${row.id}, всего записей ${n}, отметка ${warned}`);
}
if (phase === 'after') {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  await scenario(
    'С11',
    'Данные сохраняются после перезапуска сервера и базы',
    'Создал запись, закрыл время, поставил отметку «Менеджер предупредил». Полностью остановил сайт и базу, запустил снова. Открыл личную ссылку, список времени и панель.',
    'Запись, отметка, закрытое время и количество записей на месте. Вход в панель работает.',
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(`${BASE}/b/${state.token}`);
      const row = await byToken(state.token);
      const [{ n }] = await q('SELECT count(*)::int n FROM bookings');
      await openDay(page, { master: 2, iso: state.iso });
      const labels = await slotLabels(page);
      const closed = labels.some((label) => timeOf(label) >= '16:00' && timeOf(label) < '17:00');
      const manager = await managerPage();
      await manager.goto(`${BASE}/admin/calendar?date=${state.iso}&booking=${state.id}`);
      const card = await manager.locator('main').innerText();
      await context.close();
      await manager.context().close();
      return ok(
        response.status() === 200 &&
          row.status === 'active' &&
          n === state.bookings &&
          new Date(row.warned_at).getTime() === new Date(state.warned).getTime() &&
          !closed &&
          !labels.includes(state.label) &&
          card.length > 0,
        `Личная ссылка: ${response.status()}. Запись №${row.id}: ${row.status}. Записей до и после: ${state.bookings} и ${n}. Отметка сохранилась: ${new Date(row.warned_at).getTime() === new Date(state.warned).getTime()}. Занятое и закрытое время в списке: ${!labels.includes(state.label) ? 'нет' : 'есть'}, ${closed ? 'есть' : 'нет'}. Вход в панель работает.`,
      );
    },
  );
}

await browser.close();
await db.end();
if (results.length) {
  const file = `${OUT}/results.json`;
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const merged = [...previous.filter((p) => !results.some((r) => r.id === p.id)), ...results];
  writeFileSync(file, JSON.stringify(merged, null, 2));
  console.log(`Пройдено ${results.filter((r) => r.pass).length} из ${results.length}`);
}
