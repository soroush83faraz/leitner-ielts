/**
 * Date policy
 * -----------
 * - Instants are stored as ISO-8601 UTC strings (`toISOString()`).
 * - "Days" are LOCAL calendar days in an explicit IANA time zone, so DST shifts
 *   and midnight crossings never move a card by an hour or a day.
 * - A card scheduled N days out becomes due at local midnight (00:00) of the
 *   day that is N calendar days after the review's local date.
 *
 * Everything takes the time zone as a parameter, which keeps it pure and lets
 * tests pin any zone. No external date library is needed.
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading of an instant in a zone. */
export function wallClockIn(ms: number, timeZone: string): WallClock {
  const out: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
  };
}

function wallClockAsUtcMs(w: WallClock): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** Offset (zone minus UTC) in ms at a given instant. */
function offsetAt(ms: number, timeZone: string): number {
  const floored = Math.floor(ms / 1000) * 1000;
  return wallClockAsUtcMs(wallClockIn(floored, timeZone)) - floored;
}

/** Converts a wall-clock reading in a zone to a UTC instant (ms). */
export function zonedWallClockToUtcMs(w: WallClock, timeZone: string): number {
  const wallAsUtc = wallClockAsUtcMs(w);
  let guess = wallAsUtc - offsetAt(wallAsUtc, timeZone);
  // A second pass settles instants that straddle a DST transition.
  guess = wallAsUtc - offsetAt(guess, timeZone);
  return guess;
}

/** Local midnight (as UTC ms) of the calendar day `daysFromNow` days after `ms`'s local date. */
export function startOfLocalDayMs(ms: number, timeZone: string, daysFromNow = 0): number {
  const w = wallClockIn(ms, timeZone);
  // Date.UTC normalises day overflow, so month/year rollovers are free.
  const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day + daysFromNow));
  return zonedWallClockToUtcMs(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/** `YYYY-MM-DD` of the local day containing the instant. */
export function localDayKey(ms: number, timeZone: string): string {
  const w = wallClockIn(ms, timeZone);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** Day key shifted by whole calendar days (pure calendar arithmetic). */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + days));
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function parseIso(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO date: ${iso}`);
  return ms;
}
