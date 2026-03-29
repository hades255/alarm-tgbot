import { DateTime } from "luxon";
import { parseTimeHhmm, parseWeekdaysJson, formatInZones } from "./time.js";
import {
  listAlarmsForScheduler,
  markAlarmFired,
  deleteAlarm,
  dueSnoozeTasks,
  deleteSnoozeTask,
  listUserTimezones,
} from "./db.js";
import { log } from "./logger.js";

export function minuteKeyUtc(dt) {
  return dt.toUTC().startOf("minute").toISO();
}

export function isOneTimeAlarm(alarm) {
  return Number(alarm?.one_time) === 1;
}

export function shouldFireAlarm(alarm, primaryIana, nowUtc) {
  const t = parseTimeHhmm(alarm.time_hhmm);
  if (!t) return false;
  const local = nowUtc.setZone(primaryIana);
  if (!local.isValid) return false;
  if (local.hour !== t.hour || local.minute !== t.minute) return false;

  if (isOneTimeAlarm(alarm)) {
    if (!alarm.anchor_date) return false;
    const anchor = DateTime.fromISO(String(alarm.anchor_date).slice(0, 10), {
      zone: primaryIana,
    });
    if (!anchor.isValid) return false;
    return (
      local.year === anchor.year &&
      local.month === anchor.month &&
      local.day === anchor.day
    );
  }

  const wday0Sun = local.weekday % 7;

  switch (alarm.recurrence) {
    case "daily": {
      const wd = parseWeekdaysJson(alarm.weekdays);
      if (wd == null || wd.length === 0) return true;
      return wd.includes(wday0Sun);
    }
    case "weekly": {
      if (!alarm.anchor_date) return false;
      const anchor = DateTime.fromISO(String(alarm.anchor_date), {
        zone: primaryIana,
      });
      if (!anchor.isValid) return false;
      return anchor.weekday % 7 === wday0Sun;
    }
    case "monthly": {
      if (!alarm.anchor_date) return false;
      const anchor = DateTime.fromISO(String(alarm.anchor_date), {
        zone: primaryIana,
      });
      if (!anchor.isValid) return false;
      return local.day === anchor.day;
    }
    case "yearly": {
      if (!alarm.anchor_date) return false;
      const anchor = DateTime.fromISO(String(alarm.anchor_date), {
        zone: primaryIana,
      });
      if (!anchor.isValid) return false;
      return local.month === anchor.month && local.day === anchor.day;
    }
    default:
      return false;
  }
}

/**
 * Next fire instant (UTC) strictly after `nowUtc`, using the same rules as the scheduler.
 */
export function getNextAlarmFireUtc(
  alarm,
  primaryIana,
  nowUtc = DateTime.utc()
) {
  if (alarm.status !== "active") return null;
  const t = parseTimeHhmm(alarm.time_hhmm);
  if (!t) return null;
  const localNow = nowUtc.setZone(primaryIana);
  if (!localNow.isValid) return null;

  if (isOneTimeAlarm(alarm)) {
    if (!alarm.anchor_date) return null;
    const anchor = DateTime.fromISO(String(alarm.anchor_date).slice(0, 10), {
      zone: primaryIana,
    });
    if (!anchor.isValid) return null;
    const cand = anchor.set({
      hour: t.hour,
      minute: t.minute,
      second: 0,
      millisecond: 0,
    });
    if (!cand.isValid) return null;
    const candUtc = cand.toUTC();
    if (candUtc <= nowUtc) return null;
    return candUtc;
  }

  for (let offset = 0; offset < 370; offset++) {
    const dayBase = localNow.startOf("day").plus({ days: offset });
    const cand = dayBase.set({
      hour: t.hour,
      minute: t.minute,
      second: 0,
      millisecond: 0,
    });
    if (!cand.isValid) continue;
    if (cand <= localNow) continue;
    const candUtc = cand.toUTC();
    if (!shouldFireAlarm(alarm, primaryIana, candUtc)) continue;
    return candUtc;
  }
  return null;
}

/** Human-readable countdown for list UI (empty if unknown). */
export function formatRemainingUntilNext(fromUtc, nextUtc) {
  if (!nextUtc || !nextUtc.isValid) return "";
  const ms = nextUtc.toMillis() - fromUtc.toMillis();
  if (ms <= 0) return " · next in <1m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return ` · next in ${h}h ${m}m`;
  if (h > 0) return ` · next in ${h}h`;
  return ` · next in ${m}m`;
}

export function orderedZonesForUser(userId) {
  const rows = listUserTimezones(userId);
  const prim = rows.filter((r) => r.is_primary);
  const rest = rows.filter((r) => !r.is_primary);
  return [...prim, ...rest].map((r) => r.timezone);
}

export function buildNotificationText({
  title,
  description,
  userId,
  firedAtIsoUtc,
}) {
  const zones = orderedZonesForUser(userId);
  if (zones.length === 0) zones.push("UTC");
  const lines = formatInZones(firedAtIsoUtc, zones);
  const primaryLine = lines[0];
  const otherLines = lines.slice(1);
  let body = `${title}\n\n${description || "(no description)"}\n\n`;
  body += `${primaryLine}\n`;
  if (otherLines.length) {
    body += otherLines.map((l) => `${l}`).join("\n");
  }
  return body;
}

export function snoozeKeyboard(alarmId, taskId) {
  const mins = [10, 20, 30, 40, 50, 60];
  const row = mins.map((m) => ({
    text: `${m} min`,
    callback_data:
      taskId != null ? `sz:t:${taskId}:${m}` : `sz:a:${alarmId}:${m}`,
  }));
  return [row];
}

export async function runSchedulerTick(bot) {
  const now = DateTime.utc();
  const key = minuteKeyUtc(now);
  const nowIso = now.toISO();

  const tasks = dueSnoozeTasks(nowIso);
  for (const task of tasks) {
    try {
      const firedIso = now.toISO();
      const text = buildNotificationText({
        title: task.title,
        description: task.description,
        userId: task.user_id,
        firedAtIsoUtc: firedIso,
      });
      await bot.telegram.sendMessage(task.user_id, text, {
        reply_markup: {
          inline_keyboard: snoozeKeyboard(task.alarm_id, task.id),
        },
      });
      deleteSnoozeTask(task.id);
      log.info("Snooze delivered", {
        taskId: task.id,
        userId: task.user_id,
        alarmId: task.alarm_id,
      });
    } catch (e) {
      log.error("Snooze delivery failed", {
        taskId: task.id,
        userId: task.user_id,
        message: e?.response?.description || e?.message || String(e),
      });
      deleteSnoozeTask(task.id);
    }
  }

  const alarms = listAlarmsForScheduler();
  for (const alarm of alarms) {
    const tz = alarm.primary_tz;
    if (!shouldFireAlarm(alarm, tz, now)) continue;
    if (alarm.last_fired_at === key) continue;
    try {
      const firedIso = now.toISO();
      const text = buildNotificationText({
        title: alarm.title,
        description: alarm.description,
        userId: alarm.user_id,
        firedAtIsoUtc: firedIso,
      });
      const oneTime = isOneTimeAlarm(alarm);
      const label = oneTime ? "One-time alarm" : "Alarm";
      await bot.telegram.sendMessage(alarm.user_id, `${label}\n\n${text}`, {
        reply_markup: oneTime
          ? undefined
          : { inline_keyboard: snoozeKeyboard(alarm.id, null) },
      });
      if (oneTime) {
        const removed = deleteAlarm(alarm.id, alarm.user_id);
        if (removed) {
          log.info("One-time alarm delivered and removed from database", {
            alarmId: alarm.id,
            userId: alarm.user_id,
          });
        } else {
          markAlarmFired(alarm.id, key);
          log.warn("One-time alarm sent but delete failed; marked fired", {
            alarmId: alarm.id,
            userId: alarm.user_id,
          });
        }
      } else {
        markAlarmFired(alarm.id, key);
        log.info("Scheduled alarm delivered", {
          alarmId: alarm.id,
          userId: alarm.user_id,
          recurrence: alarm.recurrence,
          primaryTz: tz,
          minuteUtc: key,
        });
      }
    } catch (e) {
      log.error("Alarm delivery failed", {
        alarmId: alarm.id,
        userId: alarm.user_id,
        message: e?.response?.description || e?.message || String(e),
      });
    }
  }
}
