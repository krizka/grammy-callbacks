import {
  BotContextSymbol,
  executeCallback,
  getSessionData,
  handleText,
} from './callbacks-registry';
import { CallbackSessionData, CallbacksOptions } from './callbacks-types';
import type { Bot, Context } from './lib-adapter';

export function initialCallbackData(): CallbackSessionData {
  return {
    reply: {},
    params: {},
  };
}

function isCallbackData(data?: string): data is string {
  return typeof data === 'string' && (data.startsWith('_cb:') || data.startsWith('_ch:'));
}

const sessionCache: Record<number, CallbackSessionData> = {};
function defaultGetSessionData(ctx: any): CallbackSessionData {
  const fromId = ctx.from?.id;
  if (!fromId)
    throw new Error('Cannot get session data from context without fromId, dont use it there'); // like for updates

  return ctx.session ? ctx.session : (sessionCache[fromId] ??= initialCallbackData());
}

export function setupCallbacks<Ctx extends Context>(
  bot: Bot<Ctx>,
  options?: CallbacksOptions<Ctx>,
): void {
  const contextCache: Record<number, Ctx> = ((bot as any).contextCache = {});
  const _getSessionData = options?.getSessionData ?? defaultGetSessionData;

  bot.api.config.use(async (call, method, payload: any, signal) => {
    if (payload.reply_markup?.keyboard) {
      const ctx = contextCache[payload.chat_id];
      if (ctx) {
        const buttons = payload.reply_markup.keyboard.flat();
        buttons.forEach((button: any) => {
          const data = button._callback_data || button.callback_data;
          if (data) {
            getSessionData(ctx).reply[button.text] = data;
            delete button._callback_data;
            delete button.callback_data;
          }
        });
      } else {
        console.warn(
          `Context not found for chat ${payload.chat_id}, maybe you forgot to await api operation`,
        );
      }
    }

    return await call(method, payload, signal);
  });

  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

    contextCache[fromId] = ctx;
    (ctx as any)._getSessionData = _getSessionData;

    const ctxData = getSessionData(ctx);
    if (!ctxData.reply) Object.assign(ctxData, initialCallbackData());

    Object.defineProperty(ctx, BotContextSymbol, { value: true, enumerable: false });
    await next();

    // save context for 1 minute to wait for reply messages, if it was not awaited
    setTimeout(() => {
      if (contextCache[fromId] === ctx) delete contextCache[fromId];
    }, 60000);
  });

  bot.on('message:text', handleText);

  bot.on('callback_query', async (ctx, next) => {
    const callbackData = ctx.callbackQuery.data;

    if (isCallbackData(callbackData) && (await executeCallback(ctx, callbackData))) return;

    await next();
  });
}
