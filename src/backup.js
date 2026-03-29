import { DateTime } from "luxon";
import { config } from "./config.js";
import {
  getDb,
  listAlarms,
  listUserTimezones,
  insertAlarm,
  clearUserSchedulableData,
  ensurePrimaryTimezone,
} from "./db.js";

export const BACKUP_VERSION = 1;

const ALLOWED_KIND = new Set(["alarm", "reminder"]);
const ALLOWED_RECURRENCE = new Set([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);
const ALLOWED_STATUS = new Set(["active", "inactive"]);

export function buildBackupPayload(userId) {
  const tzRows = listUserTimezones(userId);
  const alarmRows = listAlarms(userId, {});
  return {
    version: BACKUP_VERSION,
    app: "telegram-alarm-bot",
    exportedAt: DateTime.utc().toISO(),
    timezones: tzRows.map((r) => ({
      timezone: r.timezone,
      is_primary: Number(r.is_primary) === 1,
    })),
    alarms: alarmRows.map((a) => ({
      kind: a.kind,
      recurrence: a.recurrence,
      title: a.title,
      description: a.description ?? "",
      time_hhmm: a.time_hhmm,
      anchor_date: a.anchor_date ?? null,
      weekdays: a.weekdays ?? null,
      status: a.status,
      one_time: Number(a.one_time) === 1 ? 1 : 0,
    })),
  };
}

function validTzName(name) {
  const z = DateTime.now().setZone(String(name));
  return z.isValid;
}

export function validateAndRestoreBackup(userId, raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid backup object." };
  }
  if (Number(data.version) !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version (expected ${BACKUP_VERSION}).`,
    };
  }
  if (!Array.isArray(data.timezones) || !Array.isArray(data.alarms)) {
    return { ok: false, error: "Backup must include timezones and alarms arrays." };
  }

  for (const tz of data.timezones) {
    if (!tz || typeof tz.timezone !== "string" || !validTzName(tz.timezone)) {
      return { ok: false, error: `Invalid timezone: ${tz?.timezone}` };
    }
  }

  const primaryCount = data.timezones.filter(
    (t) => t && (t.is_primary === true || t.is_primary === 1)
  ).length;
  if (data.timezones.length > 0 && primaryCount !== 1) {
    return {
      ok: false,
      error: "Backup must have exactly one primary timezone (or empty list).",
    };
  }

  for (const a of data.alarms) {
    if (!a || typeof a !== "object") {
      return { ok: false, error: "Invalid alarm entry." };
    }
    if (!ALLOWED_KIND.has(a.kind)) {
      return { ok: false, error: `Invalid alarm kind: ${a.kind}` };
    }
    if (!ALLOWED_RECURRENCE.has(a.recurrence)) {
      return { ok: false, error: `Invalid recurrence: ${a.recurrence}` };
    }
    if (typeof a.title !== "string" || !a.title.trim()) {
      return { ok: false, error: "Each alarm needs a non-empty title." };
    }
    if (typeof a.description !== "string") {
      return { ok: false, error: "Alarm description must be a string." };
    }
    if (typeof a.time_hhmm !== "string" || !/^\d{2}:\d{2}$/.test(a.time_hhmm)) {
      return { ok: false, error: `Invalid time_hhmm: ${a.time_hhmm}` };
    }
    if (a.anchor_date != null && typeof a.anchor_date !== "string") {
      return { ok: false, error: "anchor_date must be a string or null." };
    }
    if (a.weekdays != null && typeof a.weekdays !== "string") {
      return { ok: false, error: "weekdays must be a JSON string or null." };
    }
    if (!ALLOWED_STATUS.has(a.status)) {
      return { ok: false, error: `Invalid status: ${a.status}` };
    }
    const ot = Number(a.one_time);
    if (ot !== 0 && ot !== 1) {
      return { ok: false, error: "one_time must be 0 or 1." };
    }
  }

  const d = getDb();
  const run = d.transaction(() => {
    clearUserSchedulableData(userId);
    for (const tz of data.timezones) {
      d.prepare(
        "INSERT INTO timezones (user_id, timezone, is_primary) VALUES (?, ?, ?)"
      ).run(userId, tz.timezone, tz.is_primary ? 1 : 0);
    }
    if (data.timezones.length === 0) {
      ensurePrimaryTimezone(userId, config.defaultTimezone || "UTC");
    }
    for (const a of data.alarms) {
      insertAlarm({
        user_id: userId,
        kind: a.kind,
        recurrence: a.recurrence,
        title: a.title.slice(0, 200),
        description: String(a.description).slice(0, 2000),
        time_hhmm: a.time_hhmm,
        anchor_date: a.anchor_date ?? null,
        weekdays: a.weekdays ?? null,
        status: a.status,
        one_time: a.one_time ? 1 : 0,
      });
    }
  });
  run();
  return {
    ok: true,
    timezones: data.timezones.length,
    alarms: data.alarms.length,
  };
}
