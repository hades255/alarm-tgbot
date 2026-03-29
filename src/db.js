import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

let db;

export function getDb() {
  if (db) return db;
  const dir = path.dirname(config.sqlitePath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      language_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timezones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, timezone),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('alarm','reminder')),
      recurrence TEXT NOT NULL CHECK(recurrence IN ('daily','weekly','monthly','yearly')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      time_hhmm TEXT NOT NULL,
      anchor_date TEXT,
      weekdays TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      last_fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_alarms (
      user_id INTEGER NOT NULL,
      alarm_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, alarm_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      user_id INTEGER PRIMARY KEY,
      scene TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snooze_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      alarm_id INTEGER,
      fire_at TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'alarm',
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_alarms_user ON alarms(user_id);
    CREATE INDEX IF NOT EXISTS idx_alarms_status ON alarms(status);
    CREATE INDEX IF NOT EXISTS idx_snooze_fire ON snooze_tasks(fire_at);
  `);
}

export function upsertUser(row) {
  const d = getDb();
  d.prepare(
    `INSERT INTO users (user_id, username, first_name, last_name, language_code)
     VALUES (@user_id, @username, @first_name, @last_name, @language_code)
     ON CONFLICT(user_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       language_code = excluded.language_code`
  ).run(row);
}

export function ensurePrimaryTimezone(userId, iana) {
  const d = getDb();
  const row = d
    .prepare("SELECT id FROM timezones WHERE user_id = ? AND timezone = ?")
    .get(userId, iana);
  if (!row) {
    d.prepare(
      "INSERT INTO timezones (user_id, timezone, is_primary) VALUES (?, ?, 0)"
    ).run(userId, iana);
  }
  d.prepare("UPDATE timezones SET is_primary = 0 WHERE user_id = ?").run(
    userId
  );
  d.prepare(
    "UPDATE timezones SET is_primary = 1 WHERE user_id = ? AND timezone = ?"
  ).run(userId, iana);
}

export function addUserTimezone(userId, iana, makePrimary) {
  const d = getDb();
  const row = d
    .prepare("SELECT id FROM timezones WHERE user_id = ? AND timezone = ?")
    .get(userId, iana);
  if (!row) {
    d.prepare(
      "INSERT INTO timezones (user_id, timezone, is_primary) VALUES (?, ?, 0)"
    ).run(userId, iana);
  }
  if (makePrimary) {
    d.prepare("UPDATE timezones SET is_primary = 0 WHERE user_id = ?").run(
      userId
    );
    d.prepare(
      "UPDATE timezones SET is_primary = 1 WHERE user_id = ? AND timezone = ?"
    ).run(userId, iana);
  }
}

export function listUserTimezones(userId) {
  return getDb()
    .prepare(
      "SELECT timezone, is_primary FROM timezones WHERE user_id = ? ORDER BY is_primary DESC, timezone ASC"
    )
    .all(userId);
}

export function getPrimaryTimezone(userId) {
  const row = getDb()
    .prepare(
      "SELECT timezone FROM timezones WHERE user_id = ? AND is_primary = 1 LIMIT 1"
    )
    .get(userId);
  return row?.timezone || null;
}

export function deleteUserTimezone(userId, iana) {
  const d = getDb();
  const primary = getPrimaryTimezone(userId);
  d.prepare("DELETE FROM timezones WHERE user_id = ? AND timezone = ?").run(
    userId,
    iana
  );
  if (primary === iana) {
    const next = d
      .prepare(
        "SELECT timezone FROM timezones WHERE user_id = ? ORDER BY id ASC LIMIT 1"
      )
      .get(userId);
    if (next) {
      d.prepare(
        "UPDATE timezones SET is_primary = 1 WHERE user_id = ? AND timezone = ?"
      ).run(userId, next.timezone);
    }
  }
}

export function getSession(userId) {
  const row = getDb()
    .prepare("SELECT scene, data FROM sessions WHERE user_id = ?")
    .get(userId);
  if (!row) return { scene: "", data: {} };
  try {
    return { scene: row.scene || "", data: JSON.parse(row.data || "{}") };
  } catch {
    return { scene: row.scene || "", data: {} };
  }
}

export function setSession(userId, scene, data) {
  getDb()
    .prepare(
      `INSERT INTO sessions (user_id, scene, data) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET scene = excluded.scene, data = excluded.data`
    )
    .run(userId, scene, JSON.stringify(data || {}));
}

export function clearSession(userId) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function linkUserAlarm(userId, alarmId) {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO user_alarms (user_id, alarm_id) VALUES (?, ?)"
    )
    .run(userId, alarmId);
}

export function insertAlarm(row) {
  const d = getDb();
  const info = d
    .prepare(
      `INSERT INTO alarms (user_id, kind, recurrence, title, description, time_hhmm, anchor_date, weekdays, status)
       VALUES (@user_id, @kind, @recurrence, @title, @description, @time_hhmm, @anchor_date, @weekdays, @status)`
    )
    .run({
      user_id: row.user_id,
      kind: row.kind,
      recurrence: row.recurrence,
      title: row.title,
      description: row.description ?? "",
      time_hhmm: row.time_hhmm,
      anchor_date: row.anchor_date ?? null,
      weekdays: row.weekdays ?? null,
      status: row.status ?? "active",
    });
  const id = Number(info.lastInsertRowid);
  linkUserAlarm(row.user_id, id);
  return id;
}

export function updateAlarmFields(alarmId, userId, patch) {
  const allowed = [
    "title",
    "description",
    "time_hhmm",
    "anchor_date",
    "weekdays",
    "status",
    "kind",
    "recurrence",
  ];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (keys.length === 0) return 0;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  const params = { alarm_id: alarmId, user_id: userId, ...patch };
  const q = `UPDATE alarms SET ${sets} WHERE id = @alarm_id AND user_id = @user_id`;
  return getDb().prepare(q).run(params).changes;
}

export function updateSnoozeTask(id, userId, patch) {
  const allowed = ["fire_at", "title"];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (keys.length === 0) return 0;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  const params = { id, user_id: userId, ...patch };
  return getDb()
    .prepare(
      `UPDATE snooze_tasks SET ${sets} WHERE id = @id AND user_id = @user_id`
    )
    .run(params).changes;
}

export function deleteAlarm(alarmId, userId) {
  return getDb()
    .prepare("DELETE FROM alarms WHERE id = ? AND user_id = ?")
    .run(alarmId, userId).changes;
}

export function getAlarm(alarmId, userId) {
  return getDb()
    .prepare("SELECT * FROM alarms WHERE id = ? AND user_id = ?")
    .get(alarmId, userId);
}

export function listAlarms(userId, filters = {}) {
  const d = getDb();
  let q = "SELECT * FROM alarms WHERE user_id = ?";
  const params = [userId];
  if (filters.recurrence) {
    q += " AND recurrence = ?";
    params.push(filters.recurrence);
  }
  if (filters.kind) {
    q += " AND kind = ?";
    params.push(filters.kind);
  }
  q += " ORDER BY created_at DESC";
  return d.prepare(q).all(...params);
}

export function listAlarmsForScheduler() {
  return getDb()
    .prepare(
      `SELECT a.*, t.timezone AS primary_tz
       FROM alarms a
       JOIN timezones t ON t.user_id = a.user_id AND t.is_primary = 1
       WHERE a.status = 'active'`
    )
    .all();
}

export function markAlarmFired(alarmId, isoUtcMinute) {
  getDb()
    .prepare("UPDATE alarms SET last_fired_at = ? WHERE id = ?")
    .run(isoUtcMinute, alarmId);
}

export function insertSnoozeTask(row) {
  return getDb()
    .prepare(
      `INSERT INTO snooze_tasks (user_id, alarm_id, fire_at, title, description, kind)
       VALUES (@user_id, @alarm_id, @fire_at, @title, @description, @kind)`
    )
    .run(row);
}

export function dueSnoozeTasks(isoUtc) {
  return getDb()
    .prepare(
      "SELECT * FROM snooze_tasks WHERE fire_at <= ? ORDER BY fire_at ASC"
    )
    .all(isoUtc);
}

export function deleteSnoozeTask(id) {
  getDb().prepare("DELETE FROM snooze_tasks WHERE id = ?").run(id);
}
