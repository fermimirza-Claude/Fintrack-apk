import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp, useData } from '../state/AppContext';
import { Button, Card, Chip, EmptyState, Field, IconBadge, InfoNote, Input, Loading, Row, Screen, SectionHeader, SwitchRow, Txt } from '../ui/components';
import { ValidationError } from '../db/repo';
import { ACCOUNT_COLORS } from '../db/seed';
import { formatAmountTyping, formatRupiah, parseRupiahInput } from '../domain/money';
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL, type AccountType } from '../domain/types';
import type { RootScreen } from '../navigation/types';
import { space } from '../ui/theme';

export function AccountsScreen({ navigation }: RootScreen<'Accounts'>) {
  const { colors: c } = useApp();
  const data = useData((r) => r.accountsWithBalance());
  const list = data.data ?? [];
  const active = list.filter((a) => a.isActive);
  const inactive = list.filter((a) => !a.isActive);
  const total = list.reduce((s, a) => s + a.balance, 0);
  return (
    <Screen>
      {!data.data ? <Loading /> : (
        <>
          <Card style={{ backgroundColor: c.hero }}>
            <Txt v="small" color={c.heroMuted}>Total saldo semua akun</Txt>
            <Txt v="h1" color={c.heroText}>{formatRupiah(total)}</Txt>
            <Txt v="tiny" color={c.heroMuted}>Saldo = saldo awal + pemasukan − pengeluaran ± transfer. Dihitung otomatis dari transaksi.</Txt>
          </Card>
          <Button title="Tambah akun" icon="add" onPress={() => navigation.navigate('AccountForm')} style={{ marginBottom: space.md }} />
          {list.length === 0 ? <EmptyState icon="wallet-outline" title="Belum ada akun" /> : null}
          {active.map((a) => <AccountCard key={a.id} a={a} onPress={() => navigation.navigate('AccountForm', { id: a.id })} onHistory={() => navigation.navigate('TxFiltered', { title: a.name, accountId: a.id })} />)}
          {inactive.length ? <SectionHeader title="Nonaktif" subtitle="Tidak muncul saat mencatat transaksi baru" /> : null}
          {inactive.map((a) => <AccountCard key={a.id} a={a} onPress={() => navigation.navigate('AccountForm', { id: a.id })} onHistory={() => navigation.navigate('TxFiltered', { title: a.name, accountId: a.id })} />)}
        </>
      )}
    </Screen>
  );
}

function AccountCard({ a, onPress, onHistory }: { a: { name: string; type: AccountType; balance: number; color: string; isActive: boolean }; onPress: () => void; onHistory: () => void }) {
  const { colors: c } = useApp();
  return (
    <Card onPress={onPress} style={{ opacity: a.isActive ? 1 : 0.6 }}>
      <Row>
        <IconBadge icon={ACCOUNT_TYPE_ICON[a.type]} color={a.color} size={42} />
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong" numberOfLines={1}>{a.name}</Txt>
          <Txt v="small">{ACCOUNT_TYPE_LABEL[a.type]}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="bodyStrong" color={a.balance < 0 ? c.expense : c.text}>{formatRupiah(a.balance)}</Txt>
          <Pressable onPress={onHistory} hitSlop={8}><Txt v="tiny" color={c.accent}>Riwayat</Txt></Pressable>
        </View>
      </Row>
      {a.type === 'credit_card' && a.balance < 0 ? <Txt v="tiny" style={{ marginTop: 6 }}>Tagihan terutang {formatRupiah(-a.balance)}</Txt> : null}
    </Card>
  );
}

export function AccountFormScreen({ route, navigation }: RootScreen<'AccountForm'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const id = route.params?.id;
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [opening, setOpening] = useState('');
  const [negative, setNegative] = useState(false);
  const [color, setColor] = useState(ACCOUNT_COLORS[1]);
  const [active, setActive] = useState(true);
  const [txCount, setTxCount] = useState(0);
  const [loaded, setLoaded] = useState(!id);
  const [err, setErr] = useState<string | null>(null);

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Ubah akun' : 'Akun baru' }), [navigation, id]);
  useEffect(() => {
    if (!id) return;
    (async () => {
      const a = (await repo.listAccounts()).find((x) => x.id === id);
      if (!a) return navigation.goBack();
      setName(a.name); setType(a.type); setOpening(formatAmountTyping(String(Math.abs(a.openingBalance)))); setNegative(a.openingBalance < 0);
      setColor(a.color); setActive(a.isActive); setTxCount(await repo.accountTxCount(id)); setLoaded(true);
    })();
  }, [id, repo, navigation]);

  const save = async () => {
    const amt = opening.trim() ? parseRupiahInput(opening) : 0;
    if (amt === null) return setErr('Saldo awal tidak valid.');
    const openingBalance = negative ? -amt : amt;
    try {
      if (id) await repo.updateAccount(id, { name, type, openingBalance, color, isActive: active });
      else await repo.createAccount({ name, type, openingBalance, color });
      notifyDataChanged();
      navigation.goBack();
    } catch (e: any) {
      setErr(e instanceof ValidationError ? e.message : String(e?.message ?? e));
    }
  };

  const remove = () => {
    if (txCount > 0) {
      Alert.alert('Akun memiliki transaksi', `Akun ini dipakai oleh ${txCount} transaksi sehingga tidak dapat dihapus tanpa merusak riwayat. Nonaktifkan akun agar tidak muncul lagi saat mencatat.`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Nonaktifkan', onPress: async () => { await repo.updateAccount(id!, { isActive: false }); notifyDataChanged(); navigation.goBack(); } },
      ]);
      return;
    }
    Alert.alert('Hapus akun?', 'Akun ini belum memiliki transaksi dan akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        try { await repo.deleteAccount(id!); notifyDataChanged(); navigation.goBack(); } catch (e: any) { Alert.alert('Tidak dapat menghapus', e.message); }
      } },
    ]);
  };

  if (!loaded) return <Loading />;
  return (
    <Screen>
      <Field label="Nama akun" error={err && !name.trim() ? err : null}>
        <Input value={name} onChangeText={(t) => { setName(t); setErr(null); }} placeholder="Contoh: BCA, GoPay, Dompet" maxLength={40} />
      </Field>
      <Field label="Jenis akun">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
            <Chip key={t} label={ACCOUNT_TYPE_LABEL[t]} icon={ACCOUNT_TYPE_ICON[t] as any} active={type === t} onPress={() => { setType(t); if (t === 'credit_card') setNegative(true); }} />
          ))}
        </View>
      </Field>
      {type === 'credit_card' ? (
        <InfoNote>Kartu kredit dicatat sebagai saldo negatif (utang). Belanja dengan kartu = pengeluaran. Pembayaran tagihan = transfer dari rekening ke kartu, sehingga tidak dihitung ganda.</InfoNote>
      ) : null}
      <Field label={type === 'credit_card' ? 'Tagihan awal (saldo awal)' : 'Saldo awal'} error={err && name.trim() ? err : null}
        hint={id && txCount ? 'Mengubah saldo awal akan menggeser saldo berjalan; transaksi tidak berubah.' : 'Saldo saat akun mulai dicatat di FinTrack.'}>
        <Input value={opening} onChangeText={(t) => { setOpening(formatAmountTyping(t)); setErr(null); }} keyboardType="number-pad" placeholder="0" />
      </Field>
      <SwitchRow label="Saldo awal negatif (utang)" value={negative} onChange={setNegative} />
      <Field label="Warna">
        <Row style={{ flexWrap: 'wrap' }}>
          {ACCOUNT_COLORS.map((col) => (
            <Pressable key={col} onPress={() => setColor(col)} accessibilityLabel={`Warna ${col}`}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: col, alignItems: 'center', justifyContent: 'center', borderWidth: color === col ? 3 : 0, borderColor: c.text }}>
              {color === col ? <Ionicons name="checkmark" size={18} color="#FFF" /> : null}
            </Pressable>
          ))}
        </Row>
      </Field>
      {id ? <SwitchRow label="Akun aktif" hint="Akun nonaktif tetap dihitung dalam riwayat dan saldo total" value={active} onChange={setActive} /> : null}
      <Button title="Simpan" icon="checkmark" onPress={save} style={{ marginTop: space.md }} />
      {id ? <Button title={txCount ? 'Nonaktifkan / hapus akun' : 'Hapus akun'} variant="ghost" onPress={remove} style={{ marginTop: space.sm }} /> : null}
    </Screen>
  );
}
