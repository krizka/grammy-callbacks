import { BotContextSymbol, executeCallback, handleText } from './callback-registry';
import { CallbackContext, CallbackSessionData } from './callback-types';
import type { Bot } from './lib-adapter';

export function initialCallbackData(): CallbackSessionData {
  return {
    reply: {},
    params: {},
  };
}

function isCallbackData(data: string): boolean {
  return typeof data === 'string' && (data.startsWith('_cb:') || data.startsWith('_ch:'));
}

export function setupCallbacks(bot: Bot<any>): void {
  const contextCache: Record<number, CallbackContext> = ((bot as any).contextCache = {});

  bot.api.config.use(async (call, method, payload: any, signal) => {
    if (payload.reply_markup?.keyboard && contextCache[payload.chat_id]) {
      const ctx = contextCache[payload.chat_id];
      const buttons = payload.reply_markup.keyboard.flat();
      buttons.forEach((button: any) => {
        const data = button._callback_data || button.callback_data;
        if (data) {
          ctx.session.cb.reply[button.text] = data;
          delete button._callback_data;
          delete button.callback_data;
        }
      });
    }

    return await call(method, payload, signal);
  });

  bot.use(async (ctx, next) => {
    const fromId = ctx.from.id;
    contextCache[fromId] = ctx;

    ctx.session.cb ??= initialCallbackData();
    Object.defineProperty(ctx, BotContextSymbol, { value: true, enumerable: false });
    await next();

    if (contextCache[fromId] === ctx) delete contextCache[fromId];
  });

  bot.on('message:text', handleText);

  bot.on('callback_query', async (ctx, next) => {
    const callbackData = ctx.callbackQuery.data;

    if (isCallbackData(callbackData) && (await executeCallback(ctx, callbackData))) return;

    await next();
  });
}
