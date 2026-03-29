import { log } from "./logger.js";

/** Shown in Telegram next to the input when the user taps `/` (command menu). */
export const BOT_COMMANDS = [
  { command: "start", description: "Open main menu (inline buttons)" },
  { command: "help", description: "How to use this bot" },
  { command: "add_alarm", description: "Add a new alarm" },
  { command: "edit_alarm", description: "Edit an alarm" },
  { command: "delete_alarm", description: "Delete an alarm" },
  { command: "list_alarms", description: "List all alarms" },
  { command: "active", description: "Activate an alarm" },
  { command: "inactive", description: "Deactivate an alarm" },
  { command: "set_timezone", description: "Add a timezone" },
  { command: "list_timezones", description: "List your timezones" },
  {
    command: "set_primary_timezone",
    description: "Choose primary timezone for schedules",
  },
];

export async function registerBotCommands(bot) {
  try {
    await bot.telegram.setMyCommands(BOT_COMMANDS);
    log.info("Telegram command menu registered", {
      count: BOT_COMMANDS.length,
    });
  } catch (e) {
    log.warn("setMyCommands failed", e?.message || e);
  }
}
