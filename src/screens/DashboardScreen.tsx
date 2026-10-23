import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useData } from '../state/AppContext';
import { loadChart, loadDashboard, type ChartMode } from '../services/dashboard';
import { loadDemoData } from '../services/demo';
import {
  AnimatedAmount, Card, ChangeBadge, EmptyState, ErrorBox, IconBadge, InfoNote, Loading, Pill, Row, SectionHeader,
  Segmented, Txt, TxRow, toneColors, type IconName,
} from '../ui/components';
import { Donut, IncomeExpenseBars, Sparkline } from '../ui/charts';
import { formatRupiah, formatPercent } from '../domain/money';
import { formatDate } from '../domain/dates';
import { radius, space } from '../ui/theme';

export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const { colors: c, settings, repo, notifyDataChanged } = useApp();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ChartMode>('monthly');
  const dash = useData(loadDashboard);
  const chart = useData((r) => loadChart(r, mode), [mode]);
  const d = dash.data;

  const addTx = (type: 'income' | 'expense' | 'transfer') => nav.navigate('TxForm', { type });

  const tryDemo = () =>
    Alert.alert('Isi data contoh?', 'Data contoh ditandai khusus dan dapat dihapus kapan saja dari Pengaturan → Data contoh. Data asli Anda tidak tercampur.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Isi data contoh', onPress: async () => { await loadDemoData(repo); notifyDataChanged(); } },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: 8, backgroundColor: c.bg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt v="small">{d ? formatDate(d.today, 'long') : ' '}</Txt>
            <Txt v="h2" numberOfLines={1}>{settings.profileName ? `Halo, ${settings.profileName}` : 'FinTrack'}</Txt>
          </View>
          <Pressable onPress={() => nav.navigate('Profile')} hitSlop={10} accessibilityLabel="Profil">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="bodyStrong" color={c.primary}>{(settings.profileName || 'F').slice(0, 1).toUpperCase()}</Txt>
            </View>
          </Pressable>
        </Row>
      </View>
      <View style={{ flex: 1 }}>
        <ScrollContent refreshing={dash.loading && !!d} onRefresh={() => { dash.reload(); chart.reload(); }}>
          {dash.error ? <ErrorBox message={dash.error} onRetry={dash.reload} /> : null}
          {!d ? <Loading /> : (
            <>
              {d.hasDemo ? (
                <InfoNote icon="flask-outline">Mode data contoh aktif. Angka di bawah termasuk data contoh. Hapus lewat Pengaturan → Data contoh.</InfoNote>
              ) : null}

              {/* Hero: total balance */}
              <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: space.xl, marginBottom: space.md }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Txt v="small" color={c.heroMuted}>Total saldo saat ini</Txt>
                    <AnimatedAmount value={d.balance} style={{ color: c.heroText, fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 }} />
                    <Row gap={6} style={{ marginTop: 6 }}>
                      <Ionicons name={d.balanceChange >= 0 ? 'trending-up' : 'trending-down'} size={14} color={d.balanceChange >= 0 ? '#5EE6A8' : '#FF9C90'} />
                      <Txt v="tiny" color={c.heroMuted}>{formatRupiah(d.balanceChange, { sign: true })} sejak awal bulan</Txt>
                    </Row>
                  </View>
                  <Sparkline values={d.balanceSeries.map((p) => p.balance)} color="#5EE6E0" />
                </Row>
                {d.liabilities < 0 ? (
                  <Row gap={16} style={{ marginTop: space.md }}>
                    <Txt v="tiny" color={c.heroMuted}>Aset {formatRupiah(d.assets)}</Txt>
                    <Txt v="tiny" color={c.heroMuted}>Utang {formatRupiah(Math.abs(d.liabilities))}</Txt>
                  </Row>
                ) : null}
              </View>

              {/* Month summary */}
              <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
                <StatCard label="Pemasukan" value={d.income} color={c.income} icon="arrow-down-circle" change={d.incomeChange} goodWhenUp />
                <StatCard label="Pengeluaran" value={d.expense} color={c.expense} icon="arrow-up-circle" change={d.expenseChange} goodWhenUp={false} />
              </Row>
              <Card style={{ marginTop: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt v="small">Arus kas bersih bulan ini</Txt>
                    <Txt v="h2" color={d.net >= 0 ? c.income : c.expense}>{formatRupiah(d.net, { sign: true })}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt v="tiny">vs {d.comparisonLabel}</Txt>
                    <Txt v="smallStrong" color={d.netChangeAbs >= 0 ? c.income : c.expense}>{formatRupiah(d.netChangeAbs, { sign: true })}</Txt>
                  </View>
                </Row>
                <Txt v="tiny" style={{ marginTop: 6 }}>Periode {d.mtdLabel}. Perubahan % dibandingkan {d.comparisonLabel} (jumlah hari sama).</Txt>
              </Card>

              {/* Quick actions */}
              <Row style={{ justifyContent: 'space-between', marginVertical: space.sm }}>
                <QuickAction icon="add" label="Pemasukan" color={c.income} onPress={() => addTx('income')} />
                <QuickAction icon="remove" label="Pengeluaran" color={c.expense} onPress={() => addTx('expense')} />
                <QuickAction icon="swap-horizontal" label="Transfer" color={c.accent} onPress={() => addTx('transfer')} />
                <QuickAction icon="pie-chart-outline" label="Anggaran" color={c.warning} onPress={() => nav.navigate('Tabs', { screen: 'Budget', params: { openAdd: Date.now() } })} />
                <QuickAction icon="bar-chart-outline" label="Laporan" color={c.primary} onPress={() => nav.navigate('Tabs', { screen: 'Reports' })} />
              </Row>

              {d.isEmpty ? (
                <Card>
                  <EmptyState icon="receipt-outline" title="Belum ada transaksi" message="Catat pemasukan atau pengeluaran pertama Anda. Grafik dan analisis akan muncul otomatis dari data Anda."
                    action="Tambah transaksi pertama" onAction={() => addTx('expense')} />
                  <Pressable onPress={tryDemo} style={{ alignSelf: 'center', padding: 8 }}>
                    <Txt v="smallStrong" color={c.accent}>Atau coba dengan data contoh</Txt>
                  </Pressable>
                </Card>
              ) : (
                <>
                  {/* Income vs expense chart */}
                  <SectionHeader title="Pemasukan vs pengeluaran" />
                  <Card>
                    <Segmented value={mode} onChange={setMode} options={[{ value: 'weekly', label: 'Mingguan' }, { value: 'monthly', label: 'Bulanan' }, { value: 'yearly', label: 'Tahunan' }]} style={{ marginBottom: space.md }} />
                    {chart.data ? (
                      <>
                        <IncomeExpenseBars data={chart.data.buckets} />
                        <View style={{ marginTop: space.md, gap: 6 }}>
                          {chart.data.highestExpense ? (
                            <Txt v="small">Pengeluaran tertinggi: <Txt v="smallStrong">{chart.data.highestExpense.longLabel}</Txt> ({formatRupiah(chart.data.highestExpense.expense)})</Txt>
                          ) : null}
                          {chart.data.highestNet ? (
                            <Txt v="small">Arus kas bersih tertinggi: <Txt v="smallStrong">{chart.data.highestNet.longLabel}</Txt> ({formatRupiah(chart.data.highestNet.net, { sign: true })})</Txt>
                          ) : null}
                          {chart.data.lastVsPrev ? (
                            <Txt v="small">
                              {chart.data.lastVsPrev.label} vs {chart.data.lastVsPrev.prevLabel}: pengeluaran{' '}
                              {chart.data.lastVsPrev.expense === null ? 'belum dapat dibandingkan' : `${chart.data.lastVsPrev.expense >= 0 ? 'naik' : 'turun'} ${formatPercent(Math.abs(chart.data.lastVsPrev.expense))}`}
                              {mode !== 'yearly' ? ' (periode berjalan belum selesai)' : ''}.
                            </Txt>
                          ) : null}
                        </View>
                      </>
                    ) : <Loading />}
                  </Card>

                  {/* Expense breakdown */}
                  <SectionHeader title="Pengeluaran per kategori" subtitle={`Bulan ini · total ${formatRupiah(d.expense)}`} />
                  <Card>
                    {d.categories.length ? (
                      <Donut
                        slices={d.categories.map((x) => ({ key: x.categoryId ?? 'none', label: x.name, value: x.amount, color: x.color }))}
                        onSlicePress={(key) => nav.navigate('TxFiltered', { title: d.categories.find((x) => (x.categoryId ?? 'none') === key)?.name ?? 'Kategori', categoryIds: key === 'none' ? undefined : [key], from: d.month + '-01', to: d.today, type: 'expense' })}
                      />
                    ) : <Txt v="small">Belum ada pengeluaran bulan ini.</Txt>}
                    {d.categories.length ? <Txt v="tiny" style={{ marginTop: 6 }}>Ketuk kategori untuk melihat transaksinya.</Txt> : null}
                  </Card>

                  {/* Health */}
                  <SectionHeader title="Kesehatan keuangan" subtitle="Ketuk indikator untuk melihat definisinya" />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {d.health.map((h) => {
                      const tc = toneColors(c, h.tone);
                      return (
                        <View key={h.key} style={{ width: '50%', padding: 4 }}>
                          <Card style={{ marginBottom: 0, minHeight: 104 }} onPress={() => Alert.alert(h.label, h.definition + (h.detail ? `\n\n${h.detail}` : ''))}>
                            <Txt v="small" numberOfLines={2}>{h.label}</Txt>
                            <Txt v="h3" color={h.value ? tc.fg : c.textFaint} style={{ marginTop: 6 }} numberOfLines={1}>{h.value ?? 'Belum tersedia'}</Txt>
                            {h.value === null ? <Txt v="tiny" style={{ marginTop: 2 }}>Data belum cukup</Txt> : h.detail ? <Txt v="tiny" numberOfLines={2} style={{ marginTop: 2 }}>{h.detail}</Txt> : null}
                          </Card>
                        </View>
                      );
                    })}
                  </View>

                  {/* Insights */}
                  <SectionHeader title="Insight" subtitle="Dihitung otomatis dari data Anda" />
                  <Card>
                    {d.insights.length === 0 ? (
                      <Txt v="small">Insight akan muncul setelah ada minimal 3 transaksi bulan ini.</Txt>
                    ) : d.insights.map((i, idx) => {
                      const tc = toneColors(c, i.tone);
                      return (
                        <View key={i.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: c.border }}>
                          <IconBadge icon={i.kind === 'projection' ? 'telescope-outline' : i.tone === 'warning' ? 'alert-circle-outline' : i.tone === 'good' ? 'checkmark-circle-outline' : 'bulb-outline'} color={tc.fg} size={32} />
                          <View style={{ flex: 1 }}>
                            {i.kind === 'projection' ? <Pill text="PROYEKSI" color={tc.fg} bg={tc.bg} /> : null}
                            <Txt v="body" style={{ marginTop: i.kind === 'projection' ? 4 : 0 }}>{i.text}</Txt>
                            <Txt v="tiny" style={{ marginTop: 2 }}>{i.basis}</Txt>
                          </View>
                        </View>
                      );
                    })}
                  </Card>

                  {/* Recent */}
                  <SectionHeader title="Transaksi terakhir" action="Lihat semua" onAction={() => nav.navigate('Tabs', { screen: 'Transactions' })} />
                  <Card>
                    {d.recent.map((t, i) => (
                      <TxRow key={t.id} tx={t} last={i === d.recent.length - 1} onPress={() => nav.navigate('TxForm', { id: t.id })} />
                    ))}
                  </Card>
                </>
              )}
            </>
          )}
        </ScrollContent>
      </View>
    </View>
  );
}

function ScrollContent({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing: boolean; onRefresh: () => void }) {
  const { colors: c } = useApp();
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 4, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />}>
      {children}
    </ScrollView>
  );
}

function StatCard({ label, value, color, icon, change, goodWhenUp }: { label: string; value: number; color: string; icon: IconName; change: number | null; goodWhenUp: boolean }) {
  return (
    <Card style={{ flex: 1, marginBottom: 0 }}>
      <Row gap={6}>
        <Ionicons name={icon} size={18} color={color} />
        <Txt v="small">{label}</Txt>
      </Row>
      <AnimatedAmount value={value} style={{ fontSize: 18, fontWeight: '700', color, marginTop: 6 }} />
      <Row gap={4} style={{ marginTop: 4 }}>
        <ChangeBadge change={change} goodWhenUp={goodWhenUp} />
        {change !== null ? <Txt v="tiny">vs bln lalu</Txt> : null}
      </Row>
    </Card>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  const { colors: c } = useApp();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ alignItems: 'center', width: '19%', opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 50, height: 50, borderRadius: 17, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Txt v="tiny" style={{ marginTop: 6 }} numberOfLines={1} color={c.text}>{label}</Txt>
    </Pressable>
  );
}
