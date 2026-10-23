import { addDays, addMonths, parseYMD } from './dates';
import type { Frequency } from './types';

export function nextOccurrence(date: string, frequency: Frequency, interval: number, anchorDay: number): string {
  const n = Math.max(1, Math.floor(interval || 1));
  switch (frequency) {
    case 'daily':
      return addDays(date, n);
    case 'weekly':
      return addDays(date, 7 * n);
    case 'monthly':
      return addMonths(date, n, anchorDay);
    case 'yearly':
      return addMonths(date, 12 * n, anchorDay);
  }
}

/** All occurrence dates from `nextDate` up to and including `until` (respecting endDate). */
export function dueOccurrences(
  rule: { nextDate: string; endDate: string | null; frequency: Frequency; interval: number; anchorDay: number },
  until: string,
  max = 1000,
): { dates: string[]; newNextDate: string } {
  const dates: string[] = [];
  let cur = rule.nextDate;
  while (cur <= until && (!rule.endDate || cur <= rule.endDate) && dates.length < max) {
    dates.push(cur);
    cur = nextOccurrence(cur, rule.frequency, rule.interval, rule.anchorDay);
  }
  return { dates, newNextDate: cur };
}

export function anchorDayOf(date: string): number {
  return parseYMD(date).d;
}

/** Upcoming occurrence dates (for display), not persisted. */
export function upcomingOccurrences(
  rule: { nextDate: string; endDate: string | null; frequency: Frequency; interval: number; anchorDay: number },
  count: number,
): string[] {
  const out: string[] = [];
  let cur = rule.nextDate;
  while (out.length < count && (!rule.endDate || cur <= rule.endDate)) {
    out.push(cur);
    cur = nextOccurrence(cur, rule.frequency, rule.interval, rule.anchorDay);
  }
  return out;
}
