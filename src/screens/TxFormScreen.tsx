import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext';
import {
  Button, Chip, Field, IconButton, InfoNote, Input, Row, Segmented, SelectField, SelectSheet, Txt, type SelectOption,
} from '../ui/components';
import { DateField, TimeField } from '../ui/DateField';
import { ValidationError } from '../db/repo';
import { formatAmountTyping, formatRupiah, parseRupiahInput } from '../domain/money';
import { nowTimeJakarta, todayJakarta } from '../domain/dates';
import type { Account, Category, PaymentMethod, TxType } from '../domain/types';
import { PAYMENT_METHOD_LABEL } from '../domain/types';
import { deleteReceipt, pickReceipt } from '../services/files';
import type { RootScreen } from '../navigation/types';
import { font, radius, space } from '../ui/theme';

export default function TxFormScreen({ route, navigation }: RootScreen<'TxForm'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const insets = useSafeAreaInsets();
  const editId = route.params?.id;
  const dupId = route.params?.duplicateOf;
  const [loaded, setLoaded] = useState(!editId && !dupId);
  const [type, setType] = useState<TxType>(route.params?.type ?? 'expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(todayJakarta());
  const [time, setTime] = useState(nowTimeJakarta());
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [linkedTo, setLinkedTo] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [picker, setPicker] = useState<'category' | 'account' | 'to' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editId ? 'Detail transaksi' : dupId ? 'Duplikat transaksi' : 'Transaksi baru' });
  }, [navigation, editId, dupId]);

  useEffect(() => {
    (async () => {
      const [acc, cats] = await Promise.all([repo.listAccounts(), repo.listCategories(undefined, true)]);
      setAccounts(acc);
      setCategories(cats);
      const srcId = editId ?? dupId;
      if (srcId) {
        const t = await repo.getTransaction(srcId);
        if (!t) { Alert.alert('Transaksi tidak ditemukan'); navigation.goBack(); return; }
        setType(t.type); setAmount(formatAmountTyping(String(t.amount))); setTitle(t.title); setCategoryId(t.categoryId);
        setAccountId(t.accountId); setToAccountId(t.toAccountId); setFee(t.fee ? formatAmountTyping(String(t.fee)) : '');
        setMethod(t.paymentMethod); setNote(t.note); setTags(t.tags.join(' '));
        if (editId) { setDate(t.date); setTime(t.time); setReceipt(t.receiptUri); setLinkedTo(t.linkedTxId); setIsRecurring(!!t.recurringId); }
      } else {
        const lastAcc = await repo.getSetting('last_account_id');
        const active = acc.filter((a) => a.isActive);
        setAccountId(active.find((a) => a.id === lastAcc)?.id ?? active[0]?.id ?? null);
      }
      setLoaded(true);
    })();
  }, [repo, editId, dupId, navigation]);

  const activeAccounts = accounts.filter((a) => a.isActive || a.id === accountId || a.id === toAccountId);
  const catOptions: SelectOption[] = useMemo(() => {
    if (type === 'transfer') return [];
    const visible = categories.filter((x) => x.kind === type && (!x.isArchived || x.id === categoryId));
    return visible.filter((x) => !x.parentId).flatMap((p) => [
      { value: p.id, label: p.name, icon: p.icon, color: p.color },
      ...visible.filter((s) => s.parentId === p.id).map((s) => ({ value: s.id, label: s.name, indent: true })),
    ]);
  }, [categories, type, categoryId]);
  const cat = categories.find((x) => x.id === categoryId);
  const parentCat = cat?.parentId ? categories.find((x) => x.id === cat.parentId) : null;
  const acc = accounts.find((a) => a.id === accountId);
  const toAcc = accounts.find((a) => a.id === toAccountId);

  const changeType = (t: TxType) => {
    setType(t);
    if (cat && cat.kind !== t) setCategoryId(null);
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const amt = parseRupiahInput(amount);
    if (!amt || amt <= 0) e.amount = 'Masukkan nominal lebih dari Rp0.';
    if (!accountId) e.account = 'Pilih akun.';
    if (type === 'transfer') {
      if (!toAccountId) e.to = 'Pilih akun tujuan.';
      else if (toAccountId === accountId) e.to = 'Akun tujuan harus berbeda dari akun sumber.';
    } else if (!categoryId) e.category = 'Pilih kategori.';
    if (date > todayJakarta()) e.date = 'Tanggal tidak boleh di masa depan. Gunakan transaksi berulang untuk jadwal.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const input = {
        type, amount: parseRupiahInput(amount)!, title, categoryId: type === 'transfer' ? null : categoryId, accountId: accountId!,
        toAccountId: type === 'transfer' ? toAccountId : null, date, time, paymentMethod: type === 'transfer' ? null : method,
        note, tags: tags.split(/[\s,#]+/).filter(Boolean), receiptUri: receipt,
        fee: type === 'transfer' ? parseRupiahInput(fee) ?? 0 : undefined,
      };
      if (editId) await repo.updateTransaction(editId, input);
      else await repo.createTransaction(input);
      await repo.setSetting('last_account_id', accountId!);
      notifyDataChanged();
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(err instanceof ValidationError ? 'Periksa kembali' : 'Gagal menyimpan', err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert('Hapus transaksi?', type === 'transfer' && parseRupiahInput(fee) ? 'Biaya transfer yang terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.' : 'Tindakan ini tidak dapat dibatalkan.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        await repo.deleteTransaction(editId!);
        await deleteReceipt(receipt);
        notifyDataChanged();
        navigation.goBack();
      } },
    ]);
  };

  const addReceipt = () =>
    Alert.alert('Lampirkan struk', undefined, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Galeri', onPress: () => pickReceipt('library').then((u) => u && setReceipt(u)).catch((e) => Alert.alert('Gagal', e.message)) },
      { text: 'Kamera', onPress: () => pickReceipt('camera').then((u) => u && setReceipt(u)).catch((e) => Alert.alert('Gagal', e.message)) },
    ]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (linkedTo) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg }}>
        <InfoNote>Ini adalah biaya transfer ({formatRupiah(parseRupiahInput(amount) ?? 0)}) yang tercatat sebagai pengeluaran terpisah. Ubah atau hapus melalui transaksi transfernya.</InfoNote>
        <Button title="Buka transaksi transfer" icon="swap-horizontal" onPress={() => navigation.replace('TxForm', { id: linkedTo })} />
      </View>
    );
  }

  const typeColor = type === 'income' ? c.income : type === 'expense' ? c.expense : c.accent;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Segmented value={type} onChange={changeType} options={[{ value: 'expense', label: 'Pengeluaran' }, { value: 'income', label: 'Pemasukan' }, { value: 'transfer', label: 'Transfer' }]} />
        {isRecurring ? <View style={{ marginTop: space.md }}><InfoNote icon="repeat">Transaksi ini dicatat otomatis dari transaksi berulang.</InfoNote></View> : null}

        <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <Txt v="small">Nominal</Txt>
          <Row gap={4} style={{ marginTop: 4 }}>
            <Txt v="h2" color={typeColor}>Rp</Txt>
            <TextInput value={amount} onChangeText={(t) => { setAmount(formatAmountTyping(t)); if (errors.amount) setErrors((e) => ({ ...e, amount: '' })); }}
              keyboardType="number-pad" placeholder="0" placeholderTextColor={c.textFaint} autoFocus={!editId} maxLength={19}
              accessibilityLabel="Nominal" style={{ fontSize: 38, fontWeight: '700', color: typeColor, minWidth: 80, textAlign: 'center', padding: 0 }} />
          </Row>
          {errors.amount ? <Txt v="small" color={c.expense}>{errors.amount}</Txt> : null}
        </View>

        <Field label="Nama / deskripsi">
          <Input value={title} onChangeText={setTitle} placeholder={type === 'transfer' ? 'Contoh: Isi saldo e-wallet' : type === 'income' ? 'Contoh: Gaji Oktober' : 'Contoh: Makan siang'} maxLength={80} />
        </Field>

        {type !== 'transfer' ? (
          <Field label="Kategori" error={errors.category}>
            <SelectField value={cat ? (parentCat ? `${parentCat.name} › ${cat.name}` : cat.name) : null} placeholder="Pilih kategori" onPress={() => setPicker('category')}
              icon={(cat?.icon ?? 'pricetag-outline') as any} iconColor={cat?.color} invalid={!!errors.category} />
          </Field>
        ) : null}

        <Field label={type === 'transfer' ? 'Dari akun' : 'Akun'} error={errors.account}>
          <SelectField value={acc?.name} placeholder="Pilih akun" onPress={() => setPicker('account')} icon="wallet-outline" iconColor={acc?.color} invalid={!!errors.account} />
        </Field>

        {type === 'transfer' ? (
          <>
            <Field label="Ke akun" error={errors.to}>
              <SelectField value={toAcc?.name} placeholder="Pilih akun tujuan" onPress={() => setPicker('to')} icon="arrow-forward-circle-outline" iconColor={toAcc?.color} invalid={!!errors.to} />
            </Field>
            <Field label="Biaya transfer (opsional)" hint="Dicatat sebagai pengeluaran terpisah dari akun sumber. Transfer sendiri tidak dihitung pemasukan/pengeluaran.">
              <Input value={fee} onChangeText={(t) => setFee(formatAmountTyping(t))} keyboardType="number-pad" placeholder="Rp0" />
            </Field>
          </>
        ) : null}

        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>
            <Field label="Tanggal" error={errors.date}><DateField value={date} onChange={setDate} maximumDate={todayJakarta()} /></Field>
          </View>
          <View style={{ flex: 2 }}>
            <Field label="Waktu"><TimeField value={time} onChange={setTime} /></Field>
          </View>
        </Row>

        {type !== 'transfer' ? (
          <Field label="Metode pembayaran (opsional)">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <Chip key={m} label={PAYMENT_METHOD_LABEL[m]} active={method === m} onPress={() => setMethod(method === m ? null : m)} />
              ))}
            </View>
          </Field>
        ) : null}

        <Field label="Catatan (opsional)">
          <Input value={note} onChangeText={setNote} placeholder="Tambahkan catatan" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} maxLength={500} />
        </Field>
        <Field label="Tag (opsional)" hint="Pisahkan dengan spasi, contoh: kantor liburan">
          <Input value={tags} onChangeText={setTags} placeholder="kantor liburan" autoCapitalize="none" />
        </Field>

        <Field label="Foto struk (opsional)">
          {receipt ? (
            <View>
              <Image source={{ uri: receipt }} style={{ width: '100%', height: 200, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} resizeMode="cover" />
              <Row style={{ marginTop: 8 }}>
                <Button small variant="secondary" title="Ganti" icon="camera-outline" onPress={addReceipt} />
                <Button small variant="secondary" title="Hapus foto" icon="trash-outline" onPress={() => setReceipt(null)} />
              </Row>
            </View>
          ) : (
            <Pressable onPress={addReceipt} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: radius.md, padding: space.lg, alignItems: 'center' }}>
              <Ionicons name="camera-outline" size={24} color={c.textMuted} />
              <Txt v="small" style={{ marginTop: 4 }}>Ambil foto atau pilih dari galeri</Txt>
            </Pressable>
          )}
        </Field>

        {editId ? (
          <Row style={{ marginTop: space.md }}>
            <Button title="Duplikat" icon="copy-outline" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.replace('TxForm', { duplicateOf: editId })} />
            <Button title="Hapus" icon="trash-outline" variant="secondary" style={{ flex: 1 }} onPress={remove} />
          </Row>
        ) : null}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.lg + insets.bottom, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button title={editId ? 'Simpan perubahan' : 'Simpan transaksi'} onPress={save} loading={saving} icon="checkmark" />
      </View>

      <SelectSheet visible={picker === 'category'} onClose={() => setPicker(null)} title="Pilih kategori" value={categoryId}
        options={catOptions} onSelect={(v) => { setCategoryId(v); setErrors((e) => ({ ...e, category: '' })); }} emptyText="Belum ada kategori. Tambahkan di Pengaturan → Kategori." />
      <SelectSheet visible={picker === 'account'} onClose={() => setPicker(null)} title="Pilih akun" value={accountId}
        options={activeAccounts.map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline', color: a.color }))} onSelect={(v) => { setAccountId(v); setErrors((e) => ({ ...e, account: '' })); }} />
      <SelectSheet visible={picker === 'to'} onClose={() => setPicker(null)} title="Akun tujuan" value={toAccountId}
        options={activeAccounts.filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline', color: a.color }))}
        onSelect={(v) => { setToAccountId(v); setErrors((e) => ({ ...e, to: '' })); }} emptyText="Tambahkan akun kedua di Pengaturan → Akun untuk melakukan transfer." />
    </View>
  );
}
