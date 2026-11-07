import { getDeps } from '../../../lib/deps';
import { createBot, type BotEnv } from '../../../bot/index';
import { createTelegramSender } from '../../../bot/sender';
import { handleTelegramWebhook } from '../../../bot/webhook';

export const dynamic = 'force-dynamic';

let sharedBot: ReturnType<typeof createBot> | undefined;

export async function POST(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response('Telegram не настроен', { status: 503 });
  const env: BotEnv & { TELEGRAM_WEBHOOK_SECRET?: string } = {
    TELEGRAM_BOT_TOKEN: token, BOT_USERNAME: process.env.BOT_USERNAME ?? '',
    MASTER_1_INVITE: process.env.MASTER_1_INVITE, MASTER_2_INVITE: process.env.MASTER_2_INVITE,
    TELEGRAM_API_ROOT: process.env.TELEGRAM_API_ROOT,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  const deps = getDeps();
  sharedBot ??= createBot(deps, env);
  return handleTelegramWebhook(request, deps, env, sharedBot, createTelegramSender(sharedBot.api));
}
