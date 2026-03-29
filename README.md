# Telegram Alarm Bot

A private, self-hosted Telegram bot for recurring **alarms** and **reminders**, multiple **IANA timezones**, **snooze** shortcuts, and **SQLite** persistence. Scheduling uses your **primary** timezone; notifications show the same instant in all saved zones.

## Features

- Main menu with inline buttons: add / edit / delete / list, activate & deactivate, timezone management, help
- Recurrence: daily (optional weekdays), weekly, monthly, yearly
- Alarm vs reminder (same scheduling; different label on delivery)
- Snooze: 10–60 minutes from the notification message
- Access control: only user ids listed in `TELEGRAM_USER_ID` may use the bot
- Data stored in SQLite (file), no external database server

## Requirements

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2, **or** Node.js 20+

## Quick start (Docker)

1. Copy the environment template and edit values:

   ```bash
   cp .env.example .env
   ```

2. Set `BOT_TOKEN` (from [@BotFather](https://t.me/BotFather)) and `TELEGRAM_USER_ID` (your numeric id, e.g. from [@userinfobot](https://t.me/userinfobot)).

3. Start the stack:

   ```bash
   docker compose up -d --build
   ```

4. Open Telegram, find your bot, send `/start`.

The database file lives in the Docker volume `alarm_data` (path inside the container: `/data/bot.db`).

## Local run (Node)

```bash
npm install
cp .env.example .env
# edit .env
npm start
```

Ensure `SQLITE_PATH` points to a writable path (default `./data/bot.db`).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_USER_ID` | Yes | Allowed user id(s), comma-separated |
| `SQLITE_PATH` | No | SQLite file path (Compose sets `/data/bot.db`) |
| `DEFAULT_TIMEZONE` | No | Primary zone before you add one (default `UTC`) |

## Commands

- `/start` — main menu  
- `/help` — help  
- `/add_alarm`, `/edit_alarm`, `/delete_alarm`, `/list_alarms`  
- `/active`, `/inactive` — activate or deactivate  
- `/set_timezone`, `/list_timezones`, `/set_primary_timezone`  

## Extending

- **Handlers**: `src/botHandlers.js` — add commands or callbacks; keep callback strings under 64 bytes.
- **Scheduler**: `src/scheduler.js` — `runSchedulerTick`; alarm matching uses Luxon + primary timezone from the DB.
- **Schema**: `src/db.js` — `initSchema` runs on startup (safe `CREATE IF NOT EXISTS`).

## License

MIT
