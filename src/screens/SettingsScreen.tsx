import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp, useData } from '../state/AppContext';
import { Button, Card, Field, InfoNote, Input, ListItem, Screen, SectionHeader, Segmented, Sheet, Txt } from '../ui/components';
import { loadDemoData } from '../services/demo';
import { syncReminders } from '../services/notifications';
import { space } from '../ui/theme';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { repo, colors: c, settings, updateSettings, notifyDataChanged } = useApp();
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const info = useData(async (r) => ({ hasDemo: await r.hasDemoData(), count: await r.transactionCount(), accounts: (await r.listAccounts()).length, recurring: (await r.listRecurring()).length }));

  const toggleDemo = () => {
    if (info.data?.hasDemo) {
      Alert.alert('Hapus data contoh?', 'Semua transaksi, anggaran, akun, dan transaksi berulang yang ditandai sebagai contoh akan dihapus. Data asli Anda tetap aman.', [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus data contoh', style: 'destructive', onPress: async () => { await repo.clearDemoData(); notifyDataChanged(); } },
      ]);
    } else {
      Alert.alert('Isi data contoh?', 'Data contoh 3 bulan terakhir akan ditambahkan dengan tanda khusus agar dapat dihapus kapan saja.', [
        { text: 'Batal', style: 'cancel' },
        { text: 'Isi', onPress: async () => { setBusy(true); try { await loadDemoData(repo); notifyDataChanged(); } finally { setBusy(false); } } },
      ]);
    }
  };

  const startWipe = () =>
    Alert.alert('Hapus seluruh data?', 'Semua transaksi, akun, kategori, anggaran, dan transaksi berulang akan dihapus permanen dari perangkat ini. Sebaiknya buat backup terlebih dahulu.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Buat backup dulu', onPress: () => nav.navigate('Backup') },
      { text: 'Lanjutkan', style: 'destructive', onPress: () => { setConfirmText(''); setWipeOpen(true); } },
    ]);

  const doWipe = async () => {
    setBusy(true);
    try {
      await repo.wipeAll(false);
      await syncReminders(repo);
      setWipeOpen(false);
      notifyDataChanged();
      Alert.alert('Selesai', 'Seluruh data telah dihapus. Kategori bawaan dan akun "Dompet" dibuat ulang.');
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Card>
        <ListItem icon="person-outline" title={settings.profileName || 'Profil pengguna'} subtitle="Nama tampilan & informasi data" onPress={() => nav.navigate('Profile')} last />
      </Card>

      <SectionHeader title="Keuangan" />
      <Card>
        <ListItem icon="wallet-outline" title="Akun" subtitle={info.data ? `${info.data.accounts} akun · tunai, bank, e-wallet, kartu kredit` : undefined} onPress={() => nav.navigate('Accounts')} />
        <ListItem icon="pricetags-outline" title="Kategori" subtitle="Kategori & subkategori pemasukan/pengeluaran" onPress={() => nav.navigate('Categories')} />
        <ListItem icon="repeat-outline" title="Transaksi berulang & pengingat" subtitle={info.data ? `${info.data.recurring} jadwal` : undefined} onPress={() => nav.navigate('Recurring')} last />
      </Card>

      <SectionHeader title="Tampilan" />
      <Card>
        <Field label="Tema">
          <Segmented value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'system', label: 'Sistem' }, { value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} />
        </Field>
        <Field label="Format tanggal">
          <Segmented value={settings.dateFormat} onChange={(v) => updateSettings({ dateFormat: v })} options={[{ value: 'short', label: '23 Okt 2026' }, { value: 'numeric', label: '23/10/2026' }]} />
        </Field>
        <ListItem icon="cash-outline" title="Mata uang utama" subtitle="Rupiah (IDR) · format Rp1.250.000" right={<Txt v="smallStrong">IDR</Txt>} last />
      </Card>

      <SectionHeader title="Keamanan" />
      <Card>
        <ListItem icon="lock-closed-outline" title="PIN & biometrik" subtitle={settings.lockEnabled ? `Aktif${settings.biometricEnabled ? ' · sidik jari/wajah' : ''}` : 'Tidak aktif'} onPress={() => nav.navigate('Security')} last />
      </Card>

      <SectionHeader title="Data" />
      <Card>
        <ListItem icon="cloud-download-outline" title="Backup, restore, ekspor & impor" subtitle="JSON, CSV, PDF" onPress={() => nav.navigate('Backup')} />
        <ListItem icon="flask-outline" title={info.data?.hasDemo ? 'Hapus data contoh' : 'Isi data contoh'} subtitle={info.data?.hasDemo ? 'Data contoh sedang aktif' : 'Untuk mencoba fitur tanpa data asli'} onPress={busy ? undefined : toggleDemo} />
        <ListItem icon="trash-outline" title="Hapus seluruh data" subtitle="Konfirmasi berlapis" danger onPress={startWipe} last />
      </Card>

      <InfoNote icon="phone-portrait-outline">Semua data FinTrack disimpan secara lokal di perangkat ini (SQLite) dan tidak disinkronkan ke server atau perangkat lain. Gunakan Backup untuk memindahkan data atau mengamankannya.</InfoNote>
      <Txt v="tiny" center>FinTrack 1.0.0</Txt>

      <Sheet visible={wipeOpen} onClose={() => setWipeOpen(false)} title="Konfirmasi terakhir">
        <Txt v="body" style={{ marginBottom: space.md }}>Ketik <Txt v="bodyStrong" color={c.expense}>HAPUS</Txt> untuk menghapus {info.data?.count ?? 0} transaksi dan seluruh data lain secara permanen.</Txt>
        <Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="HAPUS" />
        <View style={{ height: space.md }} />
        <Button title="Hapus permanen" variant="danger" disabled={confirmText.trim() !== 'HAPUS'} loading={busy} onPress={doWipe} />
      </Sheet>
    </Screen>
  );
}
