import dotenv from "dotenv";

dotenv.config();

function parseAllowedUserIds(raw) {
  if (!raw || String(raw).trim() === "") return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

export const config = {
  botToken: process.env.BOT_TOKEN || "",
  allowedUserIds: parseAllowedUserIds(process.env.TELEGRAM_USER_ID),
  sqlitePath: process.env.SQLITE_PATH || "./data/bot.db",
  defaultTimezone: process.env.DEFAULT_TIMEZONE || "UTC",
};

export function assertConfig() {
  if (!config.botToken) {
    throw new Error("BOT_TOKEN is required in .env");
  }
  if (config.allowedUserIds.length === 0) {
    throw new Error(
      "TELEGRAM_USER_ID is required in .env (your numeric Telegram user id)"
    );
  }
}

/** Safe for console (no secrets). */
export function describeConfigForLog() {
  return {
    sqlitePath: config.sqlitePath,
    defaultTimezone: config.defaultTimezone,
    allowedUserIdsCount: config.allowedUserIds.length,
    botTokenConfigured: Boolean(config.botToken),
  };
}
