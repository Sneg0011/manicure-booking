import type { Bot } from 'grammy';
import type { Deps } from '../../src/booking/types';
import { createBot, type BotEnv } from '../../src/bot/index';

export const botEnv: BotEnv = {
  TELEGRAM_BOT_TOKEN: '123:SECRET',
  BOT_USERNAME: 'test_booking_bot',
  MASTER_1_INVITE: 'invite-one',
  MASTER_2_INVITE: 'invite-two',
};
export type Call = { method: string; payload: Record<string, unknown> };

export function testBot(deps: Deps, env: BotEnv = botEnv): { bot: Bot; calls: Call[] } {
  const bot = createBot(deps, env);
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return {
      ok: true,
      result:
        method === 'sendMessage'
          ? {
              message_id: calls.length,
              date: 0,
              chat: { id: Number((payload as { chat_id: number }).chat_id), type: 'private' },
              text: (payload as { text: string }).text,
            }
          : method === 'editMessageText'
            ? true
            : true,
    } as never;
  });
  return { bot, calls };
}

let updateId = 1;
export async function message(bot: Bot, chatId: number, text: string): Promise<void> {
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, is_bot: false, first_name: 'Secret Name', username: 'secret_username' },
      text,
      entities: text.startsWith('/')
        ? [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }]
        : [],
    },
  } as never);
}
export async function callback(bot: Bot, chatId: number, data: string): Promise<void> {
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: `q-${updateId}`,
      from: { id: chatId, is_bot: false, first_name: 'Secret Name' },
      message: { message_id: 1, date: 0, chat: { id: chatId, type: 'private' } },
      chat_instance: 'x',
      data,
    },
  } as never);
}
export function texts(calls: Call[]): string[] {
  return calls
    .filter((call) => call.method === 'sendMessage' || call.method === 'editMessageText')
    .map((call) => String(call.payload.text));
}
export function buttons(calls: Call[]): { text: string; callback_data: string }[] {
  return calls.flatMap((call) =>
    (
      (
        call.payload.reply_markup as
          { inline_keyboard?: { text: string; callback_data: string }[][] } | undefined
      )?.inline_keyboard ?? []
    ).flat(),
  );
}
