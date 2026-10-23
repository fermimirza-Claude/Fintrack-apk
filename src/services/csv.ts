import { isValidDate, isValidTime, MONTHS_SHORT, MONTHS_LONG, toYMD, todayJakarta } from '../domain/dates';
import type { Account, Category, NewTransactionInput, PaymentMethod, TxType, TxView } from '../domain/types';
import { PAYMENT_METHOD_LABEL, TX_TYPE_LABEL } from '../domain/types';

// ---------------- writing ----------------
function esc(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const EXPORT_HEADERS = ['Tanggal', 'Waktu', 'Jenis', 'Nominal', 'Nama', 'Kategori', 'Akun', 'Akun Tujuan', 'Metode Pembayaran', 'Catatan', 'Tag'];

export function transactionsToCsv(rows: TxView[]): string {
  const lines = [EXPORT_HEADERS.join(',')];
  for (const t of rows) {
    lines.push([
      t.date, t.time, TX_TYPE_LABEL[t.type], t.amount, t.title, t.categoryName ?? '', t.accountName,
      t.toAccountName ?? '', t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod] : '', t.note, t.tags.join(' '),
    ].map(esc).join(','));
  }
  // BOM so Excel opens UTF-8 correctly
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ---------------- parsing ----------------
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ',';
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Parses "Rp1.250.000", "-1.250.000", "1,250,000.50", "1.250.000,50", "1250000". Returns signed integer rupiah. */
export function parseFlexibleAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '').replace(/^rp\.?/i, '').replace(/idr/i, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/^rp\.?/i, '');
  if (!/^[0-9.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = s;
  let frac = '';
  const decIdx = Math.max(lastDot, lastComma);
  if (decIdx >= 0) {
    const after = s.slice(decIdx + 1);
    const sep = s[decIdx];
    const bothKinds = lastDot >= 0 && lastComma >= 0;
    const sepCount = s.split(sep).length - 1;
    // Mixed separators: the last one is the decimal separator ("1.250.000,50" / "1,250,000.50").
    // Single kind: decimal only if it occurs once and is followed by 1–2 digits ("12,5"); else grouping ("1.250").
    const isDecimal = bothKinds ? after.length <= 2 : sepCount === 1 && after.length >= 1 && after.length <= 2;
    if (isDecimal) {
      intPart = s.slice(0, decIdx);
      frac = after;
    }
  }
  const digits = intPart.replace(/[.,]/g, '');
  if (!digits) return null;
  let n = parseInt(digits, 10);
  if (frac && parseInt(frac.padEnd(2, '0'), 10) >= 50) n += 1;
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTH_LOOKUP: Record<string, number> = {};
MONTHS_SHORT.forEach((m, i) => (MONTH_LOOKUP[m.toLowerCase()] = i + 1));
MONTHS_LONG.forEach((m, i) => (MONTH_LOOKUP[m.toLowerCase()] = i + 1));
['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].forEach((m, i) => (MONTH_LOOKUP[m] = i + 1));

/** Accepts 2026-10-23, 23/10/2026, 23-10-2026, 23.10.2026, 23 Okt 2026, 2026/10/23 (optionally followed by a time). */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim().split(/[ T]\d{1,2}:\d{2}/)[0].trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) { const v = toYMD(+m[1], +m[2], +m[3]); return isValidDate(v) ? v : null; }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const v = toYMD(y, +m[2], +m[1]);
    return isValidDate(v) ? v : null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_LOOKUP[m[2].toLowerCase()] ?? MONTH_LOOKUP[m[2].toLowerCase().slice(0, 3)];
    if (!mon) return null;
    const v = toYMD(+m[3], mon, +m[1]);
    return isValidDate(v) ? v : null;
  }
  return null;
}

export function parseFlexibleTime(raw: string): string | null {
  const m = raw.trim().match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const v = `${m[1].padStart(2, '0')}:${m[2]}`;
  return isValidTime(v) ? v : null;
}

export function parseTxType(raw: string): TxType | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (['income', 'pemasukan', 'masuk', 'in', 'kredit', 'cr', '+', 'debit masuk'].includes(s)) return 'income';
  if (['expense', 'pengeluaran', 'keluar', 'out', 'debit', 'db', '-'].includes(s)) return 'expense';
  if (['transfer', 'pindah', 'mutasi'].includes(s)) return 'transfer';
  if (s.startsWith('pemasukan') || s.startsWith('income')) return 'income';
  if (s.startsWith('pengeluaran') || s.startsWith('expense')) return 'expense';
  return null;
}

export function parsePaymentMethod(raw: string): PaymentMethod | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  for (const [k, label] of Object.entries(PAYMENT_METHOD_LABEL)) {
    if (s === k || s === label.toLowerCase()) return k as PaymentMethod;
  }
  if (s.includes('qris')) return 'qris';
  if (s.includes('tunai') || s === 'cash') return 'cash';
  if (s.includes('kredit')) return 'credit';
  if (s.includes('debit')) return 'debit';
  if (s.includes('wallet') || ['gopay', 'ovo', 'dana', 'shopeepay'].some((w) => s.includes(w))) return 'ewallet';
  if (s.includes('transfer')) return 'transfer';
  return 'other';
}

// ---------------- mapping & validation ----------------
export type ImportField = 'date' | 'time' | 'type' | 'amount' | 'title' | 'category' | 'account' | 'toAccount' | 'paymentMethod' | 'note' | 'tags';

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  date: 'Tanggal *', time: 'Waktu', type: 'Jenis', amount: 'Nominal *', title: 'Nama / deskripsi',
  category: 'Kategori', account: 'Akun', toAccount: 'Akun tujuan', paymentMethod: 'Metode pembayaran',
  note: 'Catatan', tags: 'Tag',
};

export type ColumnMapping = Partial<Record<ImportField, number>>;

const GUESS: Record<ImportField, RegExp> = {
  date: /^(tanggal|tgl|date|tanggal transaksi)$/i,
  time: /^(waktu|jam|time)$/i,
  type: /^(jenis|tipe|type|jenis transaksi)$/i,
  amount: /^(nominal|jumlah|amount|nilai|total)$/i,
  title: /^(nama|deskripsi|keterangan|description|title|uraian)$/i,
  category: /^(kategori|category)$/i,
  account: /^(akun|rekening|account|sumber dana|akun sumber)$/i,
  toAccount: /^(akun tujuan|tujuan|to account)$/i,
  paymentMethod: /^(metode|metode pembayaran|payment method|pembayaran)$/i,
  note: /^(catatan|note|notes|memo)$/i,
  tags: /^(tag|tags|label)$/i,
};

export function guessMapping(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {};
  headers.forEach((h, i) => {
    const name = h.trim();
    for (const f of Object.keys(GUESS) as ImportField[]) {
      if (map[f] === undefined && GUESS[f].test(name)) { map[f] = i; break; }
    }
  });
  return map;
}

export interface ImportRow {
  line: number; // 1-based line in file (header = 1)
  input: NewTransactionInput | null;
  errors: string[];
  duplicate: 'existing' | 'file' | null;
  categoryFallback: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  valid: number;
  invalid: number;
  duplicates: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function dupKey(t: { date: string; type: TxType; amount: number; title: string }) {
  return `${t.date}|${t.type}|${t.amount}|${norm(t.title)}`;
}

export function buildImportPlan(args: {
  rows: string[][]; // without header
  mapping: ColumnMapping;
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string;
  existingKeys: Set<string>;
}): ImportPlan {
  const { mapping, accounts, categories, defaultAccountId, existingKeys } = args;
  const accByName = new Map(accounts.map((a) => [norm(a.name), a.id]));
  const catByKindName = new Map(categories.map((c) => [`${c.kind}|${norm(c.name)}`, c.id]));
  const fallbackCat = {
    expense: categories.find((c) => c.id === 'cat_other_exp')?.id ?? categories.find((c) => c.kind === 'expense')?.id ?? null,
    income: categories.find((c) => c.id === 'cat_other_inc')?.id ?? categories.find((c) => c.kind === 'income')?.id ?? null,
  };
  const seen = new Set<string>();
  const get = (r: string[], f: ImportField) => (mapping[f] !== undefined ? (r[mapping[f]!] ?? '').trim() : '');
  const today = todayJakarta();

  const out: ImportRow[] = args.rows.map((r, idx) => {
    const errors: string[] = [];
    const date = parseFlexibleDate(get(r, 'date'));
    if (!date) errors.push('Tanggal tidak terbaca');
    else if (date > today) errors.push('Tanggal di masa depan');
    const signed = parseFlexibleAmount(get(r, 'amount'));
    if (signed === null || signed === 0) errors.push('Nominal tidak valid');
    let type = parseTxType(get(r, 'type'));
    if (!type && signed !== null) type = signed < 0 ? 'expense' : 'income';
    if (!type) errors.push('Jenis tidak dikenali');
    const amount = signed === null ? 0 : Math.abs(signed);
    const accName = get(r, 'account');
    const accountId = accName ? accByName.get(norm(accName)) : defaultAccountId;
    if (!accountId) errors.push(`Akun "${accName}" tidak ditemukan`);
    let toAccountId: string | null = null;
    let categoryId: string | null = null;
    let categoryFallback = false;
    if (type === 'transfer') {
      const toName = get(r, 'toAccount');
      toAccountId = toName ? accByName.get(norm(toName)) ?? null : null;
      if (!toAccountId) errors.push('Akun tujuan transfer tidak ditemukan');
      else if (toAccountId === accountId) errors.push('Akun sumber dan tujuan sama');
    } else if (type) {
      const catName = get(r, 'category');
      categoryId = catName ? catByKindName.get(`${type}|${norm(catName)}`) ?? null : null;
      if (!categoryId) { categoryId = fallbackCat[type]; categoryFallback = true; }
      if (!categoryId) errors.push('Tidak ada kategori yang cocok');
    }
    const title = get(r, 'title') || (type === 'income' ? 'Pemasukan' : type === 'transfer' ? 'Transfer antar akun' : 'Pengeluaran');
    const time = parseFlexibleTime(get(r, 'time')) ?? '12:00';
    if (errors.length || !date || !type || !accountId) {
      return { line: idx + 2, input: null, errors, duplicate: null, categoryFallback };
    }
    const input: NewTransactionInput = {
      type, amount, title, categoryId, accountId, toAccountId, date, time,
      paymentMethod: parsePaymentMethod(get(r, 'paymentMethod')), note: get(r, 'note'),
      tags: get(r, 'tags').split(/[ ,#]+/).filter(Boolean),
    };
    const key = dupKey(input);
    let duplicate: ImportRow['duplicate'] = null;
    if (existingKeys.has(key)) duplicate = 'existing';
    else if (seen.has(key)) duplicate = 'file';
    seen.add(key);
    return { line: idx + 2, input, errors, duplicate, categoryFallback };
  });
  const valid = out.filter((r) => r.input).length;
  return { rows: out, valid, invalid: out.length - valid, duplicates: out.filter((r) => r.duplicate).length };
}
