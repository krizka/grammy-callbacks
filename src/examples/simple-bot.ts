import { Bot, InlineKeyboard, session } from 'grammy';
import {
  bindCbs,
  Button,
  type CallbackContext,
  setupCallbacks,
  cb,
  wait,
  waitMiddleware,
} from '..';

const cbs = bindCbs<BotContext>();

// Type for our bot context
type BotContext = CallbackContext & {
  session: {
    cb: any;
    settings?: {
      notifications: boolean;
      darkMode: boolean;
      language: string;
    };
    userProfile?: {
      name?: string;
      email?: string;
    };
  };
};

// // Create callback wrapper with proper typing
// function createCb<T extends any[]>(fn: (ctx: BotContext, ...args: T) => Promise<void>) {
//   return cb<void, T, BotContext>(fn);
// }

// Define individual callback handlers
// Convert handlers to curried callbacks
const handlers = cbs({
  profile: {
    async show(ctx) {
      const profile = ctx.session.userProfile || {};
      await ctx.editMessageText(
        `👤 **Profile**\n\n` +
          `Name: ${profile.name || 'Not set'}\n` +
          `Email: ${profile.email || 'Not set'}\n\n` +
          `Use the buttons below to edit your profile.`,
        {
          reply_markup: {
            inline_keyboard: [
              [handlers.profile.editName().inlineButton('✏️ Edit Name')],
              [Button.cb('📧 Edit Email', handlers.profile.editEmail())],
              [Button.cb('🏠 Back to Home', handlers.home.show('param value'))],
            ],
          },
          parse_mode: 'Markdown',
        },
      );
      await ctx.answerCallbackQuery('📋 Profile loaded');
    },

    async editName(ctx) {
      await ctx.editMessageText('✏️ **Edit Name**\n\nPlease send your new name:', {
        reply_markup: {
          inline_keyboard: [[Button.cb('❌ Cancel', handlers.profile.show())]],
        },
        parse_mode: 'Markdown',
      });
      await ctx.answerCallbackQuery();

      // Wait for user input
      wait(ctx, handlers.profile.saveName());
    },

    async saveName(ctx, name: string) {
      if (!ctx.session.userProfile) ctx.session.userProfile = {};
      ctx.session.userProfile.name = name;

      await ctx.reply(`✅ Name updated to: ${name}`);
      await handlers.profile.show()(ctx);
    },

    async editEmail(ctx) {
      await ctx.editMessageText('📧 **Edit Email**\n\nPlease send your new email address:', {
        reply_markup: {
          inline_keyboard: [[Button.cb('❌ Cancel', handlers.profile.show())]],
        },
        parse_mode: 'Markdown',
      });
      await ctx.answerCallbackQuery();

      // Wait for user input
      wait(ctx, handlers.profile.saveEmail());
    },

    async saveEmail(ctx, email: string) {
      if (!ctx.session.userProfile) ctx.session.userProfile = {};
      ctx.session.userProfile.email = email;

      await ctx.reply(`✅ Email updated to: ${email}`);
      await handlers.profile.show()(ctx);
    },
  },

  settings: {
    async show(ctx) {
      const settings = ctx.session.settings || {
        notifications: true,
        darkMode: false,
        language: 'English',
      };

      await ctx.editMessageText(
        `⚙️ **Settings**\n\n` +
          `🔔 Notifications: ${settings.notifications ? 'ON' : 'OFF'}\n` +
          `🌙 Dark Mode: ${settings.darkMode ? 'ON' : 'OFF'}\n` +
          `🌐 Language: ${settings.language}\n\n` +
          `Toggle your preferences:`,
        {
          reply_markup: InlineKeyboard.from([
            [
              Button.cb(
                `🔔 Notifications: ${settings.notifications ? 'ON' : 'OFF'}`,
                handlers.settings.toggleNotifications,
              ),
            ],
            [
              Button.cb(
                `🌙 Dark Mode: ${settings.darkMode ? 'ON' : 'OFF'}`,
                handlers.settings.toggleDarkMode,
              ),
            ],
            [Button.cb('🏠 Back to Home', handlers.home.show('some param'))],
          ]),
          parse_mode: 'Markdown',
        },
      );
      await ctx.answerCallbackQuery('⚙️ Settings loaded');
    },

    async toggleNotifications(ctx) {
      if (!ctx.session.settings) {
        ctx.session.settings = { notifications: true, darkMode: false, language: 'English' };
      }

      ctx.session.settings.notifications = !ctx.session.settings.notifications;
      await ctx.answerCallbackQuery(
        `🔔 Notifications ${ctx.session.settings.notifications ? 'enabled' : 'disabled'}`,
      );

      // Refresh settings view
      await handlers.settings.show(ctx);
    },

    async toggleDarkMode(ctx) {
      if (!ctx.session.settings) {
        ctx.session.settings = { notifications: true, darkMode: false, language: 'English' };
      }

      ctx.session.settings.darkMode = !ctx.session.settings.darkMode;
      await ctx.answerCallbackQuery(
        `🌙 Dark mode ${ctx.session.settings.darkMode ? 'enabled' : 'disabled'}`,
      );

      // Refresh settings view
      await handlers.settings.show()(ctx);
    },
  },

  help: {
    async show(ctx) {
      await ctx.editMessageText(
        `❓ **Help & Support**\n\n` +
          `**Available Commands:**\n` +
          `• /start - Start the bot\n` +
          `• /help - Show this help\n` +
          `• /demo - Run demo with prompts\n\n` +
          `**Features:**\n` +
          `• Profile management with input prompts\n` +
          `• Settings with persistent storage\n` +
          `• Interactive callback buttons\n` +
          `• Session-based state management\n\n` +
          `This bot demonstrates the power of grammy-callbacks!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                InlineKeyboard.url(
                  '📚 Documentation',
                  'https://npmjs.com/package/grammy-callbacks',
                ),
                InlineKeyboard.url('💬 Grammy Docs', 'https://grammy.dev'),
              ],
              [Button.cb('🏠 Back to Home', handlers.home.show())],
            ],
          },
          parse_mode: 'Markdown',
        },
      );
      await ctx.answerCallbackQuery('❓ Help loaded');
    },
  },

  demo: {
    async start(ctx) {
      await ctx.reply(
        '🎯 **Interactive Demo**\n\n' +
          'This demo will show you how grammy-callbacks handles user input.\n\n' +
          '**Step 1:** Please enter your favorite color:',
        { parse_mode: 'Markdown' },
      );

      // Wait for color input
      wait(ctx, handlers.demo.getAge());
    },

    async getAge(ctx, color: string) {
      await ctx.reply(
        `🎨 Great! Your favorite color is: **${color}**\n\n` +
          '**Step 2:** Now please enter your age (just a number):',
        { parse_mode: 'Markdown' },
      );

      // Wait for age input, passing the color along
      wait(ctx, handlers.demo.getHobby(color));
    },

    async getHobby(ctx, color: string, age: string) {
      await ctx.reply(
        `🎂 Nice! You are **${age}** years old.\n\n` + "**Step 3:** What's your favorite hobby?",
        { parse_mode: 'Markdown' },
      );

      // Wait for hobby input, passing color and age along
      wait(ctx, handlers.demo.showResults(color, age));
    },

    async showResults(ctx, color: string, age: string, hobby: string) {
      await ctx.reply(
        '🎉 **Demo Complete!**\n\n' +
          '**Your Responses:**\n' +
          `🎨 Favorite Color: ${color}\n` +
          `🎂 Age: ${age}\n` +
          `🎯 Hobby: ${hobby}\n\n` +
          'This demonstrates how grammy-callbacks can chain multiple user inputs ' +
          'while preserving all previous data!\n\n' +
          'Use /start to return to the main menu.',
        { parse_mode: 'Markdown' },
      );
    },
  },

  home: {
    async show(ctx, param?: string) {
      const username = ctx.from?.username || ctx.from?.first_name || 'User';

      const messageText =
        `🏠 **Welcome to Grammy Callbacks Demo!**\n\n` +
        `Hello, ${username}! 👋\n\n` +
        `This bot demonstrates the power of **grammy-callbacks** - ` +
        `a library for handling complex callback interactions in Telegram bots.\n\n` +
        `**Features showcased:**\n` +
        `• Curried callbacks with parameters\n` +
        `• User input prompts with wait functionality\n` +
        `• Session-based state management\n` +
        `• Nested callback objects\n\n` +
        `Choose an option to explore:`;

      const keyboard = [
        [
          Button.cb('👤 Profile', handlers.profile.show()),
          Button.cb('⚙️ Settings', handlers.settings.show()),
        ],
        [
          Button.cb('❓ Help', handlers.help.show()),
          Button.cb('🎯 Interactive Demo', handlers.demo.start()),
        ],
      ];

      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown',
        });
        await ctx.answerCallbackQuery('🏠 Welcome back!');
      } else {
        await ctx.reply(messageText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown',
        });
      }
    },
  },
});

/**
 * Create and configure the demo bot
 */
export function createSimpleBot(token: string) {
  const bot = new Bot<BotContext>(token);

  // Setup session middleware (required for callbacks)
  bot.use(
    session({
      initial: (): BotContext['session'] => ({
        cb: { reply: {}, params: {} },
      }),
    }),
  );

  // Setup callback middleware
  setupCallbacks(bot);
  bot.use(waitMiddleware);

  // Command handlers
  bot.command('start', handlers.home.show());
  bot.command('help', handlers.help.show());
  bot.command('demo', handlers.demo.start());

  // Handle errors gracefully
  bot.catch((err) => {
    console.error('❌ Bot error:', err);

    // Try to inform the user about the error
    if (err.ctx) {
      err.ctx
        .reply('⚠️ An error occurred. Please try again or use /start to return to the main menu.')
        .catch(() => {
          // Ignore errors when trying to send error message
        });
    }
  });

  return bot;
}

// Run the bot if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  console.log('cwd', process.cwd());

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
    process.exit(1);
  }

  const bot = createSimpleBot(token);

  console.log('🚀 Starting Grammy Callbacks demo bot...');

  bot
    .start()
    .then(async () => {
      const botInfo = await bot.api.getMe();
      console.log(`✅ Bot started successfully! https://t.me/${botInfo.username}`);
      console.log('🎯 Try the following commands:');
      console.log('   /start - Main menu');
      console.log('   /demo - Interactive demo');
      console.log('   /help - Help information');
    })
    .catch((err) => {
      console.error('❌ Failed to start bot:', err);
      process.exit(1);
    });
}
