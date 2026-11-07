export {};
const [siteUrl] = process.argv.slice(2);
if (!siteUrl) throw new Error('Укажите публичный URL сайта');
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret) throw new Error('TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET обязательны');

const url = new URL(siteUrl);
if (url.protocol !== 'https:') throw new Error('Требуется публичный HTTPS URL');
url.pathname = `${url.pathname.replace(/\/$/, '')}/api/telegram`;
url.search = '';
url.hash = '';
const root = process.env.TELEGRAM_API_ROOT ?? 'https://api.telegram.org';
const response = await fetch(`${root.replace(/\/$/, '')}/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: url.toString(),
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  }),
});
const body = (await response.json()) as { ok?: boolean };
if (!response.ok || !body.ok) throw new Error('Не удалось установить webhook');
console.log('Webhook установлен');
