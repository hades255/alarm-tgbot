import { Markup } from "telegraf";
import { DateTime } from "luxon";
import { config } from "./config.js";
import {
  upsertUser,
  ensurePrimaryTimezone,
  addUserTimezone,
  listUserTimezones,
  getPrimaryTimezone,
  getSession,
  setSession,
  clearSession,
  insertAlarm,
  updateAlarmFields,
  deleteAlarm,
  getAlarm,
  listAlarms,
  insertSnoozeTask,
  getDb,
} from "./db.js";
import { parseTimeHhmm } from "./time.js";
import {
  mainMenu,
  addAlarmRootMenu,
  editAlarmRootMenu,
  deleteAlarmRootMenu,
  toggleRootMenu,
  backMain,
  weekdayPicker,
  weeklyDayPicker,
  alarmRowButtons,
  confirmDelete,
  editFieldMenu,
} from "./keyboards.js";

async function safeEditMessageText(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (e) {
    const desc = e?.response?.description ?? "";
    if (String(desc).includes("message is not modified")) return;
    throw e;
  }
}

function authUser(ctx, next) {
  const id = ctx.from?.id;
  if (!id || !config.allowedUserIds.includes(id)) {
    return ctx.reply("This bot is private. Your user id is not authorized.");
  }
  return next();
}

function syncUser(ctx) {
  upsertUser({
    user_id: ctx.from.id,
    username: ctx.from.username || "",
    first_name: ctx.from.first_name || "",
    last_name: ctx.from.last_name || "",
    language_code: ctx.from.language_code || "",
  });
  const primary = getPrimaryTimezone(ctx.from.id);
  if (!primary) {
    ensurePrimaryTimezone(ctx.from.id, config.defaultTimezone);
  }
}

function anchorForLuxonWeekday(d) {
  const mon = DateTime.fromISO("2000-01-03", { zone: "UTC" });
  return mon.plus({ days: d - 1 }).toISODate();
}

function luxonWeekdaysToSunday0(luxonDays) {
  return [...new Set(luxonDays.map((d) => d % 7))].sort((a, b) => a - b);
}

function sun0ToLuxonWeekdays(arr) {
  if (!arr || !arr.length) return [];
  return [...new Set(arr.map((s) => (s === 0 ? 7 : s)))].sort((a, b) => a - b);
}

const HELP_TEXT = `Alarm Bot — quick guide

**Main menu**
Use the buttons to add, edit, delete, or list alarms and reminders, manage timezones, or toggle active state.

**Alarms vs reminders**
Both support daily / weekly / monthly / yearly schedules. Use reminders for softer notifications; behavior is the same, labels differ.

**Daily schedules**
You can restrict to specific weekdays or choose “Every day”.

**Time**
Use 24-hour format: \`14:30\` for 2:30 PM.

**Timezones**
Add IANA zones (e.g. \`Europe/Berlin\`, \`America/New_York\`). One primary zone is used to evaluate schedules. Default is UTC.

**Snooze**
When a notification fires, use the inline buttons to repeat after 10–60 minutes.

**Commands**
/start — main menu  
/help — this message  
/add_alarm, /edit_alarm, /delete_alarm, /list_alarms  
/active, /inactive — activate or deactivate an alarm  
/set_timezone, /list_timezones, /set_primary_timezone  
`;

export function registerHandlers(bot) {
  bot.use((ctx, next) => {
    if (ctx.callbackQuery) {
      return authUser(ctx, () => {
        syncUser(ctx);
        return next();
      });
    }
    if (ctx.message && "text" in ctx.message) {
      return authUser(ctx, () => {
        syncUser(ctx);
        return next();
      });
    }
    return next();
  });

  bot.start(async (ctx) => {
    syncUser(ctx);
    await ctx.reply("Welcome. Choose an action:", mainMenu());
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
  });

  const cmdMap = [
    ["add_alarm", () => addAlarmRootMenu()],
    ["edit_alarm", () => editAlarmRootMenu()],
    ["delete_alarm", () => deleteAlarmRootMenu()],
    ["list_alarms", null],
    ["active", null],
    ["inactive", null],
    ["set_timezone", null],
    ["list_timezones", null],
    ["set_primary_timezone", null],
  ];

  for (const [cmd, kb] of cmdMap) {
    bot.command(cmd, async (ctx) => {
      syncUser(ctx);
      if (cmd === "list_alarms") {
        await sendAlarmList(ctx, {});
        return;
      }
      if (cmd === "active") {
        await sendToggleList(ctx, "inactive");
        return;
      }
      if (cmd === "inactive") {
        await sendToggleList(ctx, "active");
        return;
      }
      if (cmd === "set_timezone") {
        setSession(ctx.from.id, "TZ_INPUT", {});
        await ctx.reply(
          "Send an IANA timezone name to add (example: `Europe/Berlin`).",
          {
            parse_mode: "Markdown",
            ...Markup.removeKeyboard(),
          }
        );
        return;
      }
      if (cmd === "list_timezones") {
        await sendTimezoneList(ctx);
        return;
      }
      if (cmd === "set_primary_timezone") {
        const rows = listUserTimezones(ctx.from.id);
        if (!rows.length) {
          await ctx.reply(
            "No timezones yet. Use Set timezone first.",
            backMain()
          );
          return;
        }
        const buttons = rows.map((r) => [
          Markup.button.callback(
            `${r.is_primary ? "★ " : ""}${r.timezone}`,
            `tzpri:${r.timezone}`
          ),
        ]);
        buttons.push([
          Markup.button.callback("Back to main menu", "menu:main"),
        ]);
        await ctx.reply(
          "Pick primary timezone:",
          Markup.inlineKeyboard(buttons)
        );
        return;
      }
      if (typeof kb === "function") {
        await ctx.reply("Choose:", kb());
      }
    });
  }

  bot.action("menu:main", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(ctx, "Main menu. Choose an action:", mainMenu());
  });

  bot.action("menu:help", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(ctx, HELP_TEXT, {
      parse_mode: "Markdown",
      ...backMain(),
    });
  });

  bot.action("menu:add_root", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(
      ctx,
      "Add alarm or reminder:",
      addAlarmRootMenu()
    );
  });

  bot.action("menu:edit_root", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(
      ctx,
      "Edit by schedule type:",
      editAlarmRootMenu()
    );
  });

  bot.action("menu:del_root", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(
      ctx,
      "Delete by schedule type:",
      deleteAlarmRootMenu()
    );
  });

  bot.action("menu:list", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAlarmListEdit(ctx, {});
  });

  bot.action("menu:toggle_root", async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditMessageText(
      ctx,
      "Activate or deactivate alarms:",
      toggleRootMenu()
    );
  });

  bot.action("menu:tz_set", async (ctx) => {
    await ctx.answerCbQuery();
    setSession(ctx.from.id, "TZ_INPUT", {});
    await safeEditMessageText(
      ctx,
      "Send an IANA timezone name in the chat (example: Europe/Berlin).",
      backMain()
    );
  });

  bot.action("menu:tz_list", async (ctx) => {
    await ctx.answerCbQuery();
    await sendTimezoneListEdit(ctx);
  });

  bot.action("menu:tz_primary", async (ctx) => {
    await ctx.answerCbQuery();
    const rows = listUserTimezones(ctx.from.id);
    if (!rows.length) {
      await safeEditMessageText(
        ctx,
        "No timezones yet. Use Set timezone first.",
        backMain()
      );
      return;
    }
    const buttons = rows.map((r) => [
      Markup.button.callback(
        `${r.is_primary ? "★ " : ""}${r.timezone}`,
        `tzpri:${r.timezone}`
      ),
    ]);
    buttons.push([Markup.button.callback("Back to main menu", "menu:main")]);
    await safeEditMessageText(
      ctx,
      "Pick primary timezone:",
      Markup.inlineKeyboard(buttons)
    );
  });

  bot.action(
    /^add:(alarm|reminder):(daily|weekly|monthly|yearly)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      const kind = ctx.match[1];
      const recurrence = ctx.match[2];
      const uid = ctx.from.id;
      if (recurrence === "daily") {
        setSession(uid, "ADD_WEEKDAYS", {
          kind,
          recurrence,
          weekdaysLuxon: [],
        });
        await safeEditMessageText(
          ctx,
          "Select weekdays (tap to toggle), or choose Every day, then Done:",
          weekdayPicker([])
        );
        return;
      }
      if (recurrence === "weekly") {
        setSession(uid, "ADD_WEEKLY_ANCHOR", { kind, recurrence });
        await safeEditMessageText(
          ctx,
          "Which weekday should this repeat on?",
          weeklyDayPicker()
        );
        return;
      }
      if (recurrence === "monthly") {
        setSession(uid, "ADD_MONTH_DAY", { kind, recurrence });
        await safeEditMessageText(
          ctx,
          "Send the day of month (1–31) as a message.",
          backMain()
        );
        return;
      }
      if (recurrence === "yearly") {
        setSession(uid, "ADD_YEAR_MD", { kind, recurrence });
        await safeEditMessageText(
          ctx,
          "Send month and day as MM-DD (example: 03-29).",
          backMain()
        );
        return;
      }
    }
  );

  bot.action(/^wd:(\d+|all|done)$/, async (ctx) => {
    const uid = ctx.from.id;
    const { scene, data } = getSession(uid);
    if (scene !== "ADD_WEEKDAYS" && scene !== "EDIT_WEEKDAYS") {
      await ctx.answerCbQuery();
      return;
    }
    const key = ctx.match[1];
    if (key === "done" && scene === "EDIT_WEEKDAYS") {
      if (!data.everyDay) {
        const lux = data.weekdaysLuxon || [];
        if (lux.length === 0) {
          await ctx.answerCbQuery({
            text: "Pick days or Every day",
            show_alert: true,
          });
          return;
        }
      }
      const sun0 =
        data.everyDay || !(data.weekdaysLuxon || []).length
          ? null
          : JSON.stringify(luxonWeekdaysToSunday0(data.weekdaysLuxon));
      updateAlarmFields(data.alarmId, uid, { weekdays: sun0 });
      clearSession(uid);
      await ctx.answerCbQuery();
      await safeEditMessageText(ctx, "Weekdays updated.", mainMenu());
      return;
    }
    if (scene !== "ADD_WEEKDAYS") {
      await ctx.answerCbQuery();
      if (key === "all") {
        data.weekdaysLuxon = [];
        data.everyDay = true;
        setSession(uid, "EDIT_WEEKDAYS", data);
        await safeEditMessageText(
          ctx,
          "Select weekdays (tap to toggle), or Every day, then Done:",
          weekdayPicker([])
        );
        return;
      }
      if (key === "done") return;
      const d = Number(key);
      const set = new Set(data.weekdaysLuxon || []);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      data.weekdaysLuxon = [...set].sort((a, b) => a - b);
      data.everyDay = false;
      setSession(uid, "EDIT_WEEKDAYS", data);
      await safeEditMessageText(
        ctx,
        "Select weekdays (tap to toggle), or Every day, then Done:",
        weekdayPicker(data.weekdaysLuxon)
      );
      return;
    }
    if (key === "all") {
      await ctx.answerCbQuery();
      data.weekdaysLuxon = [];
      data.everyDay = true;
      setSession(uid, "ADD_TITLE", { ...data, weekdaysLuxon: [] });
      await safeEditMessageText(
        ctx,
        "Send the title (short label).",
        backMain()
      );
      return;
    }
    if (key === "done") {
      if (!data.everyDay) {
        const lux = data.weekdaysLuxon || [];
        if (lux.length === 0) {
          await ctx.answerCbQuery({
            text: "Pick days or Every day",
            show_alert: true,
          });
          return;
        }
      }
      await ctx.answerCbQuery();
      setSession(uid, "ADD_TITLE", { ...data });
      await safeEditMessageText(
        ctx,
        "Send the title (short label).",
        backMain()
      );
      return;
    }
    await ctx.answerCbQuery();
    const d = Number(key);
    const set = new Set(data.weekdaysLuxon || []);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    data.weekdaysLuxon = [...set].sort((a, b) => a - b);
    data.everyDay = false;
    setSession(uid, "ADD_WEEKDAYS", data);
    await safeEditMessageText(
      ctx,
      "Select weekdays (tap to toggle), or Every day, then Done:",
      weekdayPicker(data.weekdaysLuxon)
    );
  });

  bot.action(/^anchor:w:(\d)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id;
    const d = Number(ctx.match[1]);
    const { scene, data } = getSession(uid);
    if (scene !== "ADD_WEEKLY_ANCHOR") return;
    const anchor = anchorForLuxonWeekday(d);
    setSession(uid, "ADD_TITLE", { ...data, anchor_date: anchor });
    await safeEditMessageText(ctx, "Send the title (short label).", backMain());
  });

  bot.action(
    /^pick:edit:(daily|weekly|monthly|yearly|reminder)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      const uid = ctx.from.id;
      const t = ctx.match[1];
      let alarms = [];
      if (t === "reminder") {
        alarms = listAlarms(uid, { kind: "reminder" });
      } else {
        alarms = listAlarms(uid, { kind: "alarm", recurrence: t });
      }
      if (!alarms.length) {
        await safeEditMessageText(
          ctx,
          "No matching items.",
          editAlarmRootMenu()
        );
        return;
      }
      await safeEditMessageText(
        ctx,
        "Pick an item to edit:",
        alarmRowButtons(alarms, "eid")
      );
    }
  );

  bot.action(
    /^pick:del:(daily|weekly|monthly|yearly|reminder)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      const uid = ctx.from.id;
      const t = ctx.match[1];
      let alarms = [];
      if (t === "reminder") {
        alarms = listAlarms(uid, { kind: "reminder" });
      } else {
        alarms = listAlarms(uid, { kind: "alarm", recurrence: t });
      }
      if (!alarms.length) {
        await safeEditMessageText(
          ctx,
          "No matching items.",
          deleteAlarmRootMenu()
        );
        return;
      }
      await safeEditMessageText(
        ctx,
        "Pick an item to delete:",
        alarmRowButtons(alarms, "did")
      );
    }
  );

  bot.action(/^pick:on:root$/, async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id;
    const alarms = listAlarms(uid).filter((a) => a.status === "inactive");
    if (!alarms.length) {
      await safeEditMessageText(ctx, "No inactive alarms.", toggleRootMenu());
      return;
    }
    await safeEditMessageText(
      ctx,
      "Pick an alarm to activate:",
      alarmRowButtons(alarms, "ton")
    );
  });

  bot.action(/^pick:off:root$/, async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id;
    const alarms = listAlarms(uid).filter((a) => a.status === "active");
    if (!alarms.length) {
      await safeEditMessageText(ctx, "No active alarms.", toggleRootMenu());
      return;
    }
    await safeEditMessageText(
      ctx,
      "Pick an alarm to deactivate:",
      alarmRowButtons(alarms, "toff")
    );
  });

  bot.action(/^eid:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    const a = getAlarm(id, ctx.from.id);
    if (!a) return;
    await safeEditMessageText(ctx, formatAlarmLine(a), editFieldMenu(id));
  });

  bot.action(/^ef:(\d+):(title|desc|time|weekdays)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    const field = ctx.match[2];
    const a = getAlarm(id, ctx.from.id);
    if (!a) return;
    if (field === "weekdays" && a.recurrence !== "daily") {
      await ctx.answerCbQuery({
        text: "Weekdays apply to daily items only",
        show_alert: true,
      });
      return;
    }
    const sceneMap = {
      title: "EDIT_TITLE",
      desc: "EDIT_DESC",
      time: "EDIT_TIME",
      weekdays: "EDIT_WEEKDAYS",
    };
    setSession(ctx.from.id, sceneMap[field], { alarmId: id });
    const prompts = {
      title: "Send the new title.",
      desc: "Send the new description (or /skip).",
      time: "Send the new time as HH:MM (24h).",
      weekdays: "Toggle weekdays, then Done.",
    };
    if (field === "weekdays") {
      let current = null;
      try {
        current = a.weekdays ? JSON.parse(a.weekdays) : null;
      } catch {
        current = null;
      }
      const lux = sun0ToLuxonWeekdays(Array.isArray(current) ? current : []);
      const everyDay = !current || !current.length;
      setSession(ctx.from.id, "EDIT_WEEKDAYS", {
        alarmId: id,
        weekdaysLuxon: everyDay ? [] : lux,
        everyDay,
      });
      await safeEditMessageText(
        ctx,
        prompts.weekdays,
        weekdayPicker(everyDay ? [] : lux)
      );
      return;
    }
    await safeEditMessageText(ctx, prompts[field], backMain());
  });

  bot.action(/^did:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    const a = getAlarm(id, ctx.from.id);
    if (!a) return;
    await safeEditMessageText(
      ctx,
      `Delete this?\n\n${formatAlarmLine(a)}`,
      confirmDelete(id)
    );
  });

  bot.action(/^del:yes:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    deleteAlarm(id, ctx.from.id);
    await safeEditMessageText(ctx, "Deleted.", deleteAlarmRootMenu());
  });

  bot.action(/^ton:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    updateAlarmFields(id, ctx.from.id, { status: "active" });
    await safeEditMessageText(ctx, "Activated.", toggleRootMenu());
  });

  bot.action(/^toff:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    updateAlarmFields(id, ctx.from.id, { status: "inactive" });
    await safeEditMessageText(ctx, "Deactivated.", toggleRootMenu());
  });

  bot.action(/^tzpri:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const zone = ctx.match[1];
    const uid = ctx.from.id;
    addUserTimezone(uid, zone, true);
    await safeEditMessageText(
      ctx,
      `Primary timezone set to ${zone}.`,
      mainMenu()
    );
  });

  bot.action(/^sz:a:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const alarmId = Number(ctx.match[1]);
    const mins = Number(ctx.match[2]);
    const uid = ctx.from.id;
    const a = getAlarm(alarmId, uid);
    if (!a) {
      await ctx.reply("That alarm is not available.");
      return;
    }
    const title = a.title;
    const desc = a.description;
    const kind = a.kind;
    const fireAt = DateTime.utc().plus({ minutes: mins }).toISO();
    insertSnoozeTask({
      user_id: uid,
      alarm_id: alarmId,
      fire_at: fireAt,
      title: `${title} (snooze ${mins}m)`,
      description: desc,
      kind,
    });
    await ctx.reply(`Snoozed for ${mins} minutes.`);
  });

  bot.action(/^sz:t:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const taskId = Number(ctx.match[1]);
    const mins = Number(ctx.match[2]);
    const uid = ctx.from.id;
    const row = getDb()
      .prepare("SELECT * FROM snooze_tasks WHERE id = ? AND user_id = ?")
      .get(taskId, uid);
    if (!row) {
      await ctx.reply("Snooze task not found.");
      return;
    }
    const fireAt = DateTime.utc().plus({ minutes: mins }).toISO();
    const baseTitle = String(row.title).replace(/ \(snooze \d+m\)$/u, "");
    updateSnoozeTask(taskId, uid, {
      fire_at: fireAt,
      title: `${baseTitle} (snooze ${mins}m)`,
    });
    await ctx.reply(`Snooze updated to ${mins} minutes from now.`);
  });

  bot.on("text", async (ctx, next) => {
    const uid = ctx.from.id;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();

    const { scene, data } = getSession(uid);

    if (scene === "TZ_INPUT") {
      const zone = text;
      const test = DateTime.now().setZone(zone);
      if (!test.isValid) {
        await ctx.reply(
          "Invalid timezone. Try an IANA name like Europe/Berlin."
        );
        return;
      }
      addUserTimezone(uid, zone, false);
      clearSession(uid);
      await ctx.reply(`Timezone added: ${zone}`, mainMenu());
      return;
    }

    if (scene === "ADD_MONTH_DAY") {
      const day = Number(text);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        await ctx.reply("Send a number from 1 to 31.");
        return;
      }
      const anchor = DateTime.fromObject(
        { year: 2000, month: 1, day },
        { zone: "UTC" }
      ).toISODate();
      setSession(uid, "ADD_TITLE", { ...data, anchor_date: anchor });
      await ctx.reply("Send the title (short label).");
      return;
    }

    if (scene === "ADD_YEAR_MD") {
      const m = /^(\d{2})-(\d{2})$/.exec(text);
      if (!m) {
        await ctx.reply("Use MM-DD, example: 03-29");
        return;
      }
      const month = Number(m[1]);
      const day = Number(m[2]);
      const anchor = DateTime.fromObject(
        { year: 2000, month, day },
        { zone: "UTC" }
      );
      if (!anchor.isValid) {
        await ctx.reply("Invalid date.");
        return;
      }
      setSession(uid, "ADD_TITLE", {
        ...data,
        anchor_date: anchor.toISODate(),
      });
      await ctx.reply("Send the title (short label).");
      return;
    }

    if (scene === "ADD_TITLE") {
      data.title = text.slice(0, 200);
      setSession(uid, "ADD_DESC", data);
      await ctx.reply("Send a description, or /skip.");
      return;
    }

    if (scene === "ADD_DESC") {
      data.description = text === "/skip" ? "" : text.slice(0, 2000);
      setSession(uid, "ADD_TIME", data);
      await ctx.reply("Send time as HH:MM (24-hour, primary timezone).");
      return;
    }

    if (scene === "ADD_TIME") {
      const t = parseTimeHhmm(text);
      if (!t) {
        await ctx.reply("Invalid time. Example: 08:30");
        return;
      }
      const hhmm = `${String(t.hour).padStart(2, "0")}:${String(
        t.minute
      ).padStart(2, "0")}`;
      let weekdaysJson = null;
      if (data.recurrence === "daily") {
        if (
          data.everyDay ||
          !data.weekdaysLuxon ||
          data.weekdaysLuxon.length === 0
        ) {
          weekdaysJson = null;
        } else {
          const sun0 = luxonWeekdaysToSunday0(data.weekdaysLuxon);
          weekdaysJson = JSON.stringify(sun0);
        }
      }
      insertAlarm({
        user_id: uid,
        kind: data.kind,
        recurrence: data.recurrence,
        title: data.title,
        description: data.description || "",
        time_hhmm: hhmm,
        anchor_date: data.anchor_date || null,
        weekdays: weekdaysJson,
        status: "active",
      });
      clearSession(uid);
      await ctx.reply(
        "Saved. It will use your primary timezone for scheduling.",
        mainMenu()
      );
      return;
    }

    if (scene === "EDIT_TITLE") {
      updateAlarmFields(data.alarmId, uid, { title: text.slice(0, 200) });
      clearSession(uid);
      await ctx.reply("Title updated.", mainMenu());
      return;
    }

    if (scene === "EDIT_DESC") {
      const desc = text === "/skip" ? "" : text.slice(0, 2000);
      updateAlarmFields(data.alarmId, uid, { description: desc });
      clearSession(uid);
      await ctx.reply("Description updated.", mainMenu());
      return;
    }

    if (scene === "EDIT_TIME") {
      const t = parseTimeHhmm(text);
      if (!t) {
        await ctx.reply("Invalid time. Example: 08:30");
        return;
      }
      const hhmm = `${String(t.hour).padStart(2, "0")}:${String(
        t.minute
      ).padStart(2, "0")}`;
      updateAlarmFields(data.alarmId, uid, { time_hhmm: hhmm });
      clearSession(uid);
      await ctx.reply("Time updated.", mainMenu());
      return;
    }

    return next();
  });
}

function formatAlarmLine(a) {
  const wd = a.weekdays ? ` weekdays=${a.weekdays}` : "";
  const ad = a.anchor_date ? ` anchor=${a.anchor_date}` : "";
  return (
    `ID ${a.id} · ${a.kind} · ${a.recurrence}\n` +
    `Title: ${a.title}\n` +
    `Description: ${a.description || "—"}\n` +
    `Time: ${a.time_hhmm} (primary TZ)${wd}${ad}\n` +
    `Status: ${a.status}`
  );
}

async function sendAlarmList(ctx, filters) {
  const uid = ctx.from.id;
  const alarms = listAlarms(uid, filters);
  if (!alarms.length) {
    await ctx.reply("No alarms yet.", mainMenu());
    return;
  }
  const body = alarms.map(formatAlarmLine).join("\n\n—\n\n");
  await ctx.reply(body, mainMenu());
}

async function sendAlarmListEdit(ctx, filters) {
  const uid = ctx.from.id;
  const alarms = listAlarms(uid, filters);
  if (!alarms.length) {
    await safeEditMessageText(ctx, "No alarms yet.", mainMenu());
    return;
  }
  const body = alarms.map(formatAlarmLine).join("\n\n—\n\n");
  await safeEditMessageText(ctx, body, mainMenu());
}

async function sendToggleList(ctx, status) {
  const uid = ctx.from.id;
  const alarms = listAlarms(uid).filter((a) => a.status === status);
  const prefix = status === "active" ? "toff" : "ton";
  if (!alarms.length) {
    await ctx.reply(`No ${status} alarms.`, mainMenu());
    return;
  }
  await ctx.reply(
    `Pick an alarm to ${status === "active" ? "deactivate" : "activate"}:`,
    alarmRowButtons(alarms, prefix)
  );
}

async function sendTimezoneList(ctx) {
  const rows = listUserTimezones(ctx.from.id);
  if (!rows.length) {
    await ctx.reply(
      "No timezones. Default is UTC until you add one.",
      mainMenu()
    );
    return;
  }
  const body = rows
    .map((r) => `${r.is_primary ? "★ " : ""}${r.timezone}`)
    .join("\n");
  await ctx.reply(body, mainMenu());
}

async function sendTimezoneListEdit(ctx) {
  const rows = listUserTimezones(ctx.from.id);
  if (!rows.length) {
    await safeEditMessageText(
      ctx,
      "No timezones. Default is UTC until you add one.",
      mainMenu()
    );
    return;
  }
  const body = rows
    .map((r) => `${r.is_primary ? "★ " : ""}${r.timezone}`)
    .join("\n");
  await safeEditMessageText(ctx, body, mainMenu());
}
