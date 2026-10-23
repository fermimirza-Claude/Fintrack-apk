import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext';
import { Button, Card, Field, InfoNote, Input, ListItem, Screen, SwitchRow, Txt } from '../ui/components';
import { clearPin, setPin, verifyPin } from '../services/security';
import { authenticateBiometric, biometricAvailable, randomSalt, sha256 } from '../services/platform';
import type { Repo } from '../db/repo';
import type { Palette } from '../ui/theme';
import type { RootScreen } from '../navigation/types';
import { space } from '../ui/theme';

export function PinPad({ title, subtitle, onComplete, error, length = 6, minLength = 4, colors: c, onBiometric }: {
  title: string; subtitle?: string; onComplete: (pin: string) => void; error?: string | null; length?: number; minLength?: number;
  colors: Palette; onBiometric?: () => void;
}) {
  const [pin, setPinState] = useState('');
  useEffect(() => { if (error) setPinState(''); }, [error]);
  const press = (d: string) => {
    if (pin.length >= length) return;
    const next = pin + d;
    setPinState(next);
    if (next.length === length) { onComplete(next); setPinState(''); }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt v="h2" center>{title}</Txt>
      {subtitle ? <Txt v="small" center style={{ marginTop: 6 }}>{subtitle}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 14, marginVertical: space.xl }}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < pin.length ? c.accent : 'transparent', borderWidth: 2, borderColor: i < pin.length ? c.accent : c.border }} />
        ))}
      </View>
      <View style={{ minHeight: 22 }}>{error ? <Txt v="small" color={c.expense} center>{error}</Txt> : null}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 270, marginTop: space.md }}>
        {keys.map((k) => (
          <View key={k} style={{ width: 90, height: 74, alignItems: 'center', justifyContent: 'center' }}>
            {k === 'bio' ? (pin.length >= minLength && pin.length < length ? (
              <Pressable onPress={() => { onComplete(pin); setPinState(''); }} accessibilityLabel="OK" style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="bodyStrong" color={c.accent}>OK</Txt>
              </Pressable>
            ) : onBiometric ? (
              <Pressable onPress={onBiometric} accessibilityLabel="Biometrik" style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="finger-print" size={30} color={c.accent} />
              </Pressable>
            ) : null) : k === 'del' ? (
              <Pressable onPress={() => setPinState(pin.slice(0, -1))} accessibilityLabel="Hapus" style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="backspace-outline" size={26} color={c.text} />
              </Pressable>
            ) : (
              <Pressable onPress={() => press(k)} accessibilityLabel={k}
                style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surfaceAlt : c.surface, borderWidth: 1, borderColor: c.border })}>
                <Txt v="h2">{k}</Txt>
              </Pressable>
            )}
          </View>
        ))}
      </View>
      {minLength < length ? <Txt v="tiny" style={{ marginTop: 6 }}>PIN 4–6 digit. Tekan OK jika PIN Anda kurang dari 6 digit.</Txt> : null}
    </View>
  );
}

export function LockScreen({ repo, colors, biometric, onUnlock }: { repo: Repo; colors: Palette; biometric: boolean; onUnlock: () => void }) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const tryBio = async () => { if (await authenticateBiometric()) onUnlock(); };
  useEffect(() => { if (biometric) tryBio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const submit = async (pin: string) => {
    const r = await verifyPin(repo, pin, sha256);
    if (r.ok) onUnlock();
    else if (r.lockedSeconds) setError(`Terlalu banyak percobaan. Coba lagi dalam ${r.lockedSeconds} detik.`);
    else setError(`PIN salah. Sisa percobaan: ${r.attemptsLeft}.`);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 60, alignItems: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg }}>
        <Ionicons name="lock-closed" size={30} color="#5EE6E0" />
      </View>
      <PinPad title="Masukkan PIN" subtitle="FinTrack terkunci" onComplete={submit} error={error} colors={colors} onBiometric={biometric ? tryBio : undefined} />
    </View>
  );
}

type Step = { kind: 'verify'; then: 'change' | 'disable' } | { kind: 'new' } | { kind: 'confirm'; first: string } | null;

export function SecurityScreen({ navigation }: RootScreen<'Security'>) {
  const { repo, colors: c, settings, updateSettings } = useApp();
  const [step, setStep] = useState<Step>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { biometricAvailable().then(setBioOk); }, []);

  const onPin = async (pin: string) => {
    if (!step) return;
    if (step.kind === 'verify') {
      const r = await verifyPin(repo, pin, sha256);
      if (!r.ok) return setError(r.lockedSeconds ? `Coba lagi dalam ${r.lockedSeconds} detik.` : `PIN salah. Sisa ${r.attemptsLeft} percobaan.`);
      setError(null);
      if (step.then === 'disable') {
        await clearPin(repo);
        await updateSettings({ lockEnabled: false, biometricEnabled: false });
        setStep(null);
        Alert.alert('Kunci dimatikan', 'FinTrack tidak lagi meminta PIN.');
      } else setStep({ kind: 'new' });
    } else if (step.kind === 'new') {
      setError(null);
      setStep({ kind: 'confirm', first: pin });
    } else if (step.kind === 'confirm') {
      if (pin !== step.first) { setError('PIN tidak sama. Ulangi dari awal.'); setStep({ kind: 'new' }); return; }
      await setPin(repo, pin, sha256, randomSalt);
      await updateSettings({ lockEnabled: true });
      setStep(null);
      setError(null);
      Alert.alert('PIN tersimpan', 'FinTrack akan meminta PIN setiap kali dibuka.');
    }
  };

  if (step) {
    const title = step.kind === 'verify' ? 'Masukkan PIN saat ini' : step.kind === 'new' ? 'Buat PIN baru' : 'Ulangi PIN baru';
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 40 }}>
        <PinPad key={step.kind} title={title} subtitle={step.kind === 'verify' ? undefined : '4–6 digit angka'} onComplete={onPin} error={error} colors={c} />
        <Button title="Batal" variant="ghost" onPress={() => { setStep(null); setError(null); }} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  return (
    <Screen>
      <InfoNote icon="shield-checkmark-outline">PIN disimpan sebagai hash bergaram (SHA-256 berulang), bukan teks biasa. Setelah 5 kali salah, PIN terkunci 30 detik. Jika lupa PIN, data tidak dapat dibuka tanpa menghapus data aplikasi — simpan backup secara rutin.</InfoNote>
      <Card>
        {settings.lockEnabled ? (
          <>
            <ListItem icon="key-outline" title="Ubah PIN" onPress={() => setStep({ kind: 'verify', then: 'change' })} />
            <SwitchRow label="Buka dengan biometrik" hint={bioOk ? 'Sidik jari / wajah yang terdaftar di perangkat' : 'Biometrik belum tersedia/terdaftar di perangkat ini'}
              value={settings.biometricEnabled} disabled={!bioOk}
              onChange={async (v) => {
                if (v && !(await authenticateBiometric())) return;
                await updateSettings({ biometricEnabled: v });
              }} />
            <ListItem icon="lock-open-outline" title="Matikan kunci aplikasi" danger onPress={() => setStep({ kind: 'verify', then: 'disable' })} last />
          </>
        ) : (
          <>
            <Txt v="body" style={{ marginBottom: space.md }}>Kunci aplikasi belum aktif.</Txt>
            <Button title="Buat PIN" icon="lock-closed-outline" onPress={() => setStep({ kind: 'new' })} />
          </>
        )}
      </Card>
    </Screen>
  );
}

export function ProfileScreen({ navigation }: RootScreen<'Profile'>) {
  const { colors: c, settings, updateSettings, repo } = useApp();
  const [name, setName] = useState(settings.profileName);
  const [stats, setStats] = useState<{ tx: number; first: string | null; backup: string | null } | null>(null);
  useEffect(() => {
    (async () => setStats({ tx: await repo.transactionCount(), first: await repo.firstTransactionDate(), backup: await repo.getSetting('last_backup_at') }))();
  }, [repo]);
  return (
    <Screen>
      <Field label="Nama tampilan" hint="Dipakai untuk sapaan di dashboard">
        <Input value={name} onChangeText={setName} placeholder="Nama Anda" maxLength={30} />
      </Field>
      <Button title="Simpan" icon="checkmark" onPress={async () => { await updateSettings({ profileName: name.trim() }); navigation.goBack(); }} />
      <Card style={{ marginTop: space.lg }}>
        <Txt v="h3">Penyimpanan data</Txt>
        <Txt v="small" style={{ marginTop: 6 }}>Seluruh data disimpan secara lokal di perangkat ini menggunakan database SQLite. Tidak ada akun online, server, atau sinkronisasi otomatis antarperangkat. Aplikasi berfungsi penuh tanpa internet.</Txt>
        {stats ? (
          <View style={{ marginTop: space.md, gap: 4 }}>
            <Txt v="small" color={c.text}>Jumlah transaksi: {stats.tx}</Txt>
            <Txt v="small" color={c.text}>Transaksi pertama: {stats.first ?? '—'}</Txt>
            <Txt v="small" color={c.text}>Backup terakhir: {stats.backup ?? 'belum pernah'}</Txt>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
