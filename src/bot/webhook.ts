import { createHash, timingSafeEqual } from 'node:crypto';
import type { Bot } from 'grammy';
import type { Deps } from '../booking/types';
import type { MessageSender } from '../notifications/sender';
import { deliverPending } from '../notifications/deliver';
import type { BotEnv } from './index';
import { sanitizeTelegramError } from './sender';

function validSecret(expected?: string, received?: string | null): boolean {
  if (!expected || !received) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(received).digest();
  return timingSafeEqual(a, b);
}

export async function handleTelegramWebhook(request: Request, deps: Deps, env: BotEnv & { TELEGRAM_WEBHOOK_SECRET?: string }, bot: Bot, sender: MessageSender): Promise<Response> {
  if (!validSecret(env.TELEGRAM_WEBHOOK_SECRET, request.headers.get('X-Telegram-Bot-Api-Secret-Token')))
    return new Response('Unauthorized', { status: 401 });
  try {
    await bot.handleUpdate(await request.json());
    const safeSender: MessageSender = { send: async (chatId, text, buttons) => {
      try { await sender.send(chatId, text, buttons); }
      catch (error) { throw new Error(sanitizeTelegramError(error, env.TELEGRAM_BOT_TOKEN)); }
    } };
    await deliverPending(deps, safeSender);
  } catch (error) {
    console.error('Telegram webhook:', sanitizeTelegramError(error, env.TELEGRAM_BOT_TOKEN));
  }
  return new Response('OK', { status: 200 });
}
