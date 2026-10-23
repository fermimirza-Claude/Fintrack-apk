import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useData } from '../state/AppContext';
import {
  Button, Chip, ChipScroll, EmptyState, ErrorBox, Field, Input, Row, SelectField, SelectSheet, Sheet, Txt, TxRow,
} from '../ui/components';
import { DateField } from '../ui/DateField';
import { formatRupiah, parseRupiahInput, formatAmountTyping } from '../domain/money';
import { formatDate, relativeDayLabel, todayJakarta } from '../domain/dates';
import { PERIOD_LABEL, resolvePeriod, type PeriodPreset } from '../domain/periods';
import type { TxFilter, TxType, TxView } from '../domain/types';
import { TX_TYPE_LABEL } from '../domain/types';
import type { RootScreen } from '../navigation/types';
import { radius, space } from '../ui/theme';

type PeriodChoice = PeriodPreset | 'all';

export function TransactionList({ locked, header }: { locked?: TxFilter; header?: React.ReactNode }) {
  const nav = useNavigation<any>();
  const { colors: c, settings } = useApp();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodChoice>(locked?.from ? 'custom' : 'all');
  const [custom, setCustom] = useState({ from: locked?.from ?? todayJakarta().slice(0, 7) + '-01', to: locked?.to ?? todayJakarta() });
  const [type, setType] = useState<TxType | undefined>(locked?.type);
  const [categoryId, setCategoryId] = useState<string | undefined>(locked?.categoryIds?.[0]);
  const [accountId, setAccountId] = useState<string | undefined>(locked?.accountId);
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'largest'>('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [picker, setPicker] = useState<'category' | 'account' | null>(null);

  const filter: TxFilter = useMemo(() => {
    const f: TxFilter = { search, type, accountId, sort, categoryIds: categoryId ? [categoryId] : undefined };
    if (period !== 'all') {
      const p = resolvePeriod(period, custom);
      f.from = p.from; f.to = p.to;
    }
    const mn = parseRupiahInput(minAmt); const mx = parseRupiahInput(maxAmt);
    if (mn !== null) f.minAmount = mn;
    if (mx !== null) f.maxAmount = mx;
    return f;
  }, [search, type, accountId, sort, categoryId, period, custom, minAmt, maxAmt]);

  const list = useData((r) => r.listTransactions(filter), [JSON.stringify(filter)]);
  const meta = useData(async (r) => ({ accounts: await r.listAccounts(), categories: await r.listCategories(undefined, true) }));

  const sections = useMemo(() => {
    const rows = list.data ?? [];
    if (sort === 'largest') return rows.length ? [{ title: 'Nominal terbesar', total: null as number | null, data: rows }] : [];
    const map = new Map<string, TxView[]>();
    rows.forEach((t) => { if (!map.has(t.date)) map.set(t.date, []); map.get(t.date)!.push(t); });
    return Array.from(map.entries()).map(([date, data]) => ({
      title: relativeDayLabel(date, settings.dateFormat) === formatDate(date, settings.dateFormat) ? formatDate(date, 'long') : `${relativeDayLabel(date)} · ${formatDate(date, settings.dateFormat)}`,
      total: data.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0),
      data,
    }));
  }, [list.data, sort, settings.dateFormat]);

  const totals = useMemo(() => {
    const rows = list.data ?? [];
    return {
      income: rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      count: rows.length,
    };
  }, [list.data]);

  const activeFilters = [categoryId, accountId, minAmt, maxAmt, sort !== 'newest' ? sort : ''].filter(Boolean).length;
  const cats = meta.data?.categories ?? [];
  const categoryName = cats.find((x) => x.id === categoryId)?.name;
  const accountName = meta.data?.accounts.find((a) => a.id === accountId)?.name;
  const categoryOptions = cats.filter((x) => !type || type === 'transfer' || x.kind === type).filter((x) => !x.parentId)
    .flatMap((p) => [{ value: p.id, label: p.name, icon: p.icon, color: p.color, subtitle: p.kind === 'income' ? 'Pemasukan' : 'Pengeluaran' },
      ...cats.filter((s) => s.parentId === p.id).map((s) => ({ value: s.id, label: s.name, indent: true }))]);

  const resetFilters = () => {
    if (!locked?.categoryIds) setCategoryId(undefined);
    if (!locked?.accountId) setAccountId(undefined);
    setMinAmt(''); setMaxAmt(''); setSort('newest');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {header}
        <Row>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={c.textFaint} />
            <Input value={search} onChangeText={setSearch} placeholder="Cari nama, catatan, tag, kategori…" returnKeyType="search"
              style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 8 }} />
            {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={c.textFaint} /></Pressable> : null}
          </View>
          <Pressable onPress={() => setFilterOpen(true)} accessibilityLabel="Filter"
            style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: activeFilters ? c.accent : c.surface, borderWidth: 1, borderColor: activeFilters ? c.accent : c.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="options-outline" size={20} color={activeFilters ? '#FFF' : c.text} />
            {activeFilters ? <View style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} /> : null}
          </Pressable>
        </Row>
        <View style={{ marginTop: space.sm }}>
          <ChipScroll>
            {(['all', 'today', 'this_week', 'this_month', 'last_month', 'last_3_months', 'this_year', 'custom'] as PeriodChoice[]).map((p) => (
              <Chip key={p} label={p === 'all' ? 'Semua waktu' : PERIOD_LABEL[p]} active={period === p} onPress={() => setPeriod(p)} />
            ))}
          </ChipScroll>
          {!locked?.type ? (
            <ChipScroll>
              <Chip label="Semua jenis" active={!type} onPress={() => setType(undefined)} />
              {(['income', 'expense', 'transfer'] as TxType[]).map((t) => (
                <Chip key={t} label={TX_TYPE_LABEL[t]} active={type === t} color={t === 'income' ? c.income : t === 'expense' ? c.expense : c.accent} onPress={() => setType(type === t ? undefined : t)} />
              ))}
            </ChipScroll>
          ) : null}
        </View>
        {period === 'custom' ? (
          <Row style={{ marginBottom: space.sm }}>
            <View style={{ flex: 1 }}><DateField value={custom.from} onChange={(v) => setCustom((s) => ({ ...s, from: v }))} compact /></View>
            <Txt v="small">s/d</Txt>
            <View style={{ flex: 1 }}><DateField value={custom.to} onChange={(v) => setCustom((s) => ({ ...s, to: v }))} compact /></View>
          </Row>
        ) : null}
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Txt v="tiny">{totals.count} transaksi</Txt>
          <Row gap={12}>
            <Txt v="tiny" color={c.income}>+{formatRupiah(totals.income)}</Txt>
            <Txt v="tiny" color={c.expense}>−{formatRupiah(totals.expense)}</Txt>
          </Row>
        </Row>
      </View>

      {list.error ? <View style={{ paddingHorizontal: space.lg }}><ErrorBox message={list.error} onRetry={list.reload} /></View> : null}
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 110 + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <Row style={{ justifyContent: 'space-between', marginTop: space.md, marginBottom: 4 }}>
            <Txt v="label">{section.title}</Txt>
            {section.total !== null ? <Txt v="tiny" color={section.total >= 0 ? c.income : c.expense}>{formatRupiah(section.total, { sign: true })}</Txt> : null}
          </Row>
        )}
        renderItem={({ item, index, section }) => (
          <View style={{ backgroundColor: c.surface, paddingHorizontal: space.md, borderTopLeftRadius: index === 0 ? radius.md : 0, borderTopRightRadius: index === 0 ? radius.md : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? radius.md : 0, borderBottomRightRadius: index === section.data.length - 1 ? radius.md : 0 }}>
            <TxRow tx={item} last={index === section.data.length - 1} onPress={() => nav.navigate('TxForm', { id: item.id })} />
          </View>
        )}
        ListEmptyComponent={list.loading ? null : (
          <EmptyState icon="file-tray-outline" title={search || activeFilters || period !== 'all' || type ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi'}
            message={search || activeFilters || period !== 'all' || type ? 'Coba ubah kata kunci atau filter.' : 'Tambahkan transaksi pertama Anda.'}
            action={search || activeFilters ? undefined : 'Tambah transaksi'} onAction={() => nav.navigate('TxForm', { type: 'expense' })} />
        )}
      />

      <Pressable onPress={() => nav.navigate('TxForm', { type: locked?.type ?? 'expense' })} accessibilityLabel="Tambah transaksi"
        style={({ pressed }) => ({ position: 'absolute', right: space.lg, bottom: space.lg + (locked ? insets.bottom : 0), width: 58, height: 58, borderRadius: 29, backgroundColor: c.mode === 'dark' ? c.accent : c.primary,
          alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, opacity: pressed ? 0.85 : 1 })}>
        <Ionicons name="add" size={30} color="#FFF" />
      </Pressable>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter transaksi">
        <Field label="Kategori">
          <SelectField value={categoryName} placeholder="Semua kategori" onPress={() => setPicker('category')} icon="pricetags-outline" />
        </Field>
        <Field label="Akun">
          <SelectField value={accountName} placeholder="Semua akun" onPress={() => setPicker('account')} icon="wallet-outline" />
        </Field>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Nominal minimal">
              <Input value={minAmt} onChangeText={(t) => setMinAmt(formatAmountTyping(t))} keyboardType="number-pad" placeholder="Rp0" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Nominal maksimal">
              <Input value={maxAmt} onChangeText={(t) => setMaxAmt(formatAmountTyping(t))} keyboardType="number-pad" placeholder="Tanpa batas" />
            </Field>
          </View>
        </Row>
        <Field label="Urutkan">
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="Terbaru" active={sort === 'newest'} onPress={() => setSort('newest')} />
            <Chip label="Terlama" active={sort === 'oldest'} onPress={() => setSort('oldest')} />
            <Chip label="Nominal terbesar" active={sort === 'largest'} onPress={() => setSort('largest')} />
          </Row>
        </Field>
        <Row style={{ marginTop: space.sm }}>
          <Button title="Reset" variant="secondary" onPress={resetFilters} style={{ flex: 1 }} />
          <Button title="Terapkan" onPress={() => setFilterOpen(false)} style={{ flex: 1 }} />
        </Row>
      </Sheet>
      <SelectSheet visible={picker === 'category'} onClose={() => setPicker(null)} title="Pilih kategori" value={categoryId}
        options={[{ value: '', label: 'Semua kategori' }, ...categoryOptions]} onSelect={(v) => setCategoryId(v || undefined)} />
      <SelectSheet visible={picker === 'account'} onClose={() => setPicker(null)} title="Pilih akun" value={accountId}
        options={[{ value: '', label: 'Semua akun' }, ...(meta.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline', color: a.color }))]}
        onSelect={(v) => setAccountId(v || undefined)} />
    </View>
  );
}

export default function TransactionsScreen() {
  return <TransactionList />;
}

export function TxFilteredScreen({ route }: RootScreen<'TxFiltered'>) {
  const p = route.params;
  return <TransactionList locked={{ categoryIds: p.categoryIds, from: p.from, to: p.to, accountId: p.accountId, type: p.type }} />;
}
