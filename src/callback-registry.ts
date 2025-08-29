import {
  CallbackContext,
  CallbackFunction,
  CallbackFunctionEx,
  CurriedCallback,
  type CallbackSessionData,
} from './callback-types';
import { md5Hex } from './utils/md5';
import { SessionFlavor } from './lib-adapter';
import type { Context, InlineKeyboardButton, KeyboardButton } from './lib-adapter';

// Global registry for callbacks
const callbackRegistry: Record<string, CallbackFunction<any>> = {};

/**
 * Calculate a hash for a function
 * @param fn The function to hash
 * @returns A hash string
 */
function calculateFunctionHash(fn: Function): string {
  const fnString = fn.toString();
  const fnHash = md5Hex(fnString);
  return fn.name
    ? fn.name.slice(0, 8) + fnHash.slice(0, Math.max(4, 12 - fn.name.length))
    : fnHash.slice(12);
}

function toCallbackData(this: CallbackFunctionEx<any>) {
  const hash = this.origin.hash;
  // Create a compact callback data string
  if (!this.params || this.params.length === 0) {
    return `_cb:${hash}`;
  }

  // For parameters, create a shorter representation
  const paramsStr = JSON.stringify(this.params);

  const result = `_cb:${hash}:${paramsStr}`;

  return result;
}

export const BotContextSymbol = Symbol('bot-context');

export function isCtx(ctx: Context) {
  return !!ctx && typeof ctx === 'object' && BotContextSymbol in ctx;
}

function createCurried<R, T extends any[], Ctx extends Context>(
  parent: CallbackFunctionEx<R, T, Ctx>,
  accumulatedParams?: any[],
): CurriedCallback<R, T, Ctx> {
  const curried = ((...args: any[]) => {
    // Check if first argument is a CallbackContext
    if (isCtx(args[0])) {
      const ctx = args.shift();

      const params = curried.params ? curried.params.concat(args) : args;

      getSessionData(ctx).lastHash = parent.origin.hash;
      return parent.origin(ctx, ...(params as T));
    } else {
      // No ctx provided, accumulate parameters and return new curried function
      const params = curried.params ? curried.params.concat(args) : args;
      return createCurried(parent, params);
    }
  }) as CallbackFunctionEx<R, T>;
  // Add properties
  curried.origin = parent.origin;
  curried.params = accumulatedParams;
  curried.toCallbackData = toCallbackData;
  curried.button = (text: string) => Button.cb(text, curried as any);

  return curried as unknown as CurriedCallback<R, T, Ctx>;
}

/**
 * Register a callback function and return a curried function that accumulates parameters
 * @param callback The callback function to register
 * @returns A curried function that accumulates params until ctx is provided
 */
export function cb<R, T extends any[], Ctx extends Context>(
  callback: CallbackFunction<R, T, Ctx>,
): CurriedCallback<R, T, Ctx> {
  const hash = calculateFunctionHash(callback);

  // Register the callback in the global registry
  callbackRegistry[hash] = callback as CallbackFunction<any>;

  const cb = callback as CallbackFunctionEx<R, T>;
  cb.origin = cb;
  cb.hash = hash;

  return createCurried(cb) as CurriedCallback<R, T, Ctx>;
}

/**
 * Calculate a hash for a function based on its name and path inside an object.
 * The resulting hash is stable for the same path and function name, making it
 * easier to recognise callbacks in the registry while still keeping them short.
 *
 * @param fn   The callback function.
 * @param path The dot-separated path to the function in the source object.
 */
function calculateFunctionHashWithPath(fn: Function, path: string): string {
  const name = path || fn.name;
  const hash = md5Hex(name);
  // Keep the first part readable (function name truncated) and add md5 suffix for uniqueness
  return name
    ? name.slice(-12) + hash.slice(0, Math.max(4, 16 - fn.name.length))
    : hash.slice(0, 16);
}

/**
 * Utility type that walks through an object type and replaces every value that
 * is a CallbackFunction with the corresponding CurriedCallback, while keeping
 * the original object structure intact.
 */
export type DeepCurried<T, Ctx extends Context = Context> =
  T extends CallbackFunction<infer R, infer P, any>
    ? CurriedCallback<R, P, Ctx>
    : T extends Array<infer U>
      ? DeepCurried<U, Ctx>[]
      : T extends object
        ? { [K in keyof T]: DeepCurried<T[K], Ctx> }
        : T;

/**
 * Deep version of `cb` — accepts a nested object where each leaf value is a
 * callback function and returns a new object of the same shape with all
 * callbacks converted to curried versions. Hashes are generated using both the
 * property path inside the object and the function name to guarantee
 * uniqueness.
 *
 * @example
 * const callbacks = cbs({
 *   shop: {
 *     open: async (ctx) => { ... },
 *     close: async (ctx) => { ... },
 *   },
 *   user: {
 *     settings: {
 *       show: async (ctx, id) => { ... },
 *     },
 *   },
 * });
 *
 * callbacks.shop.open(ctx) //⇒ executes and registers automatically
 */
export function cbs<O extends Record<string, any>, Ctx extends Context = Context>(
  callbacksObj: O,
): DeepCurried<O, Ctx> {
  const walk = (obj: any, parentPath = ''): any => {
    if (typeof obj === 'function') {
      const path = parentPath.replace(/^\./, ''); // remove leading dot
      const hash = calculateFunctionHashWithPath(obj, path);

      if (callbackRegistry[hash]) throw new Error(`Callback with hash ${hash} already registered`);
      // register in global registry
      callbackRegistry[hash] = obj;

      const cbEx = obj as CallbackFunctionEx<any, any, any>;
      cbEx.origin = cbEx;
      cbEx.hash = hash;

      return createCurried(cbEx);
    }

    if (obj && typeof obj === 'object') {
      const result: any = Array.isArray(obj) ? [] : {};
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        const childPath = parentPath ? `${parentPath}.${key}` : key;
        result[key] = walk(value, childPath);
      }
      return result;
    }

    // primitives are returned as-is
    return obj;
  };

  return walk(callbacksObj) as DeepCurried<O, Ctx>;
}

/**
 * Execute a callback with the given callback data and context
 * @param callbackData The callback data string
 * @param ctx The Telegram router context
 */
export async function executeCallback(
  ctx: Context,
  callbackData: string,
  ...args: any[]
): Promise<any> {
  const [prefix, initialHash, initialParamsJson] = splitCallbackData(callbackData);
  let hash = initialHash;
  let paramsJson = initialParamsJson;

  // session hash with params
  if (prefix === '_ch') {
    const sessionData = getSessionData(ctx).params[hash];
    if (!sessionData) {
      throw new Error(`Session callback ${hash} not found`);
    }

    hash = sessionData.hash;
    paramsJson = sessionData.params;
  }

  const callback = callbackRegistry[hash];
  if (!callback) {
    throw new Error(`Callback ${hash} not found in registry`);
  }

  // Parse and apply parameters
  const params = paramsJson ? JSON.parse(paramsJson) : [];
  return await callback(ctx, ...params, ...args);
}

/**
 * Check if the given value is a CurriedCallback
 * @param filter The value to check
 * @returns Whether the value is a CurriedCallback
 */
export function isCurriedCallback(filter: any): filter is CurriedCallback<any> {
  return typeof filter === 'function' && 'toCallbackData' in filter;
}

export const getSessionData = (ctx: any): CallbackSessionData => ((ctx as any)._getSessionData)(ctx);


export async function handleText(ctx: Context, next: () => Promise<void>): Promise<void> {
  const text = ctx.message?.text;
  if (!text) {
    return next();
  }

  // Check if text matches any registered reply callback
  const callbackData = getSessionData(ctx).reply[text];
  if (callbackData) {
    const executed = await executeCallback(ctx, callbackData);
    if (executed !== false) {
      return; // Callback was executed successfully
    }
  }

  // If no callback was found or execution failed, continue with normal processing
  return next();
}

/**
 * Split callback data preserving colons in params
 * @param callbackData The callback data string to split
 * @returns Array with [prefix, hash, paramsJson]
 */
function splitCallbackData(callbackData: string): [string, string, string | undefined] {
  const [prefix, hash] = callbackData.split(':', 2);
  if (!prefix || prefix.length !== 3 || prefix[0] !== '_') return ['', '', undefined];

  const paramsJson = callbackData.slice(prefix.length + hash.length + 2);
  return [prefix, hash, paramsJson || undefined];
}

/**
 * Generate a short hash for storing callback data in session
 * @param params The parameters string
 * @returns A short hash
 */
function generateHash(params: string): string {
  return md5Hex(params).slice(0, 8);
}

/**
 * Store callback data in session and return a shorter reference
 * @param ctx The context with session
 * @param cbData The callback data
 * @returns A shorter session-based reference
 */
export function storeCallbackData(ctx: SessionFlavor<any>, cbData: string): string {
  const [, hash, paramsJson] = splitCallbackData(cbData);

  if (!paramsJson) {
    return cbData; // No params, return as-is
  }

  const sessionHash = generateHash(paramsJson);
  getSessionData(ctx).params[sessionHash] = { hash, params: paramsJson };

  return `_ch:${sessionHash}`;
}

export function bindCb<Ctx extends Context>() {
  return <R, T extends any[]>(callback: CallbackFunction<R, T, Ctx>) => cb(callback);
}

export type DeepCallbacksObj<Ctx extends Context = Context> =
  | ((ctx: Ctx, ...args: any[]) => any)
  | { [key: string]: DeepCallbacksObj<Ctx> }
  | DeepCallbacksObj<Ctx>[];

/**
 * Bind callbacks object with a specific context type
 * @returns A function that can convert callback objects to curried versions
 */
export function bindCbs<Ctx extends Context>() {
  return <O extends DeepCallbacksObj<Ctx>>(callbacksObj: O) => cbs<O, Ctx>(callbacksObj);
}

/**
 * Unified button creation helpers
 */
export const Button = {
  /**
   * Create a button with callback data (works for both inline and reply)
   */
  cb: (
    text: string,
    callback: CallbackFunctionEx<any, []>,
  ): InlineKeyboardButton.CallbackButton => {
    const data = callback.toCallbackData();
    return {
      text,
      callback_data: data,
      // @ts-ignore duplicate, coz it grammy cut out known fields
      _callback_data: data,
    } as InlineKeyboardButton.CallbackButton & KeyboardButton.CommonButton;
  },
};
