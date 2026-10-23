// Browser smoke test + screenshots. Bundles the REAL app screens with small shims for
// react-native/native modules, runs them in headless Chromium, and backs the database with
// Node's SQLite via the real repository code. Usage: node tests/preview/run.mjs <outDir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/opt/npm-tools/node_modules/');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(process.argv[2] ?? path.join(here, 'out'));
mkdirSync(out, { recursive: true });

const shim = (f) => path.join(here, f);
const alias = {
  'react-native': shim('rn-shim.tsx'),
  '@react-navigation/native': shim('nav-shim.tsx'),
  '@react-navigation/native-stack': shim('nav-shim.tsx'),
  '@react-navigation/bottom-tabs': shim('nav-shim.tsx'),
};
const misc = ['react-native-svg', '@expo/vector-icons', 'react-native-safe-area-context', 'expo', 'expo-status-bar',
  '@react-native-community/datetimepicker', 'expo-crypto', 'expo-local-authentication', 'expo-notifications',
  'expo-file-system/legacy', 'expo-sharing', 'expo-document-picker', 'expo-image-picker', 'expo-print'];

const plugin = {
  name: 'shims',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (alias[a.path]) return { path: alias[a.path] };
      if (misc.includes(a.path)) return { path: shim('misc-shims.tsx') };
      if (a.path.endsWith('/db/expoDb')) return { path: shim('db-bridge.ts') };
      return undefined;
    });
  },
};

const build = await esbuild.build({
  entryPoints: [path.join(root, 'index.ts')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
  nodePaths: ['/opt/npm-tools/node_modules'], plugins: [plugin], define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error', loader: { '.tsx': 'tsx', '.ts': 'ts' },
});
const js = build.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#F4F6FA;-webkit-font-smoothing:antialiased}#root{height:100%;display:flex;flex-direction:column}*::-webkit-scrollbar{display:none}</style>
</head><body><div id="root"></div><script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`;

// --- database in Node
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
const dbCall = (op, sql, params) => {
  if (op === 'exec') { db.exec(sql); return null; }
  const st = db.prepare(sql);
  if (op === 'run') { const r = st.run(...params); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; }
  if (op === 'all') return st.all(...params);
  return st.get(...params) ?? null;
};

const browser = await chromium.launch();
const errors = [];
const results = [];

async function session({ width, height, scheme, demo, name, steps }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  await page.exposeFunction('dbCall', (op, sql, params) => dbCall(op, sql, params));
  await page.exposeFunction('nodeSha256', (str) => createHash('sha256').update(str).digest('hex'));
  // Freeze time: 23 Oct 2026 10:00 WIB
  await page.addInitScript(({ scheme }) => {
    const fixed = Date.UTC(2026, 9, 23, 3, 0, 0);
    const RealDate = Date;
    // @ts-ignore
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
    window.__scheme = scheme;
  }, { scheme });
  await page.setContent(html);
  await page.waitForTimeout(900);
  if (demo) {
    // Use the Settings → "Isi data contoh" flow when requested
  }
  for (const s of steps) {
    try { await s(page); } catch (e) { errors.push(`[${name}] step failed: ${e.message}`); }
  }
  await ctx.close();
}

const shot = (file) => async (page) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, file) }); results.push(file); };
const tapText = (t, opts = {}) => async (page) => { await page.getByText(t, { exact: opts.exact ?? true }).first().click(); await page.waitForTimeout(500); };
const tapLabel = (l) => async (page) => { await page.getByLabel(l, { exact: true }).first().click(); await page.waitForTimeout(500); };
const confirmAlert = (btn) => async (page) => {
  await page.evaluate(async (btn) => { const b = (window.__lastAlertButtons || []).find((x) => x.text === btn); if (b?.onPress) await b.onPress(); }, btn);
  await page.waitForTimeout(1200);
};
const scrollMain = (y) => async (page) => {
  await page.evaluate((y) => { const els = [...document.querySelectorAll('[data-scroll="v"]')]; const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (el) el.scrollTop = y; }, y);
  await page.waitForTimeout(300);
};

// 1) Empty state on a small Android screen (360×740)
await session({ width: 360, height: 740, scheme: 'light', name: 'empty', steps: [shot('01_dashboard_kosong_360.png')] });

// 2) Full flow with demo data (390×844)
await session({
  width: 390, height: 844, scheme: 'light', name: 'demo', steps: [
    tapText('Atau coba dengan data contoh'), confirmAlert('Isi data contoh'),
    shot('02_dashboard_atas.png'), scrollMain(620), shot('03_dashboard_grafik.png'), scrollMain(1250), shot('04_dashboard_kategori.png'),
    scrollMain(2000), shot('05_dashboard_kesehatan_insight.png'),
    tapLabel('Transaksi'), shot('06_transaksi.png'),
    tapLabel('Anggaran'), shot('07_anggaran.png'),
    tapLabel('Laporan'), shot('08_laporan.png'), scrollMain(900), shot('09_laporan_analisis.png'),
    tapText('Kalender'), shot('10_kalender.png'),
    tapLabel('Pengaturan'), shot('11_pengaturan.png'),
    tapLabel('Dashboard'), tapLabel('Pengeluaran'), shot('12_form_pengeluaran.png'),
    async (page) => {
      // Fill and save an expense through the real form, then verify the dashboard updated.
      await page.getByLabel('Nominal').fill('125000');
      await page.getByPlaceholder('Contoh: Makan siang').fill('Uji simpan');
      await page.getByText('Pilih kategori').click(); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, '12b_pilih_kategori.png') });
      await page.getByText('Hiburan', { exact: true }).last().click({ force: true }); await page.waitForTimeout(400);
      await page.getByText('Simpan transaksi').click(); await page.waitForTimeout(1200);
      const ok = await page.getByText('Uji simpan').count();
      results.push(`form_save_visible_on_dashboard=${ok > 0}`);
    },
    shot('13_dashboard_setelah_simpan.png'),
    tapLabel('Transfer'),
    async (page) => {
      const before = dbCall('first', "SELECT (SELECT SUM(opening_balance) FROM accounts) + COALESCE((SELECT SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END) FROM transactions),0) AS t", []).t;
      await page.getByLabel('Nominal').fill('200000');
      await page.getByText('Pilih akun tujuan').click(); await page.waitForTimeout(300);
      await page.getByText('BCA (contoh)', { exact: true }).last().click({ force: true }); await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, '14_form_transfer.png') });
      await page.getByText('Simpan transaksi').click(); await page.waitForTimeout(1200);
      const after = dbCall('first', "SELECT (SELECT SUM(opening_balance) FROM accounts) + COALESCE((SELECT SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END) FROM transactions),0) AS t", []).t;
      results.push(`transfer_total_unchanged=${before === after}`);
    },
    tapLabel('Anggaran'), // quick action opens the add-budget sheet directly
    async (page) => {
      await page.getByText('Pilih kategori').last().click(); await page.waitForTimeout(300);
      await page.getByText('Tagihan & Utilitas', { exact: true }).last().click({ force: true }); await page.waitForTimeout(300);
      await page.getByPlaceholder('Contoh: 2.000.000').fill('300000');
      await page.getByText('Simpan', { exact: true }).last().click(); await page.waitForTimeout(1000);
      results.push(`budget_added=${(await page.getByText('Tagihan & Utilitas').count()) > 0}`);
    },
    shot('17_anggaran_tambah.png'),
    tapLabel('Pengaturan'), tapText('Akun'), shot('18_akun.png'),
    async (page) => { await page.getByLabel('Kembali').click(); await page.waitForTimeout(400); },
    tapText('Transaksi berulang & pengingat'), shot('19_berulang.png'),
    async (page) => { await page.getByLabel('Kembali').click(); await page.waitForTimeout(400); },
    tapText('Backup, restore, ekspor & impor'),
    tapText('Buat file backup'),
    async (page) => { const shared = await page.evaluate(() => window.__shared || []); results.push(`backup_shared=${shared.some((u) => u.endsWith('.json'))}`); },
    shot('20_backup.png'),
    async (page) => { await page.getByLabel('Kembali').click(); await page.waitForTimeout(400); },
    tapText('PIN & biometrik'), tapText('Buat PIN'),
    async (page) => { for (const d of '123456') { await page.getByLabel(d, { exact: true }).click(); } await page.waitForTimeout(400); for (const d of '123456') { await page.getByLabel(d, { exact: true }).click(); } await page.waitForTimeout(1500); },
    async (page) => { const h = dbCall('first', "SELECT value FROM app_settings WHERE key='pin_hash'", []); results.push(`pin_hashed=${!!h && h.value.length === 64 && h.value !== '123456'}`); },
    shot('21_keamanan.png'),
  ],
});

// 3) Dark mode on the same data
dbCall('run', "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('theme','dark')", []);
await session({ width: 390, height: 844, scheme: 'dark', name: 'dark', steps: [shot('15_kunci_pin_gelap.png'),
  async (page) => { for (const d of '123456') await page.getByLabel(d, { exact: true }).click(); await page.waitForTimeout(1500); results.push(`unlocked=${(await page.getByText('Masukkan PIN').count()) === 0}`); },
  shot('15b_dashboard_gelap.png'), tapLabel('Laporan'), shot('16_laporan_gelap.png')] });

await browser.close();
writeFileSync(path.join(out, 'result.json'), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ shots: results.length, errors }, null, 2));
