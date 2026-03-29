import cron from "node-cron";
import { Telegraf } from "telegraf";
import { config, assertConfig } from "./config.js";
import { getDb } from "./db.js";
import { registerHandlers } from "./botHandlers.js";
import { runSchedulerTick } from "./scheduler.js";

assertConfig();
getDb();

const bot = new Telegraf(config.botToken);
registerHandlers(bot);

cron.schedule("* * * * *", () => {
  runSchedulerTick(bot, console).catch((err) =>
    console.error("[scheduler]", err)
  );
});

bot
  .launch()
  .then(() => {
    console.log("Telegram bot is running. Press Ctrl+C to stop.");
  })
  .catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
