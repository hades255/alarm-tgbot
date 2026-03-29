import { DateTime } from "luxon";

export function nowUtc() {
  return DateTime.utc();
}

export function localNowInZone(iana) {
  return DateTime.now().setZone(iana);
}

export function parseTimeHhmm(s) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s).trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function parseWeekdaysJson(raw) {
  if (raw == null || raw === "") return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const set = new Set(
      arr.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
    );
    return [...set].sort((a, b) => a - b);
  } catch {
    return null;
  }
}

export function formatInZones(isoUtc, zones) {
  const dt = DateTime.fromISO(isoUtc, { zone: "utc" });
  const lines = [];
  for (const z of zones) {
    const local = dt.setZone(z);
    if (!local.isValid) continue;
    lines.push(`${z}: ${local.toFormat("yyyy-LL-dd HH:mm:ss ZZZZ")}`);
  }
  return lines;
}
