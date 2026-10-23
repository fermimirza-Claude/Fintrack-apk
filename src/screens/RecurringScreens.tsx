import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApp, useData } from '../state/AppContext';
import {
  Button, Card, Chip, EmptyState, Field, IconBadge, InfoNote, Input, Loading, Pill, Row, Screen, SectionHeader, Segmented,
  SelectField, SelectSheet, SwitchRow, Txt, type SelectOption,
} from '../ui/components';
import { DateField } from '../ui/DateField';
import { ValidationError } from '../db/repo';
import { formatAmountTyping, formatRupiah, parseRupiahInput } from '../domain/money';
import { formatDate, todayJakarta } from '../domain/dates';
import { upcomingOccurrences } from '../domain/recurring';
import { FREQUENCY_LABEL, type Account, type Category, type Frequency, type RecurringRule, type TxType } from '../domain/types';
import { requestNotificationPermission, syncReminders } from '../services/notifications';
import type { RootScreen } from '../navigation/types';
import { space } from '../ui/theme';

function freqText(r: { frequency: Frequency; interval: number }) {
  const unit = { daily: 'hari', weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' }[r.frequency];
  return r.interval > 1 ? `Setiap ${r.interval} ${unit}` : FREQUENCY_LABEL[r.frequency];
}

export function RecurringScreen({ navigation }: RootScreen<'Recurring'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const data = useData(async (r) => ({ rules: await r.listRecurring(), cats: await r.listCategories(undefined, true), accounts: await r.listAccounts() }));
  const today = todayJakarta();
  const rules = data.data?.rules ?? [];
  const due = rules.filter((r) => r.isActive && !r.autoPost && r.nextDate <= today);
  const upcoming = rules.filter((r) => r.isActive && !(due.includes(r)));
  const inactive = rules.filter((r) => !r.isActive);
  const catName = (id: string | null) => data.data?.cats.find((x) => x.id === id)?.name;
  const accName = (id: string | null) => data.data?.accounts.find((x) => x.id === id)?.name ?? '';

  const post = async (r: RecurringRule) => {
    try { await repo.postRecurringNow(r.id); await syncReminders(repo); notifyDataChanged(); }
    catch (e: any) { Alert.alert('Gagal mencatat', e?.message ?? String(e)); }
  };
  const skip = (r: RecurringRule) => Alert.alert('Lewati jadwal ini?', `Jadwal ${formatDate(r.nextDate)} tidak akan dicatat.`, [
    { text: 'Batal', style: 'cancel' },
    { text: 'Lewati', onPress: async () => { await repo.skipRecurring(r.id); await syncReminders(repo); notifyDataChanged(); } },
  ]);

  const RuleCard = ({ r, actions }: { r: RecurringRule; actions?: boolean }) => {
    const color = r.type === 'income' ? c.income : r.type === 'expense' ? c.expense : c.accent;
    return (
      <Card onPress={() => navigation.navigate('RecurringForm', { id: r.id })}>
        <Row>
          <IconBadge icon={r.type === 'transfer' ? 'swap-horizontal' : 'repeat'} color={color} size={40} />
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" numberOfLines={1}>{r.title}</Txt>
            <Txt v="small" numberOfLines={1}>{freqText(r)} · {r.type === 'transfer' ? `${accName(r.accountId)} → ${accName(r.toAccountId)}` : `${catName(r.categoryId) ?? ''} · ${accName(r.accountId)}`}</Txt>
          </View>
          <Txt v="bodyStrong" color={color}>{formatRupiah(r.amount)}</Txt>
        </Row>
        <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <Pill text={r.isActive ? `Berikutnya ${formatDate(r.nextDate)}` : 'Selesai / nonaktif'} color={c.textMuted} bg={c.surfaceAlt} />
          <Pill text={r.autoPost ? 'Dicatat otomatis' : 'Konfirmasi manual'} color={r.autoPost ? c.accent : c.warning} bg={r.autoPost ? c.accentSoft : c.warningSoft} />
          {r.remind ? <Pill text="Pengingat" color={c.primary} bg={c.primarySoft} /> : null}
        </Row>
        {actions ? (
          <Row style={{ marginTop: space.md }}>
            <Button small title="Catat sekarang" icon="checkmark" onPress={() => post(r)} style={{ flex: 1 }} />
            <Button small title="Lewati" variant="secondary" onPress={() => skip(r)} style={{ flex: 1 }} />
          </Row>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen>
      <InfoNote icon="repeat">Jadwal berulang berbeda dari transaksi yang sudah tercatat. Jadwal “otomatis” dicatat saat aplikasi dibuka pada/ setelah tanggalnya — tidak pernah dobel. Jadwal “manual” menunggu konfirmasi Anda.</InfoNote>
      <Button title="Tambah transaksi berulang" icon="add" onPress={() => navigation.navigate('RecurringForm')} style={{ marginBottom: space.md }} />
      {!data.data ? <Loading /> : rules.length === 0 ? (
        <Card><EmptyState icon="repeat-outline" title="Belum ada transaksi berulang" message="Contoh: gaji, sewa, cicilan, langganan, atau tabungan rutin." /></Card>
      ) : (
        <>
          {due.length ? <SectionHeader title="Perlu dicatat" subtitle="Sudah jatuh tempo, menunggu konfirmasi" /> : null}
          {due.map((r) => <RuleCard key={r.id} r={r} actions />)}
          {upcoming.length ? <SectionHeader title="Terjadwal" /> : null}
          {upcoming.map((r) => <RuleCard key={r.id} r={r} />)}
          {inactive.length ? <SectionHeader title="Nonaktif" /> : null}
          {inactive.map((r) => <RuleCard key={r.id} r={r} />)}
        </>
      )}
    </Screen>
  );
}

export function RecurringFormScreen({ route, navigation }: RootScreen<'RecurringForm'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const id = route.params?.id;
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [interval, setIntervalN] = useState('1');
  const [startDate, setStartDate] = useState(todayJakarta());
  const [hasEnd, setHasEnd] = useState(false);
  const [endDate, setEndDate] = useState(todayJakarta());
  const [autoPost, setAutoPost] = useState(true);
  const [remind, setRemind] = useState(false);
  const [active, setActive] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [picker, setPicker] = useState<'cat' | 'acc' | 'to' | null>(null);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Ubah transaksi berulang' : 'Transaksi berulang baru' }), [navigation, id]);
  useEffect(() => {
    (async () => {
      const [a, k] = await Promise.all([repo.listAccounts(false), repo.listCategories()]);
      setAccounts(a); setCats(k);
      if (id) {
        const r = await repo.getRecurring(id);
        if (!r) return navigation.goBack();
        setType(r.type); setAmount(formatAmountTyping(String(r.amount))); setTitle(r.title); setCategoryId(r.categoryId);
        setAccountId(r.accountId); setToAccountId(r.toAccountId); setFrequency(r.frequency); setIntervalN(String(r.interval));
        setStartDate(r.startDate); setHasEnd(!!r.endDate); setEndDate(r.endDate ?? r.startDate); setAutoPost(r.autoPost); setRemind(r.remind); setActive(r.isActive);
      } else setAccountId(a[0]?.id ?? null);
    })();
  }, [id, repo, navigation]);

  const catOptions: SelectOption[] = useMemo(() => cats.filter((x) => x.kind === type && !x.parentId).flatMap((p) => [
    { value: p.id, label: p.name, icon: p.icon, color: p.color },
    ...cats.filter((s) => s.parentId === p.id).map((s) => ({ value: s.id, label: s.name, indent: true })),
  ]), [cats, type]);
  const preview = useMemo(() => upcomingOccurrences({ nextDate: startDate, endDate: hasEnd ? endDate : null, frequency, interval: Math.max(1, parseInt(interval) || 1), anchorDay: +startDate.slice(8) }, 3), [startDate, endDate, hasEnd, frequency, interval]);

  const save = async () => {
    const amt = parseRupiahInput(amount);
    if (!amt) return Alert.alert('Periksa kembali', 'Nominal harus lebih dari Rp0.');
    setSaving(true);
    try {
      await repo.saveRecurring({
        id, type, amount: amt, title, categoryId: type === 'transfer' ? null : categoryId, accountId: accountId ?? '', toAccountId: type === 'transfer' ? toAccountId : null,
        frequency, interval: Math.max(1, parseInt(interval) || 1), startDate, endDate: hasEnd ? endDate : null, autoPost, remind, isActive: active,
      });
      if (remind) {
        const ok = await requestNotificationPermission();
        if (!ok) Alert.alert('Notifikasi tidak diizinkan', 'Pengingat tidak dapat ditampilkan. Aktifkan notifikasi FinTrack di pengaturan Android.');
      }
      const created = await repo.materializeDue();
      await syncReminders(repo);
      notifyDataChanged();
      if (created > 0) Alert.alert('Tersimpan', `${created} transaksi yang jatuh tempo telah dicatat otomatis.`);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(e instanceof ValidationError ? 'Periksa kembali' : 'Gagal menyimpan', e?.message ?? String(e));
    } finally { setSaving(false); }
  };

  const remove = () => Alert.alert('Hapus transaksi berulang?', 'Jadwal dihapus. Transaksi yang sudah tercatat tetap ada.', [
    { text: 'Batal', style: 'cancel' },
    { text: 'Hapus', style: 'destructive', onPress: async () => { await repo.deleteRecurring(id!); await syncReminders(repo); notifyDataChanged(); navigation.goBack(); } },
  ]);

  const cat = cats.find((x) => x.id === categoryId);
  return (
    <Screen>
      <Segmented value={type} onChange={(t) => { setType(t); setCategoryId(null); }} options={[{ value: 'expense', label: 'Pengeluaran' }, { value: 'income', label: 'Pemasukan' }, { value: 'transfer', label: 'Transfer' }]} style={{ marginBottom: space.md }} />
      <Field label="Nama"><Input value={title} onChangeText={setTitle} placeholder="Contoh: Gaji, Sewa, Netflix, Tabungan rutin" maxLength={60} /></Field>
      <Field label="Nominal"><Input value={amount} onChangeText={(t) => setAmount(formatAmountTyping(t))} keyboardType="number-pad" placeholder="0" /></Field>
      {type !== 'transfer' ? (
        <Field label="Kategori"><SelectField value={cat?.name} placeholder="Pilih kategori" onPress={() => setPicker('cat')} icon={(cat?.icon ?? 'pricetag-outline') as any} iconColor={cat?.color} /></Field>
      ) : null}
      <Field label={type === 'transfer' ? 'Dari akun' : 'Akun'}><SelectField value={accounts.find((a) => a.id === accountId)?.name} placeholder="Pilih akun" onPress={() => setPicker('acc')} icon="wallet-outline" /></Field>
      {type === 'transfer' ? (
        <Field label="Ke akun"><SelectField value={accounts.find((a) => a.id === toAccountId)?.name} placeholder="Pilih akun tujuan" onPress={() => setPicker('to')} icon="arrow-forward-circle-outline" /></Field>
      ) : null}
      <Field label="Frekuensi">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <Chip key={f} label={FREQUENCY_LABEL[f]} active={frequency === f} onPress={() => setFrequency(f)} />)}
        </View>
      </Field>
      <Field label="Ulangi setiap" hint={`Contoh: 2 = setiap 2 ${{ daily: 'hari', weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' }[frequency]}`}>
        <Input value={interval} onChangeText={(t) => setIntervalN(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" />
      </Field>
      <Field label="Tanggal mulai" hint={frequency === 'monthly' && +startDate.slice(8) > 28 ? 'Pada bulan yang lebih pendek, jadwal jatuh di tanggal terakhir bulan itu.' : undefined}>
        <DateField value={startDate} onChange={setStartDate} />
      </Field>
      <SwitchRow label="Ada tanggal berakhir" value={hasEnd} onChange={setHasEnd} />
      {hasEnd ? <Field label="Berakhir pada"><DateField value={endDate} onChange={setEndDate} minimumDate={startDate} /></Field> : null}
      <Txt v="small" style={{ marginBottom: space.sm }}>Jadwal berikutnya: {preview.map((d) => formatDate(d)).join(', ') || '—'}</Txt>
      <Card>
        <SwitchRow label="Catat otomatis" hint="Jika mati, jadwal muncul di “Perlu dicatat” dan menunggu konfirmasi Anda" value={autoPost} onChange={setAutoPost} />
        <SwitchRow label="Pengingat notifikasi" hint="Notifikasi lokal pukul 08.00 WIB pada tanggal jadwal" value={remind} onChange={setRemind} />
        {id ? <SwitchRow label="Aktif" value={active} onChange={setActive} /> : null}
      </Card>
      {autoPost && startDate < todayJakarta() && !id ? (
        <InfoNote icon="alert-circle-outline">Tanggal mulai di masa lalu: semua jadwal sejak {formatDate(startDate)} hingga hari ini akan langsung dicatat.</InfoNote>
      ) : null}
      <Button title="Simpan" icon="checkmark" onPress={save} loading={saving} />
      {id ? <Button title="Hapus" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} /> : null}

      <SelectSheet visible={picker === 'cat'} onClose={() => setPicker(null)} title="Pilih kategori" value={categoryId} options={catOptions} onSelect={setCategoryId} />
      <SelectSheet visible={picker === 'acc'} onClose={() => setPicker(null)} title="Pilih akun" value={accountId} options={accounts.map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline', color: a.color }))} onSelect={setAccountId} />
      <SelectSheet visible={picker === 'to'} onClose={() => setPicker(null)} title="Akun tujuan" value={toAccountId} options={accounts.filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline', color: a.color }))} onSelect={setToAccountId} />
    </Screen>
  );
}
