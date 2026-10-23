import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp, useData } from '../state/AppContext';
import {
  Button, Card, ChangeBadge, Chip, ChipScroll, EmptyState, ErrorBox, IconBadge, IconButton, Loading, Pill, Row, Screen,
  SectionHeader, Segmented, Txt, TxRow, toneColors,
} from '../ui/components';
import { DateField } from '../ui/DateField';
import { Donut, HBars, IncomeExpenseBars, TrendLine } from '../ui/charts';
import { loadReport } from '../services/dashboard';
import { buildReportHtml } from '../services/reportPdf';
import { sharePdfFromHtml, shareTextFile } from '../services/files';
import { transactionsToCsv } from '../services/csv';
import { formatPercent, formatRupiah } from '../domain/money';
import {
  DAYS_SHORT, addDays, daysInMonth, formatDate, formatMonth, shiftMonth, todayJakarta, toYMD, weekday,
} from '../domain/dates';
import { PERIOD_LABEL, resolvePeriod, type PeriodPreset } from '../domain/periods';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '../domain/types';
import { radius, space } from '../ui/theme';

const PRESETS: PeriodPreset[] = ['today', 'this_week', 'this_month', 'last_month', 'last_3_months', 'last_6_months', 'this_year', 'custom'];
const METHOD_COLORS = ['#0FA3A3', '#2563EB', '#F97362', '#A855F7', '#F59E0B', '#16A34A', '#64748B', '#94A3B8'];

export default function ReportsScreen() {
  const [view, setView] = useState<'summary' | 'calendar'>('summary');
  return (
    <Screen>
      <Segmented value={view} onChange={setView} options={[{ value: 'summary', label: 'Analisis' }, { value: 'calendar', label: 'Kalender' }]} style={{ marginBottom: space.md }} />
      {view === 'summary' ? <SummaryView /> : <CalendarView />}
    </Screen>
  );
}

function SummaryView() {
  const nav = useNavigation<any>();
  const { colors: c, repo } = useApp();
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [custom, setCustom] = useState({ from: todayJakarta().slice(0, 7) + '-01', to: todayJakarta() });
  const [topType, setTopType] = useState<'expense' | 'income'>('expense');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const period = resolvePeriod(preset, custom);
  const rep = useData((r) => loadReport(r, period.from, period.to), [period.from, period.to]);
  const d = rep.data;

  const exportCsv = async () => {
    setExporting('csv');
    try {
      const rows = await repo.listTransactions({ from: period.from, to: period.to, sort: 'oldest' });
      if (!rows.length) { Alert.alert('Tidak ada data', 'Tidak ada transaksi pada periode ini.'); return; }
      await shareTextFile(`fintrack_transaksi_${period.from}_${period.to}.csv`, transactionsToCsv(rows), 'text/csv');
    } catch (e: any) { Alert.alert('Gagal mengekspor', e?.message ?? String(e)); } finally { setExporting(null); }
  };
  const exportPdf = async () => {
    if (!d) return;
    setExporting('pdf');
    try { await sharePdfFromHtml(`fintrack_laporan_${period.from}_${period.to}.pdf`, buildReportHtml(d)); }
    catch (e: any) { Alert.alert('Gagal membuat PDF', e?.message ?? String(e)); } finally { setExporting(null); }
  };

  return (
    <View>
      <ChipScroll>
        {PRESETS.map((p) => <Chip key={p} label={PERIOD_LABEL[p]} active={preset === p} onPress={() => setPreset(p)} />)}
      </ChipScroll>
      {preset === 'custom' ? (
        <Row style={{ marginBottom: space.sm }}>
          <View style={{ flex: 1 }}><DateField compact value={custom.from} onChange={(v) => setCustom((s) => ({ ...s, from: v }))} /></View>
          <Txt v="small">s/d</Txt>
          <View style={{ flex: 1 }}><DateField compact value={custom.to} onChange={(v) => setCustom((s) => ({ ...s, to: v }))} /></View>
        </Row>
      ) : null}
      {rep.error ? <ErrorBox message={rep.error} onRetry={rep.reload} /> : null}
      {!d ? <Loading /> : (
        <>
          <Txt v="small" style={{ marginBottom: space.sm }}>{d.label} · dibandingkan {d.prevLabel}</Txt>

          {/* A. Income & expense */}
          <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
            <Card style={{ flex: 1, marginBottom: 0 }}>
              <Txt v="small">Pemasukan</Txt>
              <Txt v="h3" color={c.income} numberOfLines={1}>{formatRupiah(d.totals.income)}</Txt>
              <ChangeBadge change={d.incomeChange} goodWhenUp />
            </Card>
            <Card style={{ flex: 1, marginBottom: 0 }}>
              <Txt v="small">Pengeluaran</Txt>
              <Txt v="h3" color={c.expense} numberOfLines={1}>{formatRupiah(d.totals.expense)}</Txt>
              <ChangeBadge change={d.expenseChange} goodWhenUp={false} />
            </Card>
          </Row>

          {/* D. Cash flow */}
          <Card style={{ marginTop: space.sm }}>
            <Txt v="h3">Arus kas</Txt>
            <FlowRow label="Saldo awal periode" value={d.balanceStart} />
            <FlowRow label="Uang masuk" value={d.totals.income} color={c.income} sign="+" />
            <FlowRow label="Uang keluar" value={d.totals.expense} color={c.expense} sign="−" />
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
            <FlowRow label="Arus kas bersih" value={d.totals.net} color={d.totals.net >= 0 ? c.income : c.expense} strong signed />
            <FlowRow label={`Saldo akhir (${formatDate(d.balanceSeries.length ? d.balanceSeries[d.balanceSeries.length - 1].date : d.to)})`} value={d.balanceEnd} strong />
            <Txt v="tiny" style={{ marginTop: 6 }}>Transfer antar akun tidak mengubah total saldo dan tidak dihitung sebagai uang masuk/keluar.</Txt>
          </Card>

          {d.totals.count === 0 ? (
            <Card><EmptyState icon="analytics-outline" title="Belum ada transaksi pada periode ini" message="Pilih periode lain atau tambahkan transaksi." /></Card>
          ) : (
            <>
              {/* C. Trend */}
              <SectionHeader title="Tren pemasukan & pengeluaran" subtitle={`Per ${d.granularity === 'day' ? 'hari' : d.granularity === 'week' ? 'minggu' : d.granularity === 'month' ? 'bulan' : 'tahun'}`} />
              <Card><IncomeExpenseBars data={d.buckets} /></Card>
              {d.balanceSeries.length > 1 ? (
                <>
                  <SectionHeader title="Tren saldo" subtitle="Total saldo seluruh akun di akhir hari" />
                  <Card><TrendLine points={d.balanceSeries.map((p) => ({ x: p.date, y: p.balance }))} /></Card>
                </>
              ) : null}

              {/* B. Expense analysis */}
              <SectionHeader title="Analisis pengeluaran" />
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <Txt v="small">Rata-rata harian</Txt>
                    <Txt v="bodyStrong">{formatRupiah(d.avgDailyExpense)}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt v="small">Rata-rata bulanan</Txt>
                    <Txt v="bodyStrong">{formatRupiah(d.avgMonthlyExpense)}</Txt>
                  </View>
                </Row>
                <Txt v="tiny" style={{ marginTop: 6 }}>Dihitung dari {d.days} hari yang sudah berjalan pada periode ini.</Txt>
                {d.biggestIncrease ? (
                  <Txt v="small" style={{ marginTop: 10 }}>
                    Kenaikan terbesar: <Txt v="smallStrong">{d.biggestIncrease.name}</Txt> +{formatRupiah(d.biggestIncrease.diff)} ({formatRupiah(d.biggestIncrease.prev)} → {formatRupiah(d.biggestIncrease.cur)})
                  </Txt>
                ) : null}
              </Card>
              {d.categories.length ? (
                <Card>
                  <Txt v="smallStrong" style={{ marginBottom: space.sm }}>Per kategori</Txt>
                  <Donut slices={d.categories.map((x) => ({ key: x.categoryId ?? 'none', label: x.name, value: x.amount, color: x.color }))}
                    onSlicePress={(key) => nav.navigate('TxFiltered', { title: d.categories.find((x) => (x.categoryId ?? 'none') === key)?.name ?? 'Kategori', categoryIds: key === 'none' ? undefined : [key], from: d.from, to: d.to, type: 'expense' })} />
                </Card>
              ) : null}
              {d.byAccount.length ? (
                <Card>
                  <Txt v="smallStrong" style={{ marginBottom: space.sm }}>Per akun</Txt>
                  <HBars items={d.byAccount.map((a) => ({ label: a.name, value: a.amount, color: a.color }))} />
                </Card>
              ) : null}
              {d.byMethod.length ? (
                <Card>
                  <Txt v="smallStrong" style={{ marginBottom: space.sm }}>Per metode pembayaran</Txt>
                  <HBars items={d.byMethod.map((m, i) => ({ label: m.method ? PAYMENT_METHOD_LABEL[m.method as PaymentMethod] ?? m.method : 'Tidak diisi', value: m.amount, color: METHOD_COLORS[i % METHOD_COLORS.length] }))} />
                </Card>
              ) : null}
              {d.incomeCategories.length ? (
                <Card>
                  <Txt v="smallStrong" style={{ marginBottom: space.sm }}>Sumber pemasukan</Txt>
                  <HBars items={d.incomeCategories.map((x) => ({ label: x.name, value: x.amount, color: x.color }))} />
                </Card>
              ) : null}

              {/* E. Top transactions */}
              <SectionHeader title="Transaksi terbesar" />
              <Card>
                <Segmented value={topType} onChange={setTopType} options={[{ value: 'expense', label: 'Pengeluaran' }, { value: 'income', label: 'Pemasukan' }]} style={{ marginBottom: space.sm }} />
                {(topType === 'expense' ? d.topExpenses : d.topIncome).map((t, i, arr) => (
                  <TxRow key={t.id} tx={t} last={i === arr.length - 1} onPress={() => nav.navigate('TxForm', { id: t.id })} />
                ))}
                {(topType === 'expense' ? d.topExpenses : d.topIncome).length === 0 ? <Txt v="small">Tidak ada data.</Txt> : null}
              </Card>

              {/* Insights */}
              {d.insights.length ? (
                <>
                  <SectionHeader title="Insight periode ini" />
                  <Card>
                    {d.insights.map((i, idx) => {
                      const tc = toneColors(c, i.tone);
                      return (
                        <View key={i.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: c.border }}>
                          <IconBadge icon={i.kind === 'projection' ? 'telescope-outline' : 'bulb-outline'} color={tc.fg} size={30} />
                          <View style={{ flex: 1 }}>
                            {i.kind === 'projection' ? <Pill text="PROYEKSI" color={tc.fg} bg={tc.bg} /> : null}
                            <Txt v="small" color={c.text}>{i.text}</Txt>
                            <Txt v="tiny">{i.basis}</Txt>
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                </>
              ) : null}
            </>
          )}

          <SectionHeader title="Ekspor" />
          <Row>
            <Button title="CSV" icon="document-text-outline" variant="secondary" onPress={exportCsv} loading={exporting === 'csv'} style={{ flex: 1 }} />
            <Button title="PDF" icon="document-outline" variant="secondary" onPress={exportPdf} loading={exporting === 'pdf'} style={{ flex: 1 }} />
          </Row>
        </>
      )}
    </View>
  );
}

function FlowRow({ label, value, color, sign, strong, signed }: { label: string; value: number; color?: string; sign?: string; strong?: boolean; signed?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <Txt v={strong ? 'bodyStrong' : 'small'} style={{ flex: 1 }}>{label}</Txt>
      <Txt v={strong ? 'bodyStrong' : 'body'} color={color}>{sign ?? ''}{formatRupiah(value, { sign: signed })}</Txt>
    </Row>
  );
}

function CalendarView() {
  const nav = useNavigation<any>();
  const { colors: c } = useApp();
  const today = todayJakarta();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(today.slice(0, 7) === month ? today : null);
  const first = month + '-01';
  const dim = daysInMonth(+month.slice(0, 4), +month.slice(5, 7));
  const last = toYMD(+month.slice(0, 4), +month.slice(5, 7), dim);
  const data = useData(async (r) => ({
    days: await r.activityDays(first, last),
    totals: await r.totals(first, last),
  }), [month]);
  const dayTx = useData((r) => (day ? r.listTransactions({ from: day, to: day }) : Promise.resolve([])), [day]);
  const byDate = new Map((data.data?.days ?? []).map((x) => [x.date, x]));
  const lead = (weekday(first) + 6) % 7; // Monday-first grid
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const weekdayLabels = [...DAYS_SHORT.slice(1), DAYS_SHORT[0]];

  return (
    <View>
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <IconButton icon="chevron-back" onPress={() => { setMonth(shiftMonth(month, -1)); setDay(null); }} label="Bulan sebelumnya" />
          <Txt v="h3">{formatMonth(month, true)}</Txt>
          <IconButton icon="chevron-forward" onPress={() => { setMonth(shiftMonth(month, 1)); setDay(null); }} label="Bulan berikutnya" />
        </Row>
        <Row gap={0}>
          {weekdayLabels.map((w) => <Txt key={w} v="tiny" center style={{ flex: 1 }}>{w}</Txt>)}
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          {cells.map((d, i) => {
            if (!d) return <View key={'e' + i} style={{ width: `${100 / 7}%`, height: 50 }} />;
            const a = byDate.get(d);
            const sel = d === day;
            const isToday = d === today;
            return (
              <Pressable key={d} onPress={() => setDay(d)} accessibilityLabel={formatDate(d)} style={{ width: `${100 / 7}%`, height: 50, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.accent : isToday ? c.accentSoft : 'transparent' }}>
                  <Txt v="smallStrong" color={sel ? '#FFF' : d > today ? c.textFaint : c.text}>{+d.slice(8)}</Txt>
                  <Row gap={3} style={{ marginTop: 3, height: 6 }}>
                    {a?.income ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sel ? '#FFF' : c.income }} /> : null}
                    {a?.expense ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sel ? '#FFF' : c.expense }} /> : null}
                    {a?.transfers ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sel ? '#FFF' : c.primary }} /> : null}
                  </Row>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Row gap={14} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
          <Row gap={5}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.income }} /><Txt v="tiny">Pemasukan</Txt></Row>
          <Row gap={5}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.expense }} /><Txt v="tiny">Pengeluaran</Txt></Row>
          <Row gap={5}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} /><Txt v="tiny">Transfer</Txt></Row>
        </Row>
        {data.data ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <Txt v="small" color={c.income}>Masuk {formatRupiah(data.data.totals.income)}</Txt>
            <Txt v="small" color={c.expense}>Keluar {formatRupiah(data.data.totals.expense)}</Txt>
          </Row>
        ) : null}
      </Card>
      {day ? (
        <>
          <SectionHeader title={formatDate(day, 'long')} subtitle={byDate.get(day) ? `+${formatRupiah(byDate.get(day)!.income)} · −${formatRupiah(byDate.get(day)!.expense)}` : undefined} />
          <Card>
            {(dayTx.data ?? []).length === 0 ? <Txt v="small">Tidak ada transaksi pada hari ini.</Txt> : null}
            {(dayTx.data ?? []).map((t, i, arr) => <TxRow key={t.id} tx={t} last={i === arr.length - 1} onPress={() => nav.navigate('TxForm', { id: t.id })} />)}
          </Card>
        </>
      ) : null}
    </View>
  );
}
