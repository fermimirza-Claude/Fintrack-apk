import { addDays, diffDays, formatDate, formatMonth, MONTHS_SHORT, parseYMD, shiftMonth, startOfWeek } from './dates';
import { formatPercent, formatRupiah, percentChange, ratioPercent } from './money';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface Bucket {
  key: string; // first day of bucket (YYYY-MM-DD) or YYYY-MM / YYYY
  label: string; // short axis label
  longLabel: string;
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
}

export function bucketKey(date: string, g: Granularity): string {
  switch (g) {
    case 'day': return date;
    case 'week': return startOfWeek(date);
    case 'month': return date.slice(0, 7);
    case 'year': return date.slice(0, 4);
  }
}

/** Creates empty buckets covering [from, to] so gaps show as zero instead of disappearing. */
export function makeBuckets(from: string, to: string, g: Granularity): Bucket[] {
  const out: Bucket[] = [];
  let cur = g === 'week' ? startOfWeek(from) : g === 'month' ? from.slice(0, 7) + '-01' : g === 'year' ? from.slice(0, 4) + '-01-01' : from;
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    let next: string;
    let label: string;
    let longLabel: string;
    const { y, m, d } = parseYMD(cur);
    if (g === 'day') { next = addDays(cur, 1); label = `${d}`; longLabel = formatDate(cur); }
    else if (g === 'week') {
      next = addDays(cur, 7);
      label = `${d} ${MONTHS_SHORT[m - 1]}`;
      longLabel = `${formatDate(cur)} – ${formatDate(addDays(cur, 6))}`;
    } else if (g === 'month') {
      next = shiftMonth(cur.slice(0, 7), 1) + '-01';
      label = MONTHS_SHORT[m - 1];
      longLabel = formatMonth(cur.slice(0, 7), true);
    } else { next = `${y + 1}-01-01`; label = `${y}`; longLabel = `Tahun ${y}`; }
    out.push({ key: bucketKey(cur, g), label, longLabel, from: cur, to: addDays(next, -1), income: 0, expense: 0, net: 0 });
    cur = next;
  }
  return out;
}

export function fillBuckets(buckets: Bucket[], flows: { date: string; income: number; expense: number }[], g: Granularity): Bucket[] {
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  const out = buckets.map((b) => ({ ...b }));
  for (const f of flows) {
    const i = idx.get(bucketKey(f.date, g));
    if (i === undefined) continue;
    out[i].income += f.income;
    out[i].expense += f.expense;
    out[i].net = out[i].income - out[i].expense;
  }
  return out;
}

/** Picks a sensible granularity for a period length. */
export function autoGranularity(from: string, to: string): Granularity {
  const days = diffDays(to, from) + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 800) return 'month';
  return 'year';
}

export function maxBy<T>(items: T[], f: (t: T) => number): T | null {
  let best: T | null = null;
  for (const it of items) if (best === null || f(it) > f(best)) best = it;
  return best;
}

// ---------------- financial health ----------------
export interface HealthIndicator {
  key: string;
  label: string;
  value: string | null; // null = not enough data
  tone: 'good' | 'warning' | 'bad' | 'neutral';
  definition: string;
  detail?: string;
}

export interface HealthInput {
  income: number;
  expense: number;
  budgetLimit: number;
  budgetSpent: number;
  activeDays: number;
  elapsedDays: number;
  balanceNow: number;
  balanceMonthStart: number;
  projectedEndBalance: number | null;
  projectionBasis: string;
}

export function healthIndicators(h: HealthInput): HealthIndicator[] {
  const savings = h.income > 0 ? ratioPercent(h.income - h.expense, h.income) : null;
  const expRatio = ratioPercent(h.expense, h.income);
  const budget = ratioPercent(h.budgetSpent, h.budgetLimit);
  const trend = h.balanceNow - h.balanceMonthStart;
  return [
    {
      key: 'savings', label: 'Tingkat tabungan',
      value: savings === null ? null : formatPercent(savings),
      tone: savings === null ? 'neutral' : savings >= 20 ? 'good' : savings >= 0 ? 'warning' : 'bad',
      definition: '(Pemasukan − Pengeluaran) ÷ Pemasukan × 100%, bulan berjalan. Tersedia bila pemasukan > Rp0.',
    },
    {
      key: 'expense_ratio', label: 'Rasio pengeluaran',
      value: expRatio === null ? null : formatPercent(expRatio),
      tone: expRatio === null ? 'neutral' : expRatio <= 80 ? 'good' : expRatio <= 100 ? 'warning' : 'bad',
      definition: 'Pengeluaran ÷ Pemasukan × 100%, bulan berjalan. Di atas 100% berarti pengeluaran melebihi pemasukan.',
    },
    {
      key: 'budget', label: 'Realisasi anggaran',
      value: budget === null ? null : formatPercent(budget),
      tone: budget === null ? 'neutral' : budget < 80 ? 'good' : budget < 100 ? 'warning' : 'bad',
      definition: 'Total pengeluaran pada kategori beranggaran ÷ total batas anggaran bulan ini.',
      detail: h.budgetLimit > 0 ? `${formatRupiah(h.budgetSpent)} dari ${formatRupiah(h.budgetLimit)}` : 'Belum ada anggaran bulan ini',
    },
    {
      key: 'active_days', label: 'Hari dengan transaksi',
      value: h.elapsedDays > 0 ? `${h.activeDays} / ${h.elapsedDays} hari` : null,
      tone: 'neutral',
      definition: 'Jumlah hari di bulan ini yang memiliki minimal satu transaksi, dibanding hari yang sudah berjalan.',
    },
    {
      key: 'balance_trend', label: 'Tren saldo bulan ini',
      value: formatRupiah(trend, { sign: true }),
      tone: trend > 0 ? 'good' : trend < 0 ? 'bad' : 'neutral',
      definition: 'Saldo total saat ini dikurangi saldo total pada awal bulan (transfer antar akun tidak memengaruhi).',
    },
    {
      key: 'projection', label: 'Estimasi saldo akhir bulan',
      value: h.projectedEndBalance === null ? null : formatRupiah(h.projectedEndBalance),
      tone: h.projectedEndBalance === null ? 'neutral' : h.projectedEndBalance >= 0 ? 'good' : 'bad',
      definition: h.projectionBasis,
      detail: 'Proyeksi, bukan fakta.',
    },
  ];
}

// ---------------- insights ----------------
export interface Insight {
  id: string;
  kind: 'fact' | 'projection';
  tone: 'info' | 'good' | 'warning';
  text: string;
  basis: string;
}

export interface InsightInput {
  periodLabel: string; // e.g. "1–23 Okt 2026"
  comparisonLabel: string; // e.g. "1–23 Sep 2026"
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  txCount: number;
  elapsedDays: number;
  totalDays: number;
  categories: { name: string; amount: number }[];
  prevCategories: { name: string; amount: number }[];
  budgets: { name: string; percent: number; spent: number; amount: number }[];
  isCurrentMonth: boolean;
}

const MIN_TX_FOR_INSIGHTS = 3;

export function buildInsights(d: InsightInput): Insight[] {
  const out: Insight[] = [];
  if (d.txCount < MIN_TX_FOR_INSIGHTS) return out;

  // 1. Expense vs previous period (only when the previous period had expenses — no fake %)
  const ch = percentChange(d.expense, d.prevExpense);
  if (ch !== null && Math.abs(ch) >= 5) {
    out.push({
      id: 'exp_change', kind: 'fact', tone: ch > 0 ? 'warning' : 'good',
      text: `Pengeluaran ${d.periodLabel} ${formatPercent(Math.abs(ch))} ${ch > 0 ? 'lebih tinggi' : 'lebih rendah'} dibandingkan ${d.comparisonLabel}.`,
      basis: `${formatRupiah(d.expense)} vs ${formatRupiah(d.prevExpense)}.`,
    });
  } else if (d.prevExpense === 0 && d.expense > 0) {
    out.push({
      id: 'exp_no_prev', kind: 'fact', tone: 'info',
      text: `Belum ada data pengeluaran pada ${d.comparisonLabel}, jadi perbandingan persentase belum dapat dihitung.`,
      basis: 'Pembagian dengan nol dihindari.',
    });
  }

  // 2. Top category share
  if (d.expense > 0 && d.categories.length > 0) {
    const top = d.categories[0];
    const share = (top.amount / d.expense) * 100;
    out.push({
      id: 'top_cat', kind: 'fact', tone: share >= 40 ? 'warning' : 'info',
      text: `Kategori ${top.name} merupakan ${formatPercent(share)} dari total pengeluaran ${d.periodLabel}.`,
      basis: `${formatRupiah(top.amount)} dari ${formatRupiah(d.expense)}.`,
    });
  }

  // 3. Biggest category increase (requires the category to exist in the previous period)
  if (d.prevCategories.length) {
    const prev = new Map(d.prevCategories.map((c) => [c.name, c.amount]));
    let best: { name: string; diff: number; prev: number; cur: number } | null = null;
    for (const c of d.categories) {
      const p = prev.get(c.name);
      if (p === undefined) continue;
      const diff = c.amount - p;
      if (diff > 0 && (!best || diff > best.diff)) best = { name: c.name, diff, prev: p, cur: c.amount };
    }
    if (best && best.diff >= 10000) {
      out.push({
        id: 'cat_increase', kind: 'fact', tone: 'warning',
        text: `Pengeluaran ${best.name} meningkat ${formatRupiah(best.diff)} dibandingkan ${d.comparisonLabel}.`,
        basis: `${formatRupiah(best.cur)} vs ${formatRupiah(best.prev)}.`,
      });
    }
  }

  // 4. Budgets near or over limit
  for (const b of d.budgets.filter((x) => x.percent >= 80).sort((a, b) => b.percent - a.percent).slice(0, 3)) {
    out.push({
      id: 'budget_' + b.name, kind: 'fact', tone: 'warning',
      text: b.percent >= 100
        ? `Anggaran ${b.name} sudah terlampaui (${formatPercent(b.percent)}).`
        : `Anggaran ${b.name} telah terpakai ${formatPercent(b.percent)}.`,
      basis: `${formatRupiah(b.spent)} dari batas ${formatRupiah(b.amount)}.`,
    });
  }

  // 5. Average daily expense
  if (d.elapsedDays >= 3 && d.expense > 0) {
    const avg = Math.round(d.expense / d.elapsedDays);
    out.push({
      id: 'avg_daily', kind: 'fact', tone: 'info',
      text: `Rata-rata pengeluaran harian Anda ${d.periodLabel} adalah ${formatRupiah(avg)}.`,
      basis: `${formatRupiah(d.expense)} ÷ ${d.elapsedDays} hari berjalan.`,
    });
    // 6. Projection to end of month (clearly marked)
    if (d.isCurrentMonth && d.elapsedDays >= 7 && d.elapsedDays < d.totalDays) {
      const projected = Math.round(avg * d.totalDays);
      out.push({
        id: 'projection', kind: 'projection', tone: 'info',
        text: `Jika tren pengeluaran saat ini berlanjut, estimasi pengeluaran hingga akhir bulan adalah ${formatRupiah(projected)}.`,
        basis: `Proyeksi: rata-rata harian ${formatRupiah(avg)} × ${d.totalDays} hari. Hanya perkiraan.`,
      });
    }
  }

  // 7. Income not covering expenses
  if (d.expense > d.income) {
    out.push({
      id: 'deficit', kind: 'fact', tone: 'warning',
      text: d.income === 0
        ? `Belum ada pemasukan tercatat ${d.periodLabel}, sementara pengeluaran sudah ${formatRupiah(d.expense)}.`
        : `Pemasukan ${d.periodLabel} belum menutupi total pengeluaran (selisih ${formatRupiah(d.expense - d.income)}).`,
      basis: `Pemasukan ${formatRupiah(d.income)}, pengeluaran ${formatRupiah(d.expense)}.`,
    });
  } else if (d.income > 0) {
    const rate = ((d.income - d.expense) / d.income) * 100;
    if (rate >= 20) {
      out.push({
        id: 'surplus', kind: 'fact', tone: 'good',
        text: `Anda menyisihkan ${formatPercent(rate)} dari pemasukan ${d.periodLabel}.`,
        basis: `(${formatRupiah(d.income)} − ${formatRupiah(d.expense)}) ÷ ${formatRupiah(d.income)}.`,
      });
    }
  }
  return out;
}
