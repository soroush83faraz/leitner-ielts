import { localDayKey, parseIso, shiftDayKey } from './dates';
import { toPersianDigits } from './text';

function dayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "امروز" / "فردا" / "۳ روز دیگر" / "۲ روز پیش" relative to now, in local days. */
export function relativeDayFa(targetIso: string, nowIso: string, timeZone: string): string {
  const d = dayDiff(localDayKey(parseIso(nowIso), timeZone), localDayKey(parseIso(targetIso), timeZone));
  if (d === 0) return 'امروز';
  if (d === 1) return 'فردا';
  if (d === -1) return 'دیروز';
  return d > 0 ? `${toPersianDigits(d)} روز دیگر` : `${toPersianDigits(-d)} روز پیش`;
}

export function longDateFa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function shortDateFa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function weekdayInitialFa(dayKey: string): string {
  try {
    const [y, m, d] = dayKey.split('-').map(Number);
    return new Intl.DateTimeFormat('fa-IR', { weekday: 'narrow' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  } catch {
    return '';
  }
}

export function percent(correct: number, total: number): string {
  return total === 0 ? '—' : `${toPersianDigits(Math.round((correct / total) * 100))}٪`;
}

export { shiftDayKey };
