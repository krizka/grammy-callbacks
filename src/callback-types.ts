import { KeyboardButton } from '@grammyjs/types/markup';
import type { Context, FilterQuery, InlineKeyboardButton, SessionFlavor } from './lib-adapter';

/**
 * Prompt state stored in session
 */
export interface WaitState {
  messageId: number;
  handlerId: string;
  filter?: FilterQuery[];
  cancelKeyword: string;
  timeoutId: number;
}

export type CallbackFunction<
  R = void,
  T extends any[] = any[],
  Ctx extends CallbackContext = CallbackContext,
> = (ctx: Ctx, ...args: T) => Promise<R>;

export interface CallbackFunctionEx<
  R = void,
  T extends any[] = any[],
  Ctx extends CallbackContext = CallbackContext,
> extends CallbackFunction<R, T, Ctx> {
  origin: CallbackFunctionEx<R, T>;
  curried?: CurriedCallback<R, T>;
  params?: any[];
  hash?: string;
  toCallbackData: () => string;
  button(text: string): InlineKeyboardButton.CallbackButton & KeyboardButton.CommonButton;
}

export interface CurriedCallback<
  R = void,
  T extends any[] = [],
  Ctx extends CallbackContext = CallbackContext,
> extends CallbackFunctionEx<R, T, Ctx> {
  // Explicit overload for context first (immediate execution)
  (ctx: Ctx, ...args: T): Promise<R>;

  // Explicit overloads for partial application up to length 4 (covers most use cases)
  (): CurriedCallback<R, T, Ctx>;
  <P extends T[0]>(arg1: P): T extends [P, ...infer Rest] ? CurriedCallback<R, Rest, Ctx> : never;
  <P1 extends T[0], P2 extends T[1]>(
    arg1: P1,
    arg2: P2,
  ): T extends [P1, P2, ...infer Rest] ? CurriedCallback<R, Rest, Ctx> : never;
  <P1 extends T[0], P2 extends T[1], P3 extends T[2]>(
    arg1: P1,
    arg2: P2,
    arg3: P3,
  ): T extends [P1, P2, P3, ...infer Rest] ? CurriedCallback<R, Rest, Ctx> : never;
  <P1 extends T[0], P2 extends T[1], P3 extends T[2], P4 extends T[3]>(
    arg1: P1,
    arg2: P2,
    arg3: P3,
    arg4: P4,
  ): T extends [P1, P2, P3, P4, ...infer Rest] ? CurriedCallback<R, Rest, Ctx> : never;
}

export type CallbackContext = Context & SessionFlavor<{ cb: CallbackSessionData }>;

export interface CallbackSessionData {
  reply: Record<string, string>;
  params: Record<string, any>;
  // Prompt state for collecting user input
  wait?: WaitState;

  lastHash?: string;
}
