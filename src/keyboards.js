import { Markup } from "telegraf";

/** Persistent button above the composer; sends `/start` when tapped. */
export function startCommandReplyKeyboard() {
  return {
    keyboard: [[{ text: "/start" }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Tap /start for the main menu",
  };
}

export function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Add alarm", "menu:add_root"),
      Markup.button.callback("Edit", "menu:edit_root"),
      Markup.button.callback("Delete", "menu:del_root"),
      Markup.button.callback("List", "menu:list"),
    ],
    [Markup.button.callback("Activate / deactivate", "menu:toggle_root")],
    [
      Markup.button.callback("Set timezone", "menu:tz_set"),
      Markup.button.callback("List", "menu:tz_list"),
      Markup.button.callback("Set primary", "menu:tz_primary"),
    ],
    // [
    //   Markup.button.callback("Download backup", "menu:backup_download"),
    //   Markup.button.callback("Upload backup", "menu:backup_upload"),
    // ],
    [Markup.button.callback("Help", "menu:help")],
  ]);
}

/* Reminders disabled — only `kind: 'alarm'` is created or scheduled (see db + scheduler). */
export function addAlarmRootMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Daily alarm", "add:alarm:daily"),
      Markup.button.callback("Weekly alarm", "add:alarm:weekly"),
    ],
    [
      Markup.button.callback("Monthly alarm", "add:alarm:monthly"),
      Markup.button.callback("Yearly alarm", "add:alarm:yearly"),
    ],
    [Markup.button.callback("One-time alarm", "add:alarm:once")],
    [Markup.button.callback("Back to main menu", "menu:main")],
  ]);
}

export function editAlarmRootMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Edit daily", "pick:edit:daily"),
      Markup.button.callback("Edit weekly", "pick:edit:weekly"),
    ],
    [
      Markup.button.callback("Edit monthly", "pick:edit:monthly"),
      Markup.button.callback("Edit yearly", "pick:edit:yearly"),
    ],
    [Markup.button.callback("Edit one-time", "pick:edit:once")],
    [Markup.button.callback("Back to main menu", "menu:main")],
  ]);
}

export function deleteAlarmRootMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Delete daily", "pick:del:daily"),
      Markup.button.callback("Delete weekly", "pick:del:weekly"),
    ],
    [
      Markup.button.callback("Delete monthly", "pick:del:monthly"),
      Markup.button.callback("Delete yearly", "pick:del:yearly"),
    ],
    [Markup.button.callback("Delete one-time", "pick:del:once")],
    [Markup.button.callback("Back to main menu", "menu:main")],
  ]);
}

export function toggleRootMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Activate…", "pick:on:root"),
      Markup.button.callback("Deactivate…", "pick:off:root"),
    ],
    [Markup.button.callback("Back to main menu", "menu:main")],
  ]);
}

export function backMain() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Back to main menu", "menu:main")],
  ]);
}

export function weekdayPicker(selectedLuxonWeekdays) {
  const sel = new Set(selectedLuxonWeekdays);
  const labels = [
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6],
    ["Sun", 7],
  ];
  const row1 = labels
    .slice(0, 4)
    .map(([name, d]) =>
      Markup.button.callback(sel.has(d) ? `✓ ${name}` : name, `wd:${d}`)
    );
  const row2 = labels
    .slice(4)
    .map(([name, d]) =>
      Markup.button.callback(sel.has(d) ? `✓ ${name}` : name, `wd:${d}`)
    );
  return Markup.inlineKeyboard([
    row1,
    row2,
    [
      Markup.button.callback("Every day", "wd:all"),
      Markup.button.callback("Done", "wd:done"),
    ],
    [Markup.button.callback("Cancel", "menu:add_root")],
  ]);
}

export function weeklyDayPicker() {
  const labels = [
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6],
    ["Sun", 7],
  ];
  const rows = [];
  for (let i = 0; i < labels.length; i += 4) {
    rows.push(
      labels
        .slice(i, i + 4)
        .map(([name, d]) => Markup.button.callback(name, `anchor:w:${d}`))
    );
  }
  rows.push([Markup.button.callback("Cancel", "menu:add_root")]);
  return Markup.inlineKeyboard(rows);
}

export function alarmRowButtons(alarms, prefix) {
  const rows = [];
  for (const a of alarms) {
    const label = `${a.id}: ${a.title} (${a.time_hhmm}, ${a.status})`.slice(
      0,
      60
    );
    rows.push([Markup.button.callback(label, `${prefix}:${a.id}`)]);
  }
  rows.push([Markup.button.callback("Back", "menu:main")]);
  return Markup.inlineKeyboard(rows);
}

export function confirmDelete(alarmId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Yes, delete", `del:yes:${alarmId}`),
      Markup.button.callback("No", "menu:del_root"),
    ],
  ]);
}

export function editFieldMenu(alarmId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Title", `ef:${alarmId}:title`),
      Markup.button.callback("Description", `ef:${alarmId}:desc`),
    ],
    [Markup.button.callback("Time (HH:MM)", `ef:${alarmId}:time`)],
    [Markup.button.callback("Weekdays (daily only)", `ef:${alarmId}:weekdays`)],
    [Markup.button.callback("Back to item", `eid:${alarmId}`)],
    [Markup.button.callback("Main menu", "menu:main")],
  ]);
}
