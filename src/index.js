import cron from "node-cron";
import { Telegraf } from "telegraf";
import { config, assertConfig, describeConfigForLog } from "./config.js";
import { getDb } from "./db.js";
import { registerHandlers } from "./botHandlers.js";
import { runSchedulerTick } from "./scheduler.js";
import { log } from "./logger.js";

assertConfig();
log.info("Starting alarm bot", describeConfigForLog());
getDb();

const bot = new Telegraf(config.botToken);
registerHandlers(bot);

cron.schedule("* * * * *", () => {
  runSchedulerTick(bot).catch((err) =>
    log.error("Scheduler tick crashed", err?.message || err)
  );
});
log.info("Scheduler registered (every minute)");

bot
  .launch()
  .then(async () => {
    try {
      const me = await bot.telegram.getMe();
      log.info("Telegram bot running", {
        username: me.username ? `@${me.username}` : me.id,
        id: me.id,
      });
    } catch (e) {
      log.warn("Could not call getMe after launch", e?.message || e);
    }
    log.info("Press Ctrl+C to stop");
  })
  .catch((err) => {
    log.error("Failed to start bot", err?.message || err);
    process.exit(1);
  });

function shutdown(signal) {
  log.info("Shutting down", { signal });
  bot.stop(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
