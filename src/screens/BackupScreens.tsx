import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useApp } from '../state/AppContext';
import { Button, Card, Field, InfoNote, ListItem, Row, Screen, SectionHeader, SelectField, SelectSheet, SwitchRow, Txt } from '../ui/components';
import { DateField } from '../ui/DateField';
import { createBackup, parseBackup, restoreBackup, BackupError, type BackupFile, type BackupSummary } from '../services/backup';
import { buildImportPlan, dupKey, guessMapping, IMPORT_FIELD_LABEL, parseCsv, transactionsToCsv, type ColumnMapping, type ImportField, type ImportPlan } from '../services/csv';
import { pickTextFile, sharePdfFromHtml, shareTextFile } from '../services/files';
import { loadReport } from '../services/dashboard';
import { buildReportHtml } from '../services/reportPdf';
import { syncReminders } from '../services/notifications';
import { formatDate, todayJakarta } from '../domain/dates';
import { formatRupiah } from '../domain/money';
import { TX_TYPE_LABEL } from '../domain/types';
import type { RootScreen } from '../navigation/types';
import { space } from '../ui/theme';

export function BackupScreen({ navigation }: RootScreen<'Backup'>) {
  const { repo, notifyDataChanged } = useApp();
  const [from, setFrom] = useState(todayJakarta().slice(0, 4) + '-01-01');
  const [to, setTo] = useState(todayJakarta());
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; name: string } | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { Alert.alert('Gagal', e instanceof BackupError ? e.message : e?.message ?? String(e)); } finally { setBusy(null); }
  };

  const exportCsv = () => run('csv', async () => {
    const rows = await repo.listTransactions({ from, to, sort: 'oldest' });
    if (!rows.length) throw new Error('Tidak ada transaksi pada rentang tanggal ini.');
    await shareTextFile(`fintrack_transaksi_${from}_${to}.csv`, transactionsToCsv(rows), 'text/csv');
  });
  const exportPdf = () => run('pdf', async () => {
    const rep = await loadReport(repo, from, to);
    await sharePdfFromHtml(`fintrack_laporan_${from}_${to}.pdf`, buildReportHtml(rep));
  });
  const backup = () => run('json', async () => {
    const b = await createBackup(repo.raw);
    await shareTextFile(`fintrack_backup_${todayJakarta()}.json`, JSON.stringify(b), 'application/json');
    await repo.setSetting('last_backup_at', todayJakarta());
  });
  const pickRestore = () => run('restore', async () => {
    const f = await pickTextFile(['application/json', 'text/plain', '*/*']);
    if (!f) return;
    const { backup, summary } = parseBackup(f.text);
    setPending({ backup, summary, name: f.name });
  });
  const doRestore = (mode: 'replace' | 'merge') => {
    if (!pending) return;
    const msg = mode === 'replace'
      ? 'SEMUA data di perangkat ini akan diganti dengan isi backup. PIN tetap dipertahankan. Lanjutkan?'
      : 'Data dari backup akan ditambahkan. Data yang sudah ada (ID sama) tidak diubah. Lanjutkan?';
    Alert.alert(mode === 'replace' ? 'Ganti semua data?' : 'Gabungkan data?', msg, [
      { text: 'Batal', style: 'cancel' },
      { text: mode === 'replace' ? 'Ganti' : 'Gabungkan', style: mode === 'replace' ? 'destructive' : 'default', onPress: () => run('restore', async () => {
        await restoreBackup(repo.raw, pending.backup, mode);
        await syncReminders(repo);
        setPending(null);
        notifyDataChanged();
        Alert.alert('Restore selesai', 'Data berhasil dipulihkan.');
      }) },
    ]);
  };

  return (
    <Screen>
      <InfoNote>Data hanya tersimpan di perangkat ini. Simpan file backup ke Google Drive, email, atau penyimpanan lain lewat menu Bagikan agar data aman jika HP hilang atau diganti.</InfoNote>

      <SectionHeader title="Backup & restore (JSON)" subtitle="Seluruh akun, kategori, transaksi, anggaran, jadwal berulang, dan pengaturan" />
      <Card>
        <Button title="Buat file backup" icon="cloud-upload-outline" onPress={backup} loading={busy === 'json'} />
        <View style={{ height: space.sm }} />
        <Button title="Pulihkan dari backup" icon="cloud-download-outline" variant="secondary" onPress={pickRestore} loading={busy === 'restore' && !pending} />
        <Txt v="tiny" style={{ marginTop: 8 }}>Foto struk dan PIN tidak ikut di-backup.</Txt>
        {pending ? (
          <View style={{ marginTop: space.md }}>
            <Txt v="bodyStrong">{pending.name}</Txt>
            <Txt v="small">Dibuat {pending.summary.exportedAt ? pending.summary.exportedAt.slice(0, 10) : '-'}</Txt>
            <Txt v="small" style={{ marginTop: 4 }}>
              {pending.summary.transactions} transaksi · {pending.summary.accounts} akun · {pending.summary.categories} kategori · {pending.summary.budgets} anggaran · {pending.summary.recurring} jadwal berulang
            </Txt>
            <Row style={{ marginTop: space.md }}>
              <Button title="Gabungkan" variant="secondary" onPress={() => doRestore('merge')} style={{ flex: 1 }} small />
              <Button title="Ganti semua" variant="danger" onPress={() => doRestore('replace')} style={{ flex: 1 }} small />
            </Row>
            <Button title="Batal" variant="ghost" small onPress={() => setPending(null)} />
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Ekspor" subtitle="Pilih rentang tanggal" />
      <Card>
        <Row>
          <View style={{ flex: 1 }}><Field label="Dari"><DateField value={from} onChange={setFrom} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Sampai"><DateField value={to} onChange={setTo} /></Field></View>
        </Row>
        <Row>
          <Button title="CSV" icon="document-text-outline" variant="secondary" onPress={exportCsv} loading={busy === 'csv'} style={{ flex: 1 }} />
          <Button title="Laporan PDF" icon="document-outline" variant="secondary" onPress={exportPdf} loading={busy === 'pdf'} style={{ flex: 1 }} />
        </Row>
      </Card>

      <SectionHeader title="Impor" />
      <Card>
        <ListItem icon="document-attach-outline" title="Impor transaksi dari CSV" subtitle="Pemetaan kolom, validasi, dan deteksi duplikasi" onPress={() => navigation.navigate('ImportCsv')} last />
      </Card>
    </Screen>
  );
}

const FIELDS: ImportField[] = ['date', 'amount', 'type', 'title', 'category', 'account', 'toAccount', 'time', 'paymentMethod', 'note', 'tags'];

export function ImportCsvScreen({ navigation }: RootScreen<'ImportCsv'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [picking, setPicking] = useState<ImportField | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [defaultAcc, setDefaultAcc] = useState<string | null>(null);
  const [accPick, setAccPick] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);

  const headers = file?.rows[0] ?? [];
  const sample = file?.rows[1] ?? [];

  const choose = async () => {
    try {
      const f = await pickTextFile(['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*']);
      if (!f) return;
      const rows = parseCsv(f.text);
      if (rows.length < 2) throw new Error('File CSV kosong atau hanya berisi judul kolom.');
      setFile({ name: f.name, rows });
      setMapping(guessMapping(rows[0]));
      const acc = await repo.listAccounts(false);
      setAccounts(acc);
      setDefaultAcc(acc[0]?.id ?? null);
      setPlan(null);
    } catch (e: any) { Alert.alert('Gagal membaca file', e?.message ?? String(e)); }
  };

  const review = async () => {
    if (!file) return;
    if (mapping.date === undefined || mapping.amount === undefined) return Alert.alert('Pemetaan belum lengkap', 'Kolom Tanggal dan Nominal wajib dipetakan.');
    if (!defaultAcc) return Alert.alert('Pilih akun', 'Pilih akun default untuk baris tanpa kolom akun.');
    setBusy(true);
    try {
      const existing = new Set((await repo.listTransactions()).map(dupKey));
      setPlan(buildImportPlan({ rows: file.rows.slice(1), mapping, accounts: await repo.listAccounts(), categories: await repo.listCategories(undefined, true), defaultAccountId: defaultAcc, existingKeys: existing }));
    } finally { setBusy(false); }
  };

  const toImport = useMemo(() => (plan?.rows ?? []).filter((r) => r.input && (!skipDup || !r.duplicate)), [plan, skipDup]);

  const doImport = () => Alert.alert('Impor transaksi?', `${toImport.length} transaksi akan ditambahkan ke data Anda${skipDup && plan?.duplicates ? ` (${plan.duplicates} duplikat dilewati)` : ''}.`, [
    { text: 'Batal', style: 'cancel' },
    { text: 'Impor', onPress: async () => {
      setBusy(true);
      let ok = 0; const failed: number[] = [];
      for (const r of toImport) {
        try { await repo.createTransaction(r.input!); ok++; } catch { failed.push(r.line); }
      }
      setBusy(false);
      notifyDataChanged();
      Alert.alert('Impor selesai', `${ok} transaksi berhasil diimpor.${failed.length ? ` ${failed.length} gagal (baris ${failed.slice(0, 10).join(', ')}).` : ''}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } },
  ]);

  const colOptions = [{ value: '-1', label: '— Tidak dipakai —' }, ...headers.map((h, i) => ({ value: String(i), label: h || `Kolom ${i + 1}`, subtitle: sample[i] ? `Contoh: ${sample[i]}` : undefined }))];
  const errors = (plan?.rows ?? []).filter((r) => !r.input).slice(0, 8);
  const fallbackCount = (plan?.rows ?? []).filter((r) => r.input && r.categoryFallback).length;

  return (
    <Screen>
      <InfoNote>Format yang didukung: CSV dengan pemisah koma, titik koma, atau tab. Tanggal: 2026-10-23, 23/10/2026, atau 23 Okt 2026. Nominal negatif dianggap pengeluaran bila tidak ada kolom jenis.</InfoNote>
      <Button title={file ? `Ganti file (${file.name})` : 'Pilih file CSV'} icon="folder-open-outline" onPress={choose} variant={file ? 'secondary' : 'primary'} />
      {file ? (
        <>
          <SectionHeader title="Pemetaan kolom" subtitle={`${file.rows.length - 1} baris data terdeteksi`} />
          <Card>
            {FIELDS.map((f) => (
              <Field key={f} label={IMPORT_FIELD_LABEL[f]}>
                <SelectField value={mapping[f] !== undefined ? headers[mapping[f]!] || `Kolom ${mapping[f]! + 1}` : null} placeholder="Tidak dipakai" onPress={() => setPicking(f)} />
              </Field>
            ))}
            <Field label="Akun default" hint="Dipakai untuk baris yang kolom akunnya kosong / tidak dipetakan">
              <SelectField value={accounts.find((a) => a.id === defaultAcc)?.name} placeholder="Pilih akun" onPress={() => setAccPick(true)} icon="wallet-outline" />
            </Field>
            <Button title="Tinjau data" icon="eye-outline" onPress={review} loading={busy && !plan} />
          </Card>
        </>
      ) : null}
      {plan ? (
        <>
          <SectionHeader title="Ringkasan impor" />
          <Card>
            <Txt v="body">Valid: <Txt v="bodyStrong" color={c.income}>{plan.valid}</Txt> · Tidak valid: <Txt v="bodyStrong" color={c.expense}>{plan.invalid}</Txt> · Potensi duplikat: <Txt v="bodyStrong" color={c.warning}>{plan.duplicates}</Txt></Txt>
            {fallbackCount ? <Txt v="small" style={{ marginTop: 4 }}>{fallbackCount} baris memakai kategori “Lain-lain” karena nama kategorinya tidak ditemukan.</Txt> : null}
            <SwitchRow label="Lewati potensi duplikat" hint="Sama tanggal, jenis, nominal, dan nama dengan data yang ada atau baris lain" value={skipDup} onChange={setSkipDup} />
            {errors.length ? (
              <View style={{ marginTop: space.sm }}>
                <Txt v="smallStrong" color={c.expense}>Baris bermasalah (tidak diimpor):</Txt>
                {errors.map((e) => <Txt key={e.line} v="small">Baris {e.line}: {e.errors.join(', ')}</Txt>)}
              </View>
            ) : null}
            <Txt v="smallStrong" style={{ marginTop: space.md }}>Pratinjau</Txt>
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
              {toImport.slice(0, 20).map((r) => (
                <Row key={r.line} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>{formatDate(r.input!.date)} · {r.input!.title}</Txt>
                  <Txt v="smallStrong" color={r.input!.type === 'income' ? c.income : r.input!.type === 'expense' ? c.expense : c.accent}>{TX_TYPE_LABEL[r.input!.type]} {formatRupiah(r.input!.amount)}</Txt>
                </Row>
              ))}
            </ScrollView>
            <Button title={`Impor ${toImport.length} transaksi`} icon="download-outline" onPress={doImport} disabled={!toImport.length} loading={busy} style={{ marginTop: space.md }} />
          </Card>
        </>
      ) : null}
      <SelectSheet visible={picking !== null} onClose={() => setPicking(null)} title={picking ? IMPORT_FIELD_LABEL[picking] : ''} options={colOptions}
        value={picking && mapping[picking] !== undefined ? String(mapping[picking]) : '-1'}
        onSelect={(v) => { if (!picking) return; const idx = parseInt(v, 10); setMapping((m) => { const n = { ...m }; if (idx < 0) delete n[picking]; else n[picking] = idx; return n; }); setPlan(null); }} />
      <SelectSheet visible={accPick} onClose={() => setAccPick(false)} title="Akun default" value={defaultAcc} options={accounts.map((a) => ({ value: a.id, label: a.name, icon: 'wallet-outline' }))} onSelect={(v) => { setDefaultAcc(v); setPlan(null); }} />
    </Screen>
  );
}
