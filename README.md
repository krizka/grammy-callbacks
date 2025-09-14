# Grammy Callbacks

Callback handling for Grammy Telegram bots. No callback data strings, no parsing, just direct function calls with parameters.

```ts
// Direct function binding
const handlers = cbs({
  async editUser(ctx /* : YourBotContextType */, userId: number) {
    // ctx already typed
    // ...user operations

    // call handlers directly by passing ctx!
    await handlers.someOtherHandler(ctx);
  },

  async someOtherHandler(ctx) {

  }
});

ctx.reply('text', {
  reply_keyboard: InlineKeyboard.from([
    // bind our handler to the button with some curried param.
    [Button.cb('Edit User', handlers.editUser(123))], // Inline button 'Edit User' will call `handlers.editUser(123)`
    [handlers.otherHandler().button('Handle other')], // other ofrmat of button binding
  ]),
});
ctx.reply('text', {
  reply_keyboard: Keyboard.from([
    [handlers.otherHandler().button('Handle other')], // 
  ])

// when user activates the button - we intercept callback_data, and call handler with exact curried params
```

## Key Benefits

**No callback data management** - Bind functions directly to buttons instead of creating strings like `"edit_user_123"` and parsing them later.

**Large parameters** - Not limited by Telegram's 64-byte callback data limit. Large objects are automatically stored in session.

**Restart-safe** - Callbacks work the same way after bot restarts thanks to deterministic function hashing.

**Type-safe** - Full TypeScript support with proper parameter type checking.

Works with any data size:

```ts
const largeUserData = { id: 123, preferences: {...}, metadata: {...} };
const button = Button.cb('Edit User', handlers.editUser(largeUserData));
```

## Installation

```bash
npm install grammy-callbacks grammy
```

## Requirements

⚠️ **Grammy Callbacks requires session middleware to be configured.**
The library stores callback data and wait states in the session,
so you must set up Grammy's session middleware before using this package.
Instead - it will warn you and use internal caches

```typescript
import { session } from 'grammy';

bot.use(session({}));
```

## Quick Start

```typescript
import { Bot, session } from 'grammy';
import { cbs, callbackMiddleware, Button, waitMiddleware } from 'grammy-callbacks';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Setup session middleware (required for callbacks)
bot.use(session({}));

// Setup callback middleware
setupCallbacks(bot);
bot.use(waitMiddleware)

// Define callback handlers
const handlers = cbs({
  async greetUser(ctx, name: string, age: number) {
    await ctx.answerCallbackQuery();
    await ctx.reply(`Hello ${name}! You are ${age} years old.`);
  },

  async greetSomeoneSpecial(ctx) {
    // use as simple handlers by passing ctx as first param.
    await handlers.greetUser(ctx, 'Special', 42);
    // or by currying
    await handlers.greetUser('Special', 42)(ctx);
    // or
    await handlers.greetUser('Special')(42)(ctx);
  },
});

// Use curried handlers in inline keyboard
bot.command('start', async (ctx) => {
  await ctx.reply('Choose an option:', {
    reply_markup: {
      inline_keyboard: [
        [Button.cb('Greet John (25)', handlers.greetUser('John', 25))], // use helper
        [handlers.greetUser('Jane', 30).button('Greet Jane (30)')], // or direct call
      ],
    },
  });
});

bot.start();
```

## Core Concepts

### Curried Callbacks

Curried callbacks allow you to create reusable handlers with pre-filled parameters:

```typescript
// Define handlers object
const handlers = cbs({
  async handleUserAction(ctx, action: string, userId: number, extra?: string) {
    await ctx.answerCallbackQuery(`Action: ${action} for user ${userId}`);
    if (extra) {
      await ctx.reply(`Extra info: ${extra}`);
    }
  },
});

// Create specialized versions
const editUser = handlers.handleUserAction('edit');
const deleteUser = handlers.handleUserAction('delete');
const editUserWithId = editUser(123);

// Use in buttons
const keyboard = [
  [Button.cb('Edit User 123', editUserWithId())],
  [deleteUser(456).button('Delete User 456')],
  [editUser(789, 'special').button('Edit with extra')],
];

// Pass context as first param and call immediately as simple callback function:
await deleteUser(ctx, 456);
await handlers.handleUserAction(ctx, 'edit', 456, 'extra');
```

### Organizing Handlers

Organize your callbacks in nested objects for better structure:

```typescript
const handlers = cbs({
  user: {
    async create(ctx, name: string) {
      await ctx.reply(`Creating user: ${name}`);
    },
    async delete(ctx, id: number) {
      await ctx.reply(`Deleting user: ${id}`);
    },
    edit: {
      async name(ctx, id: number, newName: string) {
        await ctx.reply(`Changing user ${id} name to: ${newName}`);
      },
      async email(ctx, id: number, newEmail: string) {
        await ctx.reply(`Changing user ${id} email to: ${newEmail}`);
      },
    },
  },
  admin: {
    async ban(ctx, userId: number, reason: string) {
      await ctx.reply(`Banned user ${userId}: ${reason}`);
    },
  },
});

// Use with partial application
const createJohn = handlers.user.create('John');
const editUser456Name = handlers.user.edit.name(456, 'NewName');

// Create buttons
const keyboard = [
  [Button.cb('Create John', createJohn())],
  [Button.cb('Rename User 456', editUser456Name())],
  [Button.cb('Ban Spammer', handlers.admin.ban(789, 'spam'))],
];
```

## Wait for User Input

Prompt users for input and handle their responses:

```typescript
import { cbs, wait, waitMiddleware } from 'grammy-callbacks';

// Add wait middleware
bot.use(waitMiddleware);

const handlers = cbs({
  async askForName(ctx, greeting: string) {
    await ctx.reply("What's your name?");
    // Wait for text input and pass it to handleNameInput
    wait(ctx, handlers.handleNameInput(greeting));
  },

  async handleNameInput(ctx, greeting: string, name: string) {
    await ctx.reply(`${greeting}, ${name}! Nice to meet you.`);
  },
});

bot.command('introduce', async (ctx) => {
  await handlers.askForName(ctx, 'Hello');
});
```

### Advanced Wait Usage

```typescript
// Wait with custom filters and options
const handlers = cbs({
  async handleResponse(ctx, prefix: string, userInput: string) {
    await ctx.reply(`${prefix}: ${userInput}`);
  },

  async promptWithOptions(ctx) {
    await ctx.reply('Send me a message or click a button:', {
      reply_markup: {
        inline_keyboard: [
          [
            InlineKeyboard.text('Option A', 'Option A')),
            InlineKeyboard.text('Option B', 'Option B')),
          ],
        ],
      },
    });

    // Wait for either text message or callback query
    wait(ctx, ['message:text', 'callback_query:data'], handlers.handleResponse('You sent'), {
      cancelKeyword: '/cancel',
      timeoutMs: 30000,
    });
  },
});
```

## API Reference

### Core Functions

#### `cbs(callbacksObj)`

Deep conversion of nested callback objects to curried versions. This is the main function you'll use to register callbacks.

```typescript
const handlers = cbs({
  user: {
    async edit(ctx, param1: string, param2: number) {
      // Handler logic
    },
  },
});

// Returns curried callbacks that can be partially applied
const partialHandler = handlers.user.edit('value1');
const fullHandler = partialHandler(42);
```

#### `bindCbs()`

Returns a function with your own Context type, bound to all the handlers, it will create. It can convert callback objects to curried versions with a specific context type.

```typescript
// bot-context.ts – Define your custom context type
export type MyBotContext = Context & {
  user: { id: number; name: string };
  db: DatabaseConnection;
};

// Create type-safe callback binder, pass your Context type
export const cbs = bindCbs<MyBotContext>();

// some bot file
import { cbs } from './bot-context';
// Now all handlers will be typed with your custom context
const handlers = cbs({
  async saveUser(ctx) {
    // ctx: MyBotContext
    // ctx.user and ctx.db are fully typed here
    await ctx.db.save(ctx.user);
    await ctx.reply(`Saved user ${ctx.user.name}`);
  },

  async updateProfile(ctx, newName: string) {
    // ctx: MyBotContext
    // Full type safety with custom context
    ctx.user.name = newName;
    await ctx.db.update(ctx.user);
  },
});
```

#### `executeCallback(ctx, callbackData, ...args)`

Execute a callback from callback data string.

### Wait Functions

#### `wait(ctx, handler, options?)`

Wait for user input with default text message filter.

#### `wait(ctx, filter, handler)`

Wait for user input with custom filter.

#### `wait(ctx, filter, handler, options?)`

Wait for user input with custom filter and options.

#### `waitMiddleware(ctx, next)`

Middleware to handle wait responses. Must be added to your bot.

#### `clearWaitState(ctx)`

Manually clear the wait state.

### Button Helpers

#### `Button.cb(text, callbackData)`

Create an inline keyboard button with callback data.

```typescript
const handlers = cbs({ myHandler });
const button = Button.cb('Click me', handlers.myHandler('param'));
```

### Middleware

#### `setupCallbacks(bot)`

Main middleware for handling callback queries. Must be called on your bot.

## Types

### `CurriedCallback<R, T, Ctx>`

A curried callback function type.

### `WaitOptions`

Options for configuring wait behavior:

```typescript
interface WaitOptions {
  // validator handler to pre-filter handled messages
  validator?: CurriedCallback<boolean | string>;
  // array of telegram update types, you want to accept in handler:
  filter?: FilterQuery[]; // ['message:text', 'callback_query:data', 'message:picture']
  messageId?: number;
  // text to send to cancel input wait
  cancelKeyword?: string;
  // wait timeout, after that time, handler will not be called
  timeoutMs?: number;
}
```

## Examples

See the `examples/` directory for complete examples:

- `simple-bot.ts` - Basic usage with callbacks and wait functionality

## Best Practices

1. **Always use session middleware** - Callbacks require session storage
2. **Add callback middleware early** - Should be one of the first middleware
3. **Organize callbacks logically** - Use nested objects for better organization
4. **Use TypeScript** - Get full type safety and IntelliSense

## Session Requirements

Grammy Callbacks requires session middleware to be configured:

```typescript
import { session } from 'grammy';

bot.use(session({}));
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

MIT
