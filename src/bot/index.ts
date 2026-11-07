import { Bot } from 'grammy';
import type { Deps } from '../booking/types';
import { registerClient, handleClientCallback } from './client';
import { registerMaster, handleMasterCallback } from './master';
import { sanitizeTelegramError } from './sender';

export type BotEnv = {
  TELEGRAM_BOT_TOKEN: string;
  BOT_USERNAME: string;
  MASTER_1_INVITE?: string;
  MASTER_2_INVITE?: string;
  TELEGRAM_API_ROOT?: string;
};
export function createBot(deps: Deps, env: BotEnv): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
    botInfo: {
      id: Number(env.TELEGRAM_BOT_TOKEN.split(':')[0]),
      is_bot: true,
      first_name: 'Запись',
      username: env.BOT_USERNAME,
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
    client: {
      ...(env.TELEGRAM_API_ROOT ? { apiRoot: env.TELEGRAM_API_ROOT } : {}),
      timeoutSeconds: 5,
    },
  });
  registerMaster(bot, deps, env);
  registerClient(bot, deps);
  bot.on('callback_query:data', async (ctx) => {
    let answer: string | undefined;
    try {
      if (ctx.callbackQuery.data === 'today' || ctx.callbackQuery.data === 'tomorrow')
        await handleMasterCallback(ctx, deps);
      else answer = await handleClientCallback(ctx, deps);
    } catch (error) {
      console.error('Telegram callback:', sanitizeTelegramError(error, env.TELEGRAM_BOT_TOKEN));
      answer = 'Запись уже изменена или недоступна';
    } finally {
      await ctx
        .answerCallbackQuery(answer ? { text: answer } : {})
        .catch((error) =>
          console.error(
            'Telegram callback answer:',
            sanitizeTelegramError(error, env.TELEGRAM_BOT_TOKEN),
          ),
        );
    }
  });
  bot.catch((error) =>
    console.error('Telegram bot:', sanitizeTelegramError(error, env.TELEGRAM_BOT_TOKEN)),
  );
  return bot;
}
