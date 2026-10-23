import type { Repo, BudgetStatus, CategoryTotal, Totals } from '../db/repo';
import {
  autoGranularity, buildInsights, fillBuckets, healthIndicators, makeBuckets, maxBy,
  type Bucket, type Granularity, type HealthIndicator, type Insight,
} from '../domain/analytics';
import {
  addDays, diffDays, endOfMonth, formatDate, MONTHS_SHORT, parseYMD, shiftMonth, startOfMonth, startOfWeek, todayJakarta,
} from '../domain/dates';
import { formatRupiah, percentChange } from '../domain/money';
import { previousPeriod, periodLabel } from '../domain/periods';
import { dueOccurrences } from '../domain/recurring';
import type { AccountWithBalance, TxView } from '../domain/types';

function shortRange(from: string, to: string): string {
  const a = parseYMD(from);
  const b = parseYMD(to);
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? formatDate(from) : `${a.d}–${b.d} ${MONTHS_SHORT[a.m - 1]} ${a.y}`;
  return periodLabel({ from, to });
}

export interface DashboardData {
  isEmpty: boolean;
  today: string;
  month: string;
  balance: number;
  assets: number;
  liabilities: number;
  balanceChange: number; // vs end of previous month
  income: number;
  expense: number;
  net: number;
  incomeChange: number | null;
  expenseChange: number | null;
  netChangeAbs: number;
  comparisonLabel: string;
  mtdLabel: string;
  categories: CategoryTotal[];
  recent: TxView[];
  health: HealthIndicator[];
  insights: Insight[];
  accounts: AccountWithBalance[];
  hasDemo: boolean;
  balanceSeries: { date: string; balance: number }[];
}

/** Everything on the dashboard, computed from the database (no hard-coded numbers). */
export async function loadDashboard(repo: Repo): Promise<DashboardData> {
  const today = todayJakarta();
  const month = today.slice(0, 7);
  const mStart = startOfMonth(today);
  const mEnd = endOfMonth(today);
  const elapsed = diffDays(today, mStart) + 1;
  const totalDays = diffDays(mEnd, mStart) + 1;

  // Month-to-date vs the same days of last month: a fair comparison mid-month.
  const prevMonth = shiftMonth(month, -1);
  const prevStart = prevMonth + '-01';
  const prevEndFull = endOfMonth(prevStart);
  const prevSameDay = addDays(prevStart, elapsed - 1);
  const prevEnd = prevSameDay > prevEndFull ? prevEndFull : prevSameDay;

  const [count, accounts, cur, prev, categories, prevCategories, recent, budgets, activeDays, hasDemo] = await Promise.all([
    repo.transactionCount(),
    repo.accountsWithBalance(today),
    repo.totals(mStart, today),
    repo.totals(prevStart, prevEnd),
    repo.totalsByCategory(mStart, today, 'expense'),
    repo.totalsByCategory(prevStart, prevEnd, 'expense'),
    repo.listTransactions({ limit: 8, to: today }),
    repo.budgetStatuses(month),
    repo.activeDayCount(mStart, today),
    repo.hasDemoData(),
  ]);
  const balance = accounts.reduce((s, a) => s + a.balance, 0);
  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  const balanceMonthStart = await repo.totalBalance(addDays(mStart, -1));
  const balanceSeries = await repo.balanceSeries(addDays(today, -29), today);

  // Projection: current balance − avg daily expense × remaining days + scheduled recurring items left this month.
  const remaining = totalDays - elapsed;
  let projected: number | null = null;
  let basis = 'Butuh minimal 7 hari berjalan dan 3 transaksi pengeluaran di bulan ini.';
  const expenseTxCount = (await repo.listTransactions({ from: mStart, to: today, type: 'expense' })).length;
  if (elapsed >= 7 && expenseTxCount >= 3) {
    const avgDaily = cur.expense / elapsed;
    let scheduled = 0;
    for (const r of await repo.listRecurring()) {
      if (!r.isActive || r.type === 'transfer') continue;
      const { dates } = dueOccurrences({ ...r, nextDate: r.nextDate <= today ? addDays(today, 1) : r.nextDate }, mEnd);
      scheduled += dates.length * (r.type === 'income' ? r.amount : -r.amount);
    }
    projected = Math.round(balance - avgDaily * remaining + scheduled);
    basis = `Saldo saat ini − rata-rata pengeluaran harian (${formatRupiah(Math.round(avgDaily))}) × ${remaining} hari tersisa` +
      (scheduled !== 0 ? ` ${scheduled > 0 ? '+' : '−'} transaksi berulang terjadwal (${formatRupiah(Math.abs(scheduled))})` : '') + '.';
  }

  const budgetLimit = budgets.reduce((s, b) => s + b.amount, 0);
  const budgetSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const mtdLabel = shortRange(mStart, today);
  const comparisonLabel = shortRange(prevStart, prevEnd);

  const health = healthIndicators({
    income: cur.income, expense: cur.expense, budgetLimit, budgetSpent, activeDays, elapsedDays: elapsed,
    balanceNow: balance, balanceMonthStart, projectedEndBalance: projected, projectionBasis: basis,
  });
  const insights = buildInsights({
    periodLabel: 'bulan ini', comparisonLabel: `periode yang sama bulan lalu (${comparisonLabel})`,
    income: cur.income, expense: cur.expense, prevIncome: prev.income, prevExpense: prev.expense,
    txCount: cur.count, elapsedDays: elapsed, totalDays, categories, prevCategories,
    budgets: budgets.map((b) => ({ name: b.categoryName, percent: b.percent, spent: b.spent, amount: b.amount })),
    isCurrentMonth: true,
  });

  return {
    isEmpty: count === 0, today, month, balance, assets, liabilities,
    balanceChange: balance - balanceMonthStart,
    income: cur.income, expense: cur.expense, net: cur.net,
    incomeChange: percentChange(cur.income, prev.income), expenseChange: percentChange(cur.expense, prev.expense),
    netChangeAbs: cur.net - prev.net, comparisonLabel, mtdLabel, categories, recent, health, insights,
    accounts, hasDemo, balanceSeries,
  };
}

export type ChartMode = 'weekly' | 'monthly' | 'yearly';

export interface ChartData {
  mode: ChartMode;
  buckets: Bucket[];
  highestExpense: Bucket | null;
  highestNet: Bucket | null;
  lastVsPrev: { expense: number | null; income: number | null; label: string; prevLabel: string } | null;
}

/** Income vs expense chart: 8 weeks, 6 months or 5 years ending today. */
export async function loadChart(repo: Repo, mode: ChartMode): Promise<ChartData> {
  const today = todayJakarta();
  let from: string;
  let g: Granularity;
  if (mode === 'weekly') { from = addDays(startOfWeek(today), -7 * 7); g = 'week'; }
  else if (mode === 'monthly') { from = shiftMonth(today.slice(0, 7), -5) + '-01'; g = 'month'; }
  else { from = `${parseInt(today.slice(0, 4)) - 4}-01-01`; g = 'year'; }
  const flows = await repo.dailyFlows(from, today);
  const buckets = fillBuckets(makeBuckets(from, today, g), flows, g);
  const withData = buckets.filter((b) => b.income > 0 || b.expense > 0);
  const last = buckets[buckets.length - 1];
  const prevB = buckets[buckets.length - 2];
  return {
    mode, buckets,
    highestExpense: withData.length ? maxBy(withData, (b) => b.expense) : null,
    highestNet: withData.length ? maxBy(withData, (b) => b.net) : null,
    lastVsPrev: last && prevB ? {
      expense: percentChange(last.expense, prevB.expense), income: percentChange(last.income, prevB.income),
      label: last.longLabel, prevLabel: prevB.longLabel,
    } : null,
  };
}

export interface ReportData {
  from: string;
  to: string;
  label: string;
  prevLabel: string;
  totals: Totals;
  prevTotals: Totals;
  expenseChange: number | null;
  incomeChange: number | null;
  granularity: Granularity;
  buckets: Bucket[];
  categories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  byAccount: { accountId: string; name: string; color: string; amount: number }[];
  byMethod: { method: string | null; amount: number }[];
  topExpenses: TxView[];
  topIncome: TxView[];
  avgDailyExpense: number;
  avgMonthlyExpense: number;
  days: number;
  biggestIncrease: { name: string; diff: number; cur: number; prev: number } | null;
  balanceStart: number;
  balanceEnd: number;
  balanceSeries: { date: string; balance: number }[];
  insights: Insight[];
  budgets: BudgetStatus[];
}

function minDate(a: string, b: string) { return a < b ? a : b; }

export async function loadReport(repo: Repo, from: string, to: string): Promise<ReportData> {
  const today = todayJakarta();
  const effectiveTo = to > today ? today : to; // averages only over elapsed days
  // When the period is still running (ends in the future), compare against the same number of
  // elapsed days at the start of the previous period, so a half-finished month is not compared
  // with a complete one.
  const fullPrev = previousPeriod({ from, to });
  const running = to > today && today >= from;
  const prev = running
    ? { from: fullPrev.from, to: minDate(addDays(fullPrev.from, diffDays(today, from)), fullPrev.to) }
    : fullPrev;
  const g = autoGranularity(from, to);
  const [totals, prevTotals, flows, categories, prevCategories, incomeCategories, byAccount, byMethod, topExpenses, topIncome] =
    await Promise.all([
      repo.totals(from, to), repo.totals(prev.from, prev.to), repo.dailyFlows(from, to),
      repo.totalsByCategory(from, to, 'expense'), repo.totalsByCategory(prev.from, prev.to, 'expense'),
      repo.totalsByCategory(from, to, 'income'), repo.expenseByAccount(from, to), repo.expenseByPaymentMethod(from, to),
      repo.topTransactions(from, to, 'expense', 5), repo.topTransactions(from, to, 'income', 5),
    ]);
  const buckets = fillBuckets(makeBuckets(from, to, g), flows, g);
  const days = effectiveTo >= from ? diffDays(effectiveTo, from) + 1 : 0;
  const months = Math.max(1, days / 30.4375);
  const prevMap = new Map(prevCategories.map((c) => [c.name, c.amount]));
  let biggestIncrease: ReportData['biggestIncrease'] = null;
  for (const c of categories) {
    const p = prevMap.get(c.name) ?? 0;
    const diff = c.amount - p;
    if (diff > 0 && (!biggestIncrease || diff > biggestIncrease.diff)) biggestIncrease = { name: c.name, diff, cur: c.amount, prev: p };
  }
  const balanceStart = await repo.totalBalance(addDays(from, -1));
  const balanceEnd = await repo.totalBalance(effectiveTo >= from ? effectiveTo : from);
  const balanceSeries = days > 0 ? await repo.balanceSeries(from, effectiveTo) : [];
  const isCurrentMonth = from === startOfMonth(today) && to === endOfMonth(today);
  const label = periodLabel({ from, to });
  const prevLabel = periodLabel(prev) + (running ? ' (jumlah hari berjalan yang sama)' : '');
  const budgets = isCurrentMonth || (from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to === endOfMonth(to))
    ? await repo.budgetStatuses(from.slice(0, 7)) : [];
  const insights = buildInsights({
    periodLabel: `periode ${label}`, comparisonLabel: `periode sebelumnya (${prevLabel})`,
    income: totals.income, expense: totals.expense, prevIncome: prevTotals.income, prevExpense: prevTotals.expense,
    txCount: totals.count, elapsedDays: days, totalDays: diffDays(to, from) + 1, categories, prevCategories,
    budgets: budgets.map((b) => ({ name: b.categoryName, percent: b.percent, spent: b.spent, amount: b.amount })),
    isCurrentMonth,
  });
  return {
    from, to, label, prevLabel, totals, prevTotals,
    expenseChange: percentChange(totals.expense, prevTotals.expense), incomeChange: percentChange(totals.income, prevTotals.income),
    granularity: g, buckets, categories, incomeCategories, byAccount, byMethod, topExpenses, topIncome,
    avgDailyExpense: days > 0 ? Math.round(totals.expense / days) : 0,
    avgMonthlyExpense: days > 0 ? Math.round(totals.expense / months) : 0,
    days, biggestIncrease, balanceStart, balanceEnd, balanceSeries, insights, budgets,
  };
}
