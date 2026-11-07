import { Api } from 'grammy';
import type { MessageSender } from '../notifications/sender';

export function sanitizeTelegramError(error: unknown, token?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const noBotToken = raw.replace(/\bbot\d+:[A-Za-z0-9_-]+\b/g, 'bot***');
  const noToken = token ? noBotToken.replaceAll(token, 'bot***') : noBotToken;
  return noToken.replace(/\b\d+:[A-Za-z0-9_-]+\b/g, 'bot***');
}

export function createTelegramSender(api: Api): MessageSender {
  return { async send(chatId, text, buttons) {
    try {
      await api.sendMessage(chatId, text, buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((item) =>
        item.url ? { text: item.text, url: item.url } : { text: item.text, callback_data: item.callbackData ?? '' })) } } : {});
    } catch (error) {
      throw new Error(sanitizeTelegramError(error, api.token));
    }
  } };
}

export function getSenderFromEnv(): MessageSender {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { send: async () => { throw new Error('Telegram не настроен'); } };
  const api = new Api(token, { ...(process.env.TELEGRAM_API_ROOT ? { apiRoot: process.env.TELEGRAM_API_ROOT } : {}), timeoutSeconds: 5 });
  return createTelegramSender(api);
}
