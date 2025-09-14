import { executeCallback, getSessionData, isCurriedCallback } from './callbacks-registry';
import type { CurriedCallback } from './callbacks-types';
import type { Context, FilterQuery } from './lib-adapter';

/**
 * Wait options for collecting user input
 */
export interface WaitOptions {
  validator?: CurriedCallback<boolean | string>;
  filter?: FilterQuery[];
  messageId?: number;
  cancelKeyword?: string;
  timeoutMs?: number;
}

/**
 * Clear prompt state
 */
export function clearWaitState(ctx: Context): void {
  const sessionData = getSessionData(ctx);

  if (sessionData.wait?.messageId) {
    ctx.deleteMessages([sessionData.wait.messageId]);
  }
  delete sessionData.wait;
}

type WaitCallback<Ctx extends Context> = CurriedCallback<any, [string], Ctx>;

export function wait<Ctx extends Context>(
  ctx: Ctx,
  filter: FilterQuery | FilterQuery[] | WaitCallback<Ctx>,
  handler: WaitCallback<Ctx>,
): void;
export function wait<Ctx extends Context>(
  ctx: Ctx,
  handler: WaitCallback<Ctx>,
  waitOptions?: WaitOptions,
): void;
export function wait<Ctx extends Context>(
  ctx: Ctx,
  filter: FilterQuery | FilterQuery[] | WaitCallback<Ctx>,
  handlerOrOptions?: WaitCallback<Ctx> | WaitOptions,
  waitOptions?: WaitOptions,
): void;

/**
 * Wait for user input
 *
 * @param ctx - The callback context
 * @param filter - Filter query or handler function
 * @param handlerOrOptions - Handler function or wait options
 * @param waitOptions - Additional wait options
 */
export function wait<Ctx extends Context>(
  ctx: Context,
  filter: FilterQuery | FilterQuery[] | WaitCallback<Ctx>,
  handlerOrOptions?: WaitCallback<Ctx> | WaitOptions,
  waitOptions?: WaitOptions,
): void {
  clearWaitState(ctx);

  let handler: WaitCallback<Ctx> = handlerOrOptions as WaitCallback<Ctx>;
  if (isCurriedCallback(filter)) {
    waitOptions = handler as WaitOptions;
    handler = filter as WaitCallback<Ctx>;
    filter = ['message:text'];
  }

  // Store wait state
  getSessionData(ctx).wait = {
    messageId: waitOptions?.messageId || 0,
    cancelKeyword: (waitOptions?.cancelKeyword || '/cancelwait').toLowerCase(),
    filter: Array.isArray(filter) ? (filter as FilterQuery[]) : [filter as FilterQuery],
    handlerId: handler.toCallbackData(),
    timeoutId: 0, // TODO: implement timeout with callback registry
  };
}

/**
 * Handle text messages for prompts
 * @returns true if the message was handled as a prompt response, false otherwise
 */
export async function handleWaitResponse(ctx: Context): Promise<boolean> {
  const waitState = getSessionData(ctx).wait;

  if (!waitState) return false;

  // Check for cancel keyword
  let text;
  if (ctx.has('message:text')) {
    text = ctx.message.text;
  } else if (ctx.has('callback_query:data')) {
    text = ctx.callbackQuery.data;
  }

  if (text && text.toLowerCase() === waitState.cancelKeyword) {
    clearWaitState(ctx);
    return true;
  }

  if (waitState.filter && !ctx.has(waitState.filter)) return false;

  // Execute handler
  if (
    waitState.handlerId &&
    (await executeCallback(ctx, waitState.handlerId, text).catch((err: any) => {
      // if any error occurred - clear the state, or good result, only on false will not clear
      console.warn('Error while waiting for data', err.stack);
      return true;
    })) === false
  ) {
    return true;
  }

  // if no new wait was enabled - clear current state
  if (getSessionData(ctx).wait === waitState) {
    clearWaitState(ctx);
  }

  return true;
}

/**
 * Middleware to handle wait responses
 */
export async function waitMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
  if (!(await handleWaitResponse(ctx))) {
    return next();
  }
}
