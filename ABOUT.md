# Bot profile copy (Telegram / BotFather)

Use the sections below when configuring the bot in [@BotFather](https://t.me/BotFather) (`/setdescription`, `/setabouttext`) or on a simple “About” page you host and link as your **privacy policy URL** if required.

---

## Short description (BotFather `/setdescription`, up to ~512 characters)

```
Personal alarm bot: recurring alarms (daily–yearly), one-time alarms, IANA timezones, snooze. Self-hosted; your data stays on the server you run. Access is restricted to configured users only.
```

## About text (BotFather `/setabouttext`, profile “About”)

```
Schedules alarms in your primary timezone, lists them in all saved zones, and can snooze fired alerts. One-time alarms are removed after they fire. Add, edit, delete, and timezone controls from the menu or commands. This instance is private—only invited user IDs can chat with the bot.
```

---

## Full description (website, README link, or onboarding)

**Smart Guy** is a **self-hosted** assistant for **recurring alarms** (daily with optional weekdays, weekly, monthly, yearly) and **one-time** alarms. You set times in your **primary** IANA timezone; notifications can show the same instant in **additional** zones you add. After a one-time alarm fires, it is **deleted** from storage. Snooze shortcuts (10–60 minutes) apply to recurring alarms.

The bot is designed as a **private** product: only Telegram user IDs listed in the operator’s configuration may use it. Data is stored in a **local SQLite** file on the machine (or container) that runs the bot—**no** cloud database is required.

---

## Privacy policy (self-hosted operator)

_This policy describes how **this software** handles data when **you** (the operator) run it. If you run the bot for yourself, you are both operator and end user. If you run it for others, adapt the “operator” and “users” wording and publish this (or your lawyer-reviewed version) where users can read it._

### Who is responsible

The **person or organization running the bot** (the **operator**) is responsible for the server, configuration, backups, and compliance with applicable law. The software authors provide code only; they do not receive your alarms, messages, or database by default.

### What data is processed

When an allowed user interacts with the bot, the operator’s server may store:

- **Telegram user id**, username, first name, last name, and language code (as provided by Telegram when the user uses the bot).
- **Alarms**: titles, descriptions, schedule fields (time, recurrence, anchors, weekdays), active/inactive state, and technical fields (e.g. last fired time, one-time flag).
- **Timezones**: IANA names and which one is primary.
- **Short-lived conversation state** (e.g. multi-step “add alarm” flows) in the database until completed or cleared.
- **Snooze tasks** (scheduled follow-up notifications) until they fire or are cleared.

The bot sends messages through **Telegram’s servers**; Telegram’s own privacy policy applies to Telegram’s platform.

### What is not collected by the software (by default)

- No separate analytics SDK, ad tracking, or third-party telemetry is built into this project.
- No central “phone home” to the authors: the bot only talks to Telegram’s Bot API and uses local SQLite unless you change the code.

### Retention and deletion

- Data persists in the operator’s **SQLite file** until deleted by the user (via the bot), by the operator (file removal or DB maintenance), or by **automated rules** in the software:
  - **One-time alarms** are removed from the database **after** a successful delivery notification.
  - When Telegram reports that an allowed user has **stopped or blocked** the bot (`my_chat_member`), the software **deletes that user’s row** and related records (alarms, timezones, sessions, snooze tasks) via database cascade rules.

### Security

- The **bot token** and **allowed user IDs** must be kept secret (e.g. environment variables, not committed to public repos).
- Anyone with server access can read or modify the SQLite file; operators should use disk permissions, backups, and hosting practices appropriate to their threat model.

### User rights

Depending on jurisdiction, users may have rights to access, correct, export, or erase data. For this self-hosted setup, those requests are fulfilled by the **operator** (e.g. deleting rows, providing a DB export, or removing the SQLite file from backups).

### Changes

Operators should update this document when they change hosting, data practices, or who may use the bot.

### Contact

+1 619 963 8308

---

## Optional: Privacy policy URL

If BotFather asks for a **privacy policy link**, host this file (or an HTML version) at a public URL—for example a static page on GitHub Pages, your domain, or a pinned message channel—and set:

`/setprivacy` → your URL

---

## License (software)

See `README.md` (MIT unless you have changed it).
