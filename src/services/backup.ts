import type { Db, SqlParam } from '../db/types';
import { SCHEMA_VERSION } from '../db/migrations';
import { nowIso } from '../domain/dates';

/** Columns per table, in insert order. Only these are read from a backup file (no arbitrary SQL). */
export const BACKUP_TABLES: { table: string; columns: string[]; order: string }[] = [
  { table: 'accounts', order: 'sort_order, created_at', columns: ['id', 'name', 'type', 'opening_balance', 'is_active', 'color', 'sort_order', 'is_demo', 'created_at'] },
  // parents before children
  { table: 'categories', order: '(parent_id IS NOT NULL), sort_order', columns: ['id', 'name', 'kind', 'icon', 'color', 'parent_id', 'is_archived', 'sort_order'] },
  // transfers/normal rows before linked fee rows
  { table: 'transactions', order: '(linked_tx_id IS NOT NULL), date, created_at', columns: ['id', 'type', 'amount', 'title', 'category_id', 'account_id', 'to_account_id', 'date', 'time', 'payment_method', 'note', 'tags', 'receipt_uri', 'linked_tx_id', 'recurring_id', 'recurring_date', 'is_demo', 'created_at', 'updated_at'] },
  { table: 'budgets', order: 'month', columns: ['id', 'month', 'category_id', 'amount'] },
  { table: 'recurring_transactions', order: 'next_date', columns: ['id', 'type', 'amount', 'title', 'category_id', 'account_id', 'to_account_id', 'payment_method', 'note', 'frequency', 'interval_n', 'start_date', 'end_date', 'next_date', 'anchor_day', 'auto_post', 'remind', 'is_active', 'notification_id', 'is_demo'] },
  { table: 'app_settings', order: 'key', columns: ['key', 'value'] },
];

/** Security material is never written into a backup file. */
const EXCLUDED_SETTINGS = new Set(['pin_hash', 'pin_salt', 'biometric_enabled', 'lock_enabled']);

export interface BackupFile {
  app: 'FinTrack';
  format: 1;
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, Record<string, SqlParam>[]>;
}

export async function createBackup(db: Db): Promise<BackupFile> {
  const data: BackupFile['data'] = {};
  for (const t of BACKUP_TABLES) {
    const rows = await db.all<Record<string, SqlParam>>(`SELECT ${t.columns.join(', ')} FROM ${t.table} ORDER BY ${t.order}`);
    data[t.table] = t.table === 'app_settings' ? rows.filter((r) => !EXCLUDED_SETTINGS.has(String(r.key))) : rows;
  }
  return { app: 'FinTrack', format: 1, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), data };
}

export interface BackupSummary {
  accounts: number;
  categories: number;
  transactions: number;
  budgets: number;
  recurring: number;
  exportedAt: string;
}

export class BackupError extends Error {}

/** Parses and validates a backup. Throws BackupError with an Indonesian message if invalid. */
export function parseBackup(text: string): { backup: BackupFile; summary: BackupSummary } {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError('File bukan JSON yang valid.');
  }
  if (!obj || obj.app !== 'FinTrack' || typeof obj.data !== 'object') throw new BackupError('File ini bukan backup FinTrack.');
  if (obj.schemaVersion > SCHEMA_VERSION) throw new BackupError('Backup dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi terlebih dulu.');
  for (const t of BACKUP_TABLES) {
    const rows = obj.data[t.table] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`Data ${t.table} rusak.`);
    for (const r of rows) {
      if (!r || typeof r !== 'object') throw new BackupError(`Baris ${t.table} rusak.`);
      for (const c of t.columns) {
        const v = r[c];
        if (v !== undefined && v !== null && typeof v !== 'string' && typeof v !== 'number') {
          throw new BackupError(`Nilai kolom ${t.table}.${c} tidak valid.`);
        }
      }
    }
    obj.data[t.table] = rows;
  }
  // Referential sanity check
  const accIds = new Set(obj.data.accounts.map((a: any) => a.id));
  const catIds = new Set(obj.data.categories.map((c: any) => c.id));
  for (const tx of obj.data.transactions) {
    if (!accIds.has(tx.account_id) || (tx.to_account_id && !accIds.has(tx.to_account_id))) {
      throw new BackupError('Backup tidak konsisten: ada transaksi yang merujuk akun yang tidak ada.');
    }
    if (tx.category_id && !catIds.has(tx.category_id)) tx.category_id = null;
  }
  for (const b of obj.data.budgets) {
    if (!catIds.has(b.category_id)) throw new BackupError('Backup tidak konsisten: anggaran merujuk kategori yang tidak ada.');
  }
  const summary: BackupSummary = {
    accounts: obj.data.accounts.length,
    categories: obj.data.categories.length,
    transactions: obj.data.transactions.length,
    budgets: obj.data.budgets.length,
    recurring: obj.data.recurring_transactions.length,
    exportedAt: String(obj.exportedAt ?? ''),
  };
  return { backup: obj as BackupFile, summary };
}

/**
 * Restores a backup atomically.
 * - 'replace': all current data is deleted first (security settings are kept).
 * - 'merge': rows whose id already exists are left untouched; new rows are added.
 */
export async function restoreBackup(db: Db, backup: BackupFile, mode: 'replace' | 'merge'): Promise<void> {
  await db.transaction(async () => {
    if (mode === 'replace') {
      await db.run('DELETE FROM transactions WHERE linked_tx_id IS NOT NULL');
      await db.run('DELETE FROM transactions');
      await db.run('DELETE FROM recurring_transactions');
      await db.run('DELETE FROM budgets');
      await db.run('DELETE FROM accounts');
      await db.run('DELETE FROM categories WHERE parent_id IS NOT NULL');
      await db.run('DELETE FROM categories');
      const keep = Array.from(EXCLUDED_SETTINGS).map(() => '?').join(',');
      await db.run(`DELETE FROM app_settings WHERE key NOT IN (${keep})`, Array.from(EXCLUDED_SETTINGS));
    }
    for (const t of BACKUP_TABLES) {
      const rows = backup.data[t.table] ?? [];
      const verb = t.table === 'app_settings' && mode === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
      const sql = `${verb} INTO ${t.table} (${t.columns.join(', ')}) VALUES (${t.columns.map(() => '?').join(', ')})`;
      for (const r of rows) {
        if (t.table === 'app_settings' && EXCLUDED_SETTINGS.has(String(r.key))) continue;
        const params = t.columns.map((c) => (r[c] === undefined ? defaultFor(t.table, c) : r[c]));
        await db.run(sql, params);
      }
    }
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('seeded', '1')");
  });
}

function defaultFor(table: string, col: string): SqlParam {
  if (['is_active', 'auto_post'].includes(col)) return 1;
  if (['is_demo', 'is_archived', 'remind', 'sort_order'].includes(col)) return 0;
  if (col === 'interval_n') return 1;
  if (['note', 'tags'].includes(col)) return '';
  if (col === 'time') return '12:00';
  if (['created_at', 'updated_at'].includes(col)) return nowIso();
  if (table === 'categories' && col === 'icon') return 'pricetag-outline';
  if (col === 'color') return '#64748B';
  return null;
}
