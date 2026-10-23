/**
 * Date helpers fixed to Asia/Jakarta (UTC+7, no DST). We never rely on the device time zone:
 * "now" is computed from the UTC epoch plus 7 hours and read with UTC getters.
 * Dates are passed around as 'YYYY-MM-DD' strings, which sort lexicographically.
 */

export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let clockOverride: (() => number) | null = null;
/** Testing hook: freeze "now". */
export function setClock(fn: (() => number) | null) {
  clockOverride = fn;
}
function nowMs(): number {
  return clockOverride ? clockOverride() : Date.now();
}

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseYMD(s: string): YMD {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return { y, m, d };
}

export function toYMD(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseYMD(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, mi] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

export function todayJakarta(): string {
  const d = new Date(nowMs() + JAKARTA_OFFSET_MS);
  return toYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function nowTimeJakarta(): string {
  const d = new Date(nowMs() + JAKARTA_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Days since epoch for a calendar date (timezone-free arithmetic). */
function dayNumber(s: string): number {
  const { y, m, d } = parseYMD(s);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
function fromDayNumber(n: number): string {
  const d = new Date(n * 86400000);
  return toYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(s: string, n: number): string {
  return fromDayNumber(dayNumber(s) + n);
}

export function diffDays(a: string, b: string): number {
  return dayNumber(a) - dayNumber(b);
}

/** Add months keeping an anchor day, clamped to the end of the target month (31 Jan + 1 -> 28/29 Feb). */
export function addMonths(s: string, n: number, anchorDay?: number): string {
  const { y, m, d } = parseYMD(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return toYMD(ny, nm, day);
}

/** 0 = Sunday */
export function weekday(s: string): number {
  const { y, m, d } = parseYMD(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday-based week start (Indonesian convention). */
export function startOfWeek(s: string): string {
  const wd = weekday(s);
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(s, -back);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 7) + '-01';
}

export function endOfMonth(s: string): string {
  const { y, m } = parseYMD(s);
  return toYMD(y, m, daysInMonth(y, m));
}

export function monthRange(month: string): { from: string; to: string } {
  const first = month + '-01';
  return { from: first, to: endOfMonth(first) };
}

export function shiftMonth(month: string, n: number): string {
  return addMonths(month + '-01', n).slice(0, 7);
}

/** "23 Okt 2026" */
export function formatDate(s: string, style: 'short' | 'numeric' | 'long' = 'short'): string {
  if (!s) return '';
  const { y, m, d } = parseYMD(s);
  if (style === 'numeric') return `${pad(d)}/${pad(m)}/${y}`;
  if (style === 'long') return `${DAYS_LONG[weekday(s)]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "Okt 2026" or "Oktober 2026" */
export function formatMonth(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

export function relativeDayLabel(s: string, dateStyle: 'short' | 'numeric' = 'short'): string {
  const t = todayJakarta();
  if (s === t) return 'Hari ini';
  if (s === addDays(t, -1)) return 'Kemarin';
  return formatDate(s, dateStyle);
}

export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function enumerateMonths(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = fromMonth;
  let guard = 0;
  while (cur <= toMonth && guard++ < 600) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

export function dateToYMD(date: Date): string {
  // Values picked from a native date picker are local device time; we only take the calendar parts.
  return toYMD(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function ymdToDate(s: string, time = '12:00'): Date {
  const { y, m, d } = parseYMD(s);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0);
}
