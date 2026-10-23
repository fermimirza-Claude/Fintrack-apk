import { addDays, diffDays, endOfMonth, formatDate, shiftMonth, startOfMonth, startOfWeek, todayJakarta } from './dates';

export type PeriodPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'custom';

export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
}

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Hari ini',
  this_week: 'Minggu ini',
  this_month: 'Bulan ini',
  last_month: 'Bulan lalu',
  last_3_months: '3 bulan terakhir',
  last_6_months: '6 bulan terakhir',
  this_year: 'Tahun ini',
  custom: 'Rentang khusus',
};

export function resolvePeriod(preset: PeriodPreset, custom?: { from: string; to: string }): Period {
  const t = todayJakarta();
  switch (preset) {
    case 'today':
      return { preset, from: t, to: t };
    case 'this_week':
      return { preset, from: startOfWeek(t), to: addDays(startOfWeek(t), 6) };
    case 'this_month':
      return { preset, from: startOfMonth(t), to: endOfMonth(t) };
    case 'last_month': {
      const m = shiftMonth(t.slice(0, 7), -1);
      return { preset, from: m + '-01', to: endOfMonth(m + '-01') };
    }
    case 'last_3_months': {
      const m = shiftMonth(t.slice(0, 7), -2);
      return { preset, from: m + '-01', to: endOfMonth(t) };
    }
    case 'last_6_months': {
      const m = shiftMonth(t.slice(0, 7), -5);
      return { preset, from: m + '-01', to: endOfMonth(t) };
    }
    case 'this_year':
      return { preset, from: t.slice(0, 4) + '-01-01', to: t.slice(0, 4) + '-12-31' };
    case 'custom': {
      const from = custom?.from ?? startOfMonth(t);
      const to = custom?.to ?? t;
      return from <= to ? { preset, from, to } : { preset, from: to, to: from };
    }
  }
}

/** The equally long period immediately before the given one (used for comparisons). */
export function previousPeriod(p: { from: string; to: string }): { from: string; to: string } {
  // Whole calendar months compare against the same number of whole months before.
  const isMonthAligned = p.from.endsWith('-01') && p.to === endOfMonth(p.to);
  if (isMonthAligned) {
    const months =
      (parseInt(p.to.slice(0, 4)) - parseInt(p.from.slice(0, 4))) * 12 +
      (parseInt(p.to.slice(5, 7)) - parseInt(p.from.slice(5, 7))) + 1;
    const fromM = shiftMonth(p.from.slice(0, 7), -months);
    const toM = shiftMonth(p.from.slice(0, 7), -1);
    return { from: fromM + '-01', to: endOfMonth(toM + '-01') };
  }
  const len = diffDays(p.to, p.from) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function periodLabel(p: { from: string; to: string }): string {
  if (p.from === p.to) return formatDate(p.from);
  return `${formatDate(p.from)} – ${formatDate(p.to)}`;
}

/** Number of elapsed days of the period up to today (at least 1). */
export function elapsedDays(p: { from: string; to: string }): number {
  const t = todayJakarta();
  const end = t < p.to ? t : p.to;
  if (end < p.from) return 0;
  return diffDays(end, p.from) + 1;
}

export function totalDays(p: { from: string; to: string }): number {
  return diffDays(p.to, p.from) + 1;
}
