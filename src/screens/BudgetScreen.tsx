import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp, useData } from '../state/AppContext';
import {
  Button, Card, EmptyState, ErrorBox, Field, IconBadge, IconButton, Input, Loading, Pill, ProgressBar, Row, Screen,
  SectionHeader, SelectField, SelectSheet, Sheet, Txt, toneColors,
} from '../ui/components';
import { formatAmountTyping, formatPercent, formatRupiah, parseRupiahInput } from '../domain/money';
import { formatMonth, monthRange, shiftMonth, todayJakarta, diffDays } from '../domain/dates';
import type { BudgetStatus } from '../db/repo';
import { ValidationError } from '../db/repo';
import { space } from '../ui/theme';

const STATUS_LABEL = { safe: 'Aman', warning: 'Mendekati batas', over: 'Melebihi batas' } as const;

export default function BudgetScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { repo, colors: c, notifyDataChanged } = useApp();
  const [month, setMonth] = useState(todayJakarta().slice(0, 7));
  const [editing, setEditing] = useState<BudgetStatus | 'new' | null>(null);
  const [catPick, setCatPick] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const data = useData(async (r) => {
    const [budgets, cats] = await Promise.all([r.budgetStatuses(month), r.listCategories('expense')]);
    const { from, to } = monthRange(month);
    const totals = await r.totals(from, to);
    const prevCount = (await r.budgetStatuses(shiftMonth(month, -1))).length;
    return { budgets, cats, totalExpense: totals.expense, prevCount };
  }, [month]);

  useEffect(() => {
    if (route.params?.openAdd) openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.openAdd]);

  function openNew() { setCatId(null); setAmount(''); setErr(null); setEditing('new'); }
  function openEdit(b: BudgetStatus) { setCatId(b.categoryId); setAmount(formatAmountTyping(String(b.amount))); setErr(null); setEditing(b); }

  const save = async () => {
    const amt = parseRupiahInput(amount);
    if (!catId) return setErr('Pilih kategori.');
    if (!amt) return setErr('Masukkan batas anggaran lebih dari Rp0.');
    try {
      await repo.upsertBudget(month, catId, amt);
      setEditing(null);
      notifyDataChanged();
    } catch (e: any) {
      setErr(e instanceof ValidationError ? e.message : String(e?.message ?? e));
    }
  };

  const remove = (b: BudgetStatus) =>
    Alert.alert('Hapus anggaran?', `Anggaran ${b.categoryName} untuk ${formatMonth(month, true)} akan dihapus. Transaksi tidak terpengaruh.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => { await repo.deleteBudget(b.id); setEditing(null); notifyDataChanged(); } },
    ]);

  const copyPrev = async () => {
    const prev = shiftMonth(month, -1);
    const n = await repo.copyBudgets(prev, month);
    notifyDataChanged();
    Alert.alert('Selesai', n > 0 ? `${n} anggaran disalin dari ${formatMonth(prev, true)}.` : 'Tidak ada anggaran baru untuk disalin (kategori yang sudah ada tidak ditimpa).');
  };

  const d = data.data;
  const limit = d?.budgets.reduce((s, b) => s + b.amount, 0) ?? 0;
  const spent = d?.budgets.reduce((s, b) => s + b.spent, 0) ?? 0;
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const overall = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'safe';
  const budgeted = new Set(d?.budgets.map((b) => b.categoryId));
  const cats = d?.cats ?? [];
  const catOptions = cats.filter((x) => !x.parentId).flatMap((p) => [
    { value: p.id, label: p.name, icon: p.icon, color: p.color, subtitle: budgeted.has(p.id) ? 'Sudah ada anggaran' : 'Termasuk semua subkategori' },
    ...cats.filter((s) => s.parentId === p.id).map((s) => ({ value: s.id, label: s.name, indent: true, subtitle: budgeted.has(s.id) ? 'Sudah ada anggaran' : undefined })),
  ]);
  const selCat = cats.find((x) => x.id === catId);
  const isCurrent = month === todayJakarta().slice(0, 7);
  const daysLeft = isCurrent ? diffDays(monthRange(month).to, todayJakarta()) + 1 : 0;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <IconButton icon="chevron-back" onPress={() => setMonth(shiftMonth(month, -1))} label="Bulan sebelumnya" bg={c.surface} />
        <View style={{ alignItems: 'center' }}>
          <Txt v="h3">{formatMonth(month, true)}</Txt>
          {isCurrent ? <Txt v="tiny">{daysLeft} hari tersisa</Txt> : null}
        </View>
        <IconButton icon="chevron-forward" onPress={() => setMonth(shiftMonth(month, 1))} label="Bulan berikutnya" bg={c.surface} />
      </Row>
      {data.error ? <ErrorBox message={data.error} onRetry={data.reload} /> : null}
      {!d ? <Loading /> : (
        <>
          {d.budgets.length ? (
            <Card style={{ backgroundColor: c.hero }}>
              <Txt v="small" color={c.heroMuted}>Total anggaran terpakai</Txt>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
                <Txt v="h2" color={c.heroText}>{formatRupiah(spent)}</Txt>
                <Txt v="small" color={c.heroMuted}>dari {formatRupiah(limit)}</Txt>
              </Row>
              <View style={{ marginTop: space.md }}>
                <ProgressBar percent={pct} color={toneColors(c, overall === 'safe' ? 'good' : overall === 'warning' ? 'warning' : 'bad').fg} />
              </View>
              <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <Txt v="tiny" color={c.heroMuted}>{formatPercent(pct)} terpakai</Txt>
                <Txt v="tiny" color={c.heroMuted}>Sisa {formatRupiah(limit - spent)}</Txt>
              </Row>
              {isCurrent && limit - spent > 0 && daysLeft > 0 ? (
                <Txt v="tiny" color={c.heroMuted} style={{ marginTop: 6 }}>Batas aman ≈ {formatRupiah(Math.floor((limit - spent) / daysLeft))}/hari untuk kategori beranggaran.</Txt>
              ) : null}
            </Card>
          ) : null}

          <Row style={{ marginBottom: space.sm }}>
            <Button title="Tambah anggaran" icon="add" onPress={openNew} style={{ flex: 1 }} />
            {d.prevCount > 0 ? <Button title="Salin bulan lalu" icon="copy-outline" variant="secondary" onPress={copyPrev} style={{ flex: 1 }} /> : null}
          </Row>

          {d.budgets.length === 0 ? (
            <Card>
              <EmptyState icon="pie-chart-outline" title="Belum ada anggaran bulan ini"
                message="Tentukan batas pengeluaran per kategori. Anda akan diperingatkan saat pemakaian mencapai 80% dan 100%." />
            </Card>
          ) : (
            <>
              <SectionHeader title="Per kategori" subtitle="Ketuk untuk mengubah · tahan untuk melihat transaksi" />
              {d.budgets.map((b) => {
                const tone = b.status === 'safe' ? 'good' : b.status === 'warning' ? 'warning' : 'bad';
                const tc = toneColors(c, tone);
                const { from, to } = monthRange(month);
                return (
                  <Pressable key={b.id} onPress={() => openEdit(b)} onLongPress={() => nav.navigate('TxFiltered', { title: b.categoryName, categoryIds: [b.categoryId], from, to, type: 'expense' })}>
                    <Card>
                      <Row>
                        <IconBadge icon={b.categoryIcon} color={b.categoryColor} size={38} />
                        <View style={{ flex: 1 }}>
                          <Txt v="bodyStrong" numberOfLines={1}>{b.categoryName}</Txt>
                          <Txt v="small">{formatRupiah(b.spent)} dari {formatRupiah(b.amount)}</Txt>
                        </View>
                        <Pill text={STATUS_LABEL[b.status]} color={tc.fg} bg={tc.bg} />
                      </Row>
                      <View style={{ marginTop: space.md }}><ProgressBar percent={b.percent} color={tc.fg} /></View>
                      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                        <Txt v="tiny">{formatPercent(b.percent)} terpakai</Txt>
                        <Txt v="tiny" color={b.remaining < 0 ? c.expense : undefined}>
                          {b.remaining >= 0 ? `Sisa ${formatRupiah(b.remaining)}` : `Lebih ${formatRupiah(-b.remaining)}`}
                        </Txt>
                      </Row>
                    </Card>
                  </Pressable>
                );
              })}
              {d.totalExpense - spent > 0 ? (
                <Txt v="small" style={{ marginTop: 4 }}>Pengeluaran di luar kategori beranggaran bulan ini: {formatRupiah(d.totalExpense - spent)}.</Txt>
              ) : null}
            </>
          )}
        </>
      )}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Anggaran baru' : 'Ubah anggaran'}>
        <Txt v="small" style={{ marginBottom: space.md }}>{formatMonth(month, true)}</Txt>
        <Field label="Kategori pengeluaran">
          <SelectField value={selCat?.name} placeholder="Pilih kategori" onPress={() => editing === 'new' && setCatPick(true)} icon={(selCat?.icon ?? 'pricetag-outline') as any} iconColor={selCat?.color} />
        </Field>
        <Field label="Batas anggaran" error={err}>
          <Input value={amount} onChangeText={(t) => { setAmount(formatAmountTyping(t)); setErr(null); }} keyboardType="number-pad" placeholder="Contoh: 2.000.000" />
        </Field>
        <Button title="Simpan" icon="checkmark" onPress={save} />
        {editing && editing !== 'new' ? <Button title="Hapus anggaran" variant="ghost" onPress={() => remove(editing)} style={{ marginTop: space.sm }} /> : null}
      </Sheet>
      <SelectSheet visible={catPick} onClose={() => setCatPick(false)} title="Pilih kategori" value={catId} options={catOptions} onSelect={(v) => { setCatId(v); setErr(null); }} />
    </Screen>
  );
}
