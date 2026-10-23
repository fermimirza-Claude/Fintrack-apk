/* Automated tests for FinTrack's data and business logic. Run: npm test */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/db/migrations';
import { Repo, ValidationError, budgetStatusOf } from '../src/db/repo';
import { addDays, addMonths, formatDate, setClock, todayJakarta, startOfWeek } from '../src/domain/dates';
import { formatRupiah, formatRupiahCompact, parseRupiahInput, percentChange } from '../src/domain/money';
import { previousPeriod, resolvePeriod } from '../src/domain/periods';
import { nextOccurrence } from '../src/domain/recurring';
import { buildInsights } from '../src/domain/analytics';
import { createBackup, parseBackup, restoreBackup } from '../src/services/backup';
import { buildImportPlan, dupKey, guessMapping, parseCsv, parseFlexibleAmount, parseFlexibleDate, transactionsToCsv } from '../src/services/csv';
import { loadChart, loadDashboard, loadReport } from '../src/services/dashboard';
import { loadDemoData } from '../src/services/demo';
import { openNodeDb } from './nodeDb';

// Freeze "now" at 23 Oct 2026 10:00 WIB (03:00 UTC)
setClock(() => Date.UTC(2026, 9, 23, 3, 0, 0));

type T = { name: string; fn: () => Promise<void> | void };
const tests: T[] = [];
const test = (name: string, fn: T['fn']) => tests.push({ name, fn });

async function fresh() {
  const db = openNodeDb();
  await migrate(db);
  const repo = new Repo(db);
  await repo.ensureSeed();
  return { db, repo };
}
const D = '2026-10-15';
async function bal(repo: Repo, id: string) {
  return (await repo.accountsWithBalance()).find((a) => a.id === id)!.balance;
}

// ---------------- formatting ----------------
test('Format Rupiah dan tanggal Indonesia', () => {
  assert.equal(formatRupiah(1250000), 'Rp1.250.000');
  assert.equal(formatRupiah(-1250000), '-Rp1.250.000');
  assert.equal(formatRupiah(0), 'Rp0');
  assert.equal(formatRupiah(999), 'Rp999');
  assert.equal(formatRupiah(1000), 'Rp1.000');
  assert.equal(formatRupiahCompact(1_250_000), 'Rp1,3 jt');
  assert.equal(formatDate('2026-10-23'), '23 Okt 2026');
  assert.equal(todayJakarta(), '2026-10-23');
  assert.equal(parseRupiahInput('Rp 1.250.000'), 1250000);
  assert.equal(parseRupiahInput('abc'), null);
});

test('Zona waktu Asia/Jakarta: 23:30 UTC = hari berikutnya di WIB', () => {
  setClock(() => Date.UTC(2026, 9, 22, 17, 30));
  assert.equal(todayJakarta(), '2026-10-23');
  setClock(() => Date.UTC(2026, 9, 22, 16, 59));
  assert.equal(todayJakarta(), '2026-10-22');
  setClock(() => Date.UTC(2026, 9, 23, 3, 0, 0));
});

// ---------------- 1 & 2 ----------------
test('1. Pemasukan menambah saldo', async () => {
  const { repo } = await fresh();
  await repo.updateAccount('acc_cash', { openingBalance: 100_000 });
  await repo.createTransaction({ type: 'income', amount: 500_000, title: 'Gaji', categoryId: 'cat_salary', accountId: 'acc_cash', date: D, time: '09:00' });
  assert.equal(await bal(repo, 'acc_cash'), 600_000);
  assert.equal(await repo.totalBalance(), 600_000);
});

test('2. Pengeluaran mengurangi saldo', async () => {
  const { repo } = await fresh();
  await repo.updateAccount('acc_cash', { openingBalance: 100_000 });
  await repo.createTransaction({ type: 'expense', amount: 30_000, title: 'Makan', categoryId: 'cat_food_1', accountId: 'acc_cash', date: D, time: '12:00' });
  assert.equal(await bal(repo, 'acc_cash'), 70_000);
});

// ---------------- 3 ----------------
test('3. Transfer: total aset tetap, tidak dihitung pemasukan/pengeluaran; biaya = pengeluaran terpisah', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 1_000_000 });
  await repo.createTransaction({ type: 'transfer', amount: 200_000, title: '', categoryId: null, accountId: bank, toAccountId: 'acc_cash', date: D, time: '10:00' });
  assert.equal(await bal(repo, bank), 800_000);
  assert.equal(await bal(repo, 'acc_cash'), 200_000);
  assert.equal(await repo.totalBalance(), 1_000_000);
  let t = await repo.totals('2026-10-01', '2026-10-31');
  assert.deepEqual([t.income, t.expense], [0, 0]);

  const tid = await repo.createTransaction({ type: 'transfer', amount: 100_000, title: 'Ke dompet', categoryId: null, accountId: bank, toAccountId: 'acc_cash', fee: 6_500, date: D, time: '11:00' });
  assert.equal(await repo.totalBalance(), 1_000_000 - 6_500);
  t = await repo.totals('2026-10-01', '2026-10-31');
  assert.deepEqual([t.income, t.expense], [0, 6_500]);
  assert.equal((await repo.getTransaction(tid))!.fee, 6_500);
  // same account transfer rejected
  await assert.rejects(repo.createTransaction({ type: 'transfer', amount: 1, title: '', categoryId: null, accountId: bank, toAccountId: bank, date: D, time: '11:00' }), ValidationError);
});

test('3b. Transfer atomik: gagal di tengah → tidak ada baris tersimpan', async () => {
  const { repo, db } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 0 });
  await db.run("DELETE FROM categories WHERE kind = 'expense' AND parent_id IS NOT NULL");
  await db.run("DELETE FROM categories WHERE kind = 'expense'");
  await assert.rejects(repo.createTransaction({ type: 'transfer', amount: 100, title: '', categoryId: null, accountId: bank, toAccountId: 'acc_cash', fee: 10, date: D, time: '10:00' }));
  assert.equal(await repo.transactionCount(), 0);
});

test('3c. Kartu kredit: belanja = pengeluaran (utang naik), bayar tagihan = transfer', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 2_000_000 });
  const cc = await repo.createAccount({ name: 'CC', type: 'credit_card', openingBalance: 0 });
  await repo.createTransaction({ type: 'expense', amount: 300_000, title: 'Belanja', categoryId: 'cat_shopping', accountId: cc, date: D, time: '10:00' });
  assert.equal(await bal(repo, cc), -300_000);
  await repo.createTransaction({ type: 'transfer', amount: 300_000, title: 'Bayar CC', categoryId: null, accountId: bank, toAccountId: cc, date: D, time: '11:00' });
  assert.equal(await bal(repo, cc), 0);
  assert.equal(await repo.totalBalance(), 1_700_000);
  const t = await repo.totals('2026-10-01', '2026-10-31');
  assert.equal(t.expense, 300_000, 'pembayaran kartu tidak dihitung ganda');
});

// ---------------- 4 & 5 ----------------
test('4. Edit transaksi menghitung ulang saldo, total, dan biaya transfer', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 1_000_000 });
  const id = await repo.createTransaction({ type: 'expense', amount: 50_000, title: 'Makan', categoryId: 'cat_food', accountId: 'acc_cash', date: D, time: '12:00' });
  await repo.updateTransaction(id, { type: 'expense', amount: 80_000, title: 'Makan', categoryId: 'cat_food', accountId: bank, date: D, time: '12:00' });
  assert.equal(await bal(repo, 'acc_cash'), 0);
  assert.equal(await bal(repo, bank), 920_000);
  await repo.updateTransaction(id, { type: 'income', amount: 80_000, title: 'Refund', categoryId: 'cat_other_inc', accountId: bank, date: D, time: '12:00' });
  assert.equal(await bal(repo, bank), 1_080_000);
  const tr = await repo.createTransaction({ type: 'transfer', amount: 100_000, title: '', categoryId: null, accountId: bank, toAccountId: 'acc_cash', fee: 2_500, date: D, time: '12:00' });
  await repo.updateTransaction(tr, { type: 'transfer', amount: 100_000, title: '', categoryId: null, accountId: bank, toAccountId: 'acc_cash', fee: 0, date: D, time: '12:00' });
  assert.equal((await repo.getTransaction(tr))!.fee, 0);
  assert.equal(await repo.totalBalance(), 1_080_000);
  // category must match type
  await assert.rejects(repo.updateTransaction(id, { type: 'expense', amount: 1, title: '', categoryId: 'cat_salary', accountId: bank, date: D, time: '12:00' }), ValidationError);
});

test('5. Hapus transaksi memulihkan saldo; hapus transfer ikut menghapus biayanya', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 500_000 });
  const e = await repo.createTransaction({ type: 'expense', amount: 50_000, title: 'X', categoryId: 'cat_food', accountId: bank, date: D, time: '12:00' });
  const tr = await repo.createTransaction({ type: 'transfer', amount: 100_000, title: '', categoryId: null, accountId: bank, toAccountId: 'acc_cash', fee: 5_000, date: D, time: '12:00' });
  await repo.deleteTransaction(e);
  await repo.deleteTransaction(tr);
  assert.equal(await repo.transactionCount(), 0);
  assert.equal(await bal(repo, bank), 500_000);
  const dup = await repo.createTransaction({ type: 'expense', amount: 10_000, title: 'Kopi', categoryId: 'cat_food_3', accountId: bank, date: D, time: '08:00' });
  const copy = await repo.duplicateTransaction(dup, '2026-10-20');
  assert.equal((await repo.getTransaction(copy))!.date, '2026-10-20');
  assert.equal(await bal(repo, bank), 480_000);
});

// ---------------- 6 ----------------
test('6. Filter tanggal, kategori (termasuk subkategori), akun, jenis, nominal, pencarian, urutan', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'Mandiri', type: 'bank', openingBalance: 0 });
  const mk = (amount: number, cat: string, acc: string, date: string, title: string, type: 'income' | 'expense' = 'expense') =>
    repo.createTransaction({ type, amount, title, categoryId: cat, accountId: acc, date, time: '10:00', tags: ['kantor'] });
  await mk(10_000, 'cat_food_1', 'acc_cash', '2026-09-30', 'Nasi');
  await mk(20_000, 'cat_food', bank, '2026-10-01', 'Sate');
  await mk(30_000, 'cat_transport_1', bank, '2026-10-10', 'Bensin');
  await mk(1_000_000, 'cat_salary', bank, '2026-10-05', 'Gaji', 'income');
  assert.equal((await repo.listTransactions({ from: '2026-10-01', to: '2026-10-31' })).length, 3);
  assert.equal((await repo.listTransactions({ categoryIds: ['cat_food'] })).length, 2, 'induk mencakup subkategori');
  assert.equal((await repo.listTransactions({ accountId: bank })).length, 3);
  assert.equal((await repo.listTransactions({ type: 'income' })).length, 1);
  assert.equal((await repo.listTransactions({ minAmount: 15_000, maxAmount: 30_000 })).length, 2);
  assert.equal((await repo.listTransactions({ search: 'bens' }))[0].title, 'Bensin');
  assert.equal((await repo.listTransactions({ search: 'transportasi' })).length, 0, 'cari pada nama subkategori');
  assert.equal((await repo.listTransactions({ search: 'bensin' })).length, 1);
  assert.equal((await repo.listTransactions({ search: 'kantor' })).length, 4, 'cari pada tag');
  assert.equal((await repo.listTransactions({ sort: 'oldest' }))[0].title, 'Nasi');
  assert.equal((await repo.listTransactions({ sort: 'newest' }))[0].title, 'Bensin');
});

// ---------------- 7 ----------------
test('7. Anggaran mengikuti perubahan transaksi; status 80% dan 100%; salin dari bulan lalu', async () => {
  const { repo } = await fresh();
  await repo.upsertBudget('2026-10', 'cat_food', 100_000);
  const a = await repo.createTransaction({ type: 'expense', amount: 50_000, title: 'A', categoryId: 'cat_food_1', accountId: 'acc_cash', date: '2026-10-02', time: '10:00' });
  await repo.createTransaction({ type: 'expense', amount: 9_999, title: 'Lain bulan', categoryId: 'cat_food', accountId: 'acc_cash', date: '2026-09-30', time: '10:00' });
  let b = (await repo.budgetStatuses('2026-10'))[0];
  assert.deepEqual([b.spent, b.remaining, b.status], [50_000, 50_000, 'safe']);
  await repo.updateTransaction(a, { type: 'expense', amount: 85_000, title: 'A', categoryId: 'cat_food_1', accountId: 'acc_cash', date: '2026-10-02', time: '10:00' });
  b = (await repo.budgetStatuses('2026-10'))[0];
  assert.equal(b.status, 'warning');
  await repo.createTransaction({ type: 'expense', amount: 15_000, title: 'B', categoryId: 'cat_food', accountId: 'acc_cash', date: '2026-10-03', time: '10:00' });
  b = (await repo.budgetStatuses('2026-10'))[0];
  assert.deepEqual([b.spent, b.status, Math.round(b.percent)], [100_000, 'over', 100]);
  await repo.deleteTransaction(a);
  b = (await repo.budgetStatuses('2026-10'))[0];
  assert.deepEqual([b.spent, b.status], [15_000, 'safe']);
  assert.equal(budgetStatusOf(79, 100), 'safe');
  assert.equal(budgetStatusOf(80, 100), 'warning');
  assert.equal(budgetStatusOf(100, 100), 'over');
  assert.equal(await repo.copyBudgets('2026-10', '2026-11'), 1);
  assert.equal(await repo.copyBudgets('2026-10', '2026-11'), 0, 'tidak menggandakan');
  await assert.rejects(repo.upsertBudget('2026-10', 'cat_food', 0), ValidationError);
  await assert.rejects(repo.upsertBudget('2026-10', 'cat_salary', 1000), ValidationError);
});

// ---------------- 8 ----------------
test('8. Data persisten setelah database ditutup dan dibuka ulang (file SQLite)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fintrack-'));
  const path = join(dir, 'fintrack.db');
  try {
    let db = openNodeDb(path);
    await migrate(db);
    let repo = new Repo(db);
    await repo.ensureSeed();
    await repo.createTransaction({ type: 'income', amount: 123_456, title: 'Persist', categoryId: 'cat_salary', accountId: 'acc_cash', date: D, time: '10:00' });
    await repo.upsertBudget('2026-10', 'cat_food', 50_000);
    await repo.setSetting('theme', 'dark');
    db.close();
    db = openNodeDb(path);
    await migrate(db); // must be a no-op on an up-to-date schema
    repo = new Repo(db);
    await repo.ensureSeed();
    assert.equal(await repo.totalBalance(), 123_456);
    assert.equal((await repo.budgetStatuses('2026-10')).length, 1);
    assert.equal(await repo.getSetting('theme'), 'dark');
    assert.equal((await repo.listAccounts()).length, 1, 'seed tidak dijalankan ulang');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------- 9 ----------------
test('9. Backup JSON → restore (ganti & gabung) mempertahankan relasi', async () => {
  const { repo, db } = await fresh();
  await loadDemoData(repo);
  await repo.saveRecurring({ type: 'income', amount: 1, title: 'R', categoryId: 'cat_salary', accountId: 'acc_cash', frequency: 'monthly', interval: 1, startDate: '2026-11-01', autoPost: true, remind: false });
  await repo.setSetting('pin_hash', 'secret');
  const before = { bal: await repo.totalBalance(), n: await repo.transactionCount(), budgets: (await repo.budgetStatuses('2026-10')).map((b) => [b.categoryId, b.spent]) };
  const backup = await createBackup(db);
  assert.ok(!backup.data.app_settings.some((s) => s.key === 'pin_hash'), 'PIN tidak ikut di-backup');
  const text = JSON.stringify(backup);

  const target = await fresh();
  const { backup: parsed, summary } = parseBackup(text);
  assert.equal(summary.transactions, before.n);
  await restoreBackup(target.db, parsed, 'replace');
  assert.equal(await target.repo.totalBalance(), before.bal);
  assert.equal(await target.repo.transactionCount(), before.n);
  assert.deepEqual((await target.repo.budgetStatuses('2026-10')).map((b) => [b.categoryId, b.spent]), before.budgets);
  const fk = await target.db.all('PRAGMA foreign_key_check');
  assert.equal(fk.length, 0, 'tidak ada relasi yatim');
  // merge twice — no duplicates
  await restoreBackup(target.db, parsed, 'merge');
  assert.equal(await target.repo.transactionCount(), before.n);
  assert.throws(() => parseBackup('{"app":"Lain"}'));
  assert.throws(() => parseBackup('bukan json'));
});

test('9b. Ekspor CSV → impor: pemetaan kolom otomatis, validasi, deteksi duplikasi', async () => {
  const { repo } = await fresh();
  const bank = await repo.createAccount({ name: 'BCA', type: 'bank', openingBalance: 0 });
  await repo.createTransaction({ type: 'expense', amount: 25_000, title: 'Kopi, "susu"', categoryId: 'cat_food_3', accountId: bank, date: D, time: '08:00', note: 'baris\nbaru' });
  await repo.createTransaction({ type: 'transfer', amount: 50_000, title: 'Topup', categoryId: null, accountId: bank, toAccountId: 'acc_cash', date: D, time: '09:00' });
  const csv = transactionsToCsv(await repo.listTransactions());
  const rows = parseCsv(csv);
  const mapping = guessMapping(rows[0]);
  assert.equal(mapping.amount, 3);
  const existing = new Set((await repo.listTransactions()).map(dupKey));
  const plan = buildImportPlan({ rows: rows.slice(1), mapping, accounts: await repo.listAccounts(), categories: await repo.listCategories(), defaultAccountId: 'acc_cash', existingKeys: existing });
  assert.equal(plan.valid, 2);
  assert.equal(plan.duplicates, 2, 'transaksi yang sama terdeteksi duplikat');
  assert.equal(plan.rows.find((r) => r.input?.type === 'expense')!.input!.title, 'Kopi, "susu"');
  assert.equal(plan.rows.find((r) => r.input?.type === 'expense')!.input!.note, 'baris\nbaru');
  assert.equal(plan.rows.find((r) => r.input?.type === 'transfer')!.input!.toAccountId, 'acc_cash');

  const bankCsv = 'Tanggal;Keterangan;Jumlah\n23/10/2026;Indomaret;-45.500\n22/10/2026;Transfer masuk;1.000.000,00\n99/99/2026;Rusak;10\n01/12/2026;Masa depan;-10';
  const r2 = parseCsv(bankCsv);
  const p2 = buildImportPlan({ rows: r2.slice(1), mapping: guessMapping(r2[0]), accounts: await repo.listAccounts(), categories: await repo.listCategories(), defaultAccountId: bank, existingKeys: new Set() });
  assert.deepEqual(p2.rows.map((r) => r.input?.type ?? null), ['expense', 'income', null, null]);
  assert.equal(p2.rows[0].input!.amount, 45_500);
  assert.equal(p2.rows[1].input!.amount, 1_000_000);
  assert.equal(p2.invalid, 2);
  assert.equal(parseFlexibleAmount('1,250,000.50'), 1_250_001);
  assert.equal(parseFlexibleAmount('Rp1.250'), 1_250);
  assert.equal(parseFlexibleAmount('12,5'), 13);
  assert.equal(parseFlexibleDate('23 Okt 2026'), '2026-10-23');
  assert.equal(parseFlexibleDate('2026-02-30'), null);
});

// ---------------- 10 ----------------
test('10. Kondisi kosong & input tidak valid: tanpa NaN, tanpa persentase palsu', async () => {
  const { repo } = await fresh();
  const d = await loadDashboard(repo);
  assert.equal(d.isEmpty, true);
  assert.equal(d.balance, 0);
  assert.equal(d.incomeChange, null);
  assert.equal(d.expenseChange, null);
  assert.equal(d.insights.length, 0);
  assert.equal(d.health.find((h) => h.key === 'savings')!.value, null);
  assert.equal(d.health.find((h) => h.key === 'projection')!.value, null);
  assert.ok(!JSON.stringify(d).includes('NaN') && !JSON.stringify(d).includes('Infinity'));
  const r = await loadReport(repo, '2026-10-01', '2026-10-31');
  assert.ok(!JSON.stringify(r).includes('NaN'));
  const c = await loadChart(repo, 'monthly');
  assert.equal(c.buckets.length, 6);
  assert.equal(c.highestExpense, null);
  const bad = (p: object) => repo.createTransaction({ type: 'expense', amount: 1000, title: 'x', categoryId: 'cat_food', accountId: 'acc_cash', date: D, time: '10:00', ...p } as any);
  await assert.rejects(bad({ amount: 0 }), ValidationError);
  await assert.rejects(bad({ amount: -5 }), ValidationError);
  await assert.rejects(bad({ amount: 10.5 }), ValidationError);
  await assert.rejects(bad({ date: '2026-13-01' }), ValidationError);
  await assert.rejects(bad({ time: '25:00' }), ValidationError);
  await assert.rejects(bad({ categoryId: null }), ValidationError);
  await assert.rejects(bad({ accountId: 'nope' }), ValidationError);
  await assert.rejects(repo.createAccount({ name: '  ', type: 'cash', openingBalance: 0 }), ValidationError);
  assert.equal(percentChange(100, 0), null);
  assert.equal(await repo.transactionCount(), 0);
});

// ---------------- 11 ----------------
test('11. Angka dashboard = hasil hitung ulang mandiri dari baris database (tidak ada hardcode)', async () => {
  const { repo, db } = await fresh();
  await loadDemoData(repo);
  const d = await loadDashboard(repo);
  const rows = await db.all<any>("SELECT * FROM transactions WHERE date >= '2026-10-01' AND date <= '2026-10-23'");
  const inc = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const exp = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  assert.equal(d.income, inc);
  assert.equal(d.expense, exp);
  assert.equal(d.net, inc - exp);
  const accs = await db.all<any>('SELECT * FROM accounts');
  const all = await db.all<any>("SELECT * FROM transactions WHERE date <= '2026-10-23'");
  let total = accs.reduce((s, a) => s + a.opening_balance, 0);
  for (const t of all) total += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
  assert.equal(d.balance, total);
  const catSum = d.categories.reduce((s, c) => s + c.amount, 0);
  assert.equal(catSum, exp, 'donut menjumlah ke total pengeluaran');
  assert.ok(d.insights.length > 0);
  assert.ok(d.recent.length > 0 && d.recent.length <= 8);
  assert.equal(d.hasDemo, true);
  await repo.clearDemoData();
  assert.equal(await repo.transactionCount(), 0);
  assert.equal(await repo.hasDemoData(), false);
  assert.equal((await repo.listAccounts()).length, 1, 'akun contoh ikut terhapus');
});

test('Laporan periode berjalan dibandingkan dengan jumlah hari yang sama', async () => {
  const { repo } = await fresh();
  await repo.createTransaction({ type: 'expense', amount: 100_000, title: 'Awal Sep', categoryId: 'cat_food', accountId: 'acc_cash', date: '2026-09-10', time: '10:00' });
  await repo.createTransaction({ type: 'expense', amount: 900_000, title: 'Akhir Sep', categoryId: 'cat_food', accountId: 'acc_cash', date: '2026-09-28', time: '10:00' });
  await repo.createTransaction({ type: 'expense', amount: 150_000, title: 'Okt', categoryId: 'cat_food', accountId: 'acc_cash', date: '2026-10-05', time: '10:00' });
  const r = await loadReport(repo, '2026-10-01', '2026-10-31');
  assert.equal(r.prevTotals.expense, 100_000, 'hanya 1–23 Sep yang dibandingkan');
  assert.equal(Math.round(r.expenseChange!), 50);
  const full = await loadReport(repo, '2026-09-01', '2026-09-30');
  assert.equal(full.totals.expense, 1_000_000);
});

// ---------------- recurring ----------------
test('Transaksi berulang: tidak tercatat ganda saat aplikasi dibuka ulang; akhir bulan aman', async () => {
  const { repo } = await fresh();
  const id = await repo.saveRecurring({ type: 'expense', amount: 100_000, title: 'Sewa', categoryId: 'cat_household_1', accountId: 'acc_cash', frequency: 'monthly', interval: 1, startDate: '2026-07-31', autoPost: true, remind: false });
  assert.equal(await repo.materializeDue(), 3); // 31 Jul, 31 Aug, 30 Sep
  assert.equal(await repo.materializeDue(), 0);
  assert.equal(await repo.materializeDue(), 0);
  const dates = (await repo.listTransactions({ sort: 'oldest' })).map((t) => t.date);
  assert.deepEqual(dates, ['2026-07-31', '2026-08-31', '2026-09-30']);
  assert.equal((await repo.getRecurring(id))!.nextDate, '2026-10-31');
  assert.equal(nextOccurrence('2027-01-31', 'monthly', 1, 31), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  // manual rule: scheduled (not recorded) until "Catat"
  const m = await repo.saveRecurring({ type: 'income', amount: 5_000_000, title: 'Gaji', categoryId: 'cat_salary', accountId: 'acc_cash', frequency: 'monthly', interval: 1, startDate: '2026-10-20', autoPost: false, remind: true });
  await repo.materializeDue();
  assert.equal((await repo.listTransactions({ type: 'income' })).length, 0, 'terjadwal ≠ tercatat');
  await repo.postRecurringNow(m);
  assert.equal((await repo.listTransactions({ type: 'income' })).length, 1);
  assert.equal((await repo.getRecurring(m))!.nextDate, '2026-11-20');
  // end date deactivates
  const e = await repo.saveRecurring({ type: 'expense', amount: 1000, title: 'Kursus', categoryId: 'cat_education_2', accountId: 'acc_cash', frequency: 'weekly', interval: 1, startDate: '2026-10-01', endDate: '2026-10-15', autoPost: true, remind: false });
  await repo.materializeDue();
  assert.equal((await repo.listTransactions({ search: 'kursus' })).length, 3);
  assert.equal((await repo.getRecurring(e))!.isActive, false);
});

// ---------------- periods & insights ----------------
test('Periode laporan & periode pembanding', () => {
  assert.deepEqual(resolvePeriod('this_month'), { preset: 'this_month', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(resolvePeriod('last_month'), { preset: 'last_month', from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(resolvePeriod('last_3_months'), { preset: 'last_3_months', from: '2026-08-01', to: '2026-10-31' });
  assert.equal(resolvePeriod('this_week').from, startOfWeek('2026-10-23'));
  assert.deepEqual(previousPeriod({ from: '2026-08-01', to: '2026-10-31' }), { from: '2026-05-01', to: '2026-07-31' });
  assert.deepEqual(previousPeriod({ from: '2026-10-05', to: '2026-10-11' }), { from: '2026-09-28', to: '2026-10-04' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('Insight: tidak muncul bila data kurang; tidak membagi dengan nol', () => {
  const base = { periodLabel: 'bulan ini', comparisonLabel: 'bulan lalu', income: 0, expense: 50_000, prevIncome: 0, prevExpense: 0, txCount: 2, elapsedDays: 10, totalDays: 31, categories: [{ name: 'Makan', amount: 50_000 }], prevCategories: [], budgets: [], isCurrentMonth: true };
  assert.equal(buildInsights(base).length, 0);
  const ins = buildInsights({ ...base, txCount: 10 });
  assert.ok(!ins.some((i) => /%.*lebih (tinggi|rendah)/.test(i.text)));
  assert.ok(ins.some((i) => i.kind === 'projection'));
  const ins2 = buildInsights({ ...base, txCount: 10, prevExpense: 40_000, income: 100_000 });
  assert.ok(ins2.some((i) => i.text.includes('25% lebih tinggi')));
});

(async () => {
  let pass = 0;
  const failed: string[] = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log('  ✓ ' + t.name);
    } catch (e: any) {
      failed.push(t.name);
      console.log('  ✗ ' + t.name + '\n    ' + (e?.stack ?? e));
    }
  }
  console.log(`\n${pass}/${tests.length} lulus`);
  process.exit(failed.length ? 1 : 0);
})();
