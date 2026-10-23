import type { Db } from './types';

/**
 * Ordered schema migrations. The applied version is tracked with PRAGMA user_version.
 * Never edit a released migration — append a new one.
 *
 * Design notes:
 * - Money is INTEGER rupiah.
 * - Account balances are NOT stored; they are derived from opening_balance + transactions,
 *   so editing or deleting a transaction can never leave a stale balance behind.
 * - A transfer is ONE row (type='transfer', account_id -> to_account_id). It is excluded from
 *   income/expense totals. A transfer fee is a separate 'expense' row linked via linked_tx_id.
 * - Recurring materialisation is idempotent thanks to UNIQUE(recurring_id, recurring_date).
 */
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash','bank','ewallet','credit_card','savings','other')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT '#0FA3A3',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    icon TEXT NOT NULL DEFAULT 'pricetag-outline',
    color TEXT NOT NULL DEFAULT '#64748B',
    parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    title TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '12:00',
    payment_method TEXT,
    note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    receipt_uri TEXT,
    linked_tx_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    recurring_id TEXT,
    recurring_date TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
        OR (type <> 'transfer' AND to_account_id IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_tx_to_account ON transactions(to_account_id);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_recurring ON transactions(recurring_id, recurring_date)
    WHERE recurring_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    month TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    UNIQUE (month, category_id)
  );

  CREATE TABLE IF NOT EXISTS recurring_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    title TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    payment_method TEXT,
    note TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
    interval_n INTEGER NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_date TEXT NOT NULL,
    anchor_day INTEGER NOT NULL DEFAULT 1,
    auto_post INTEGER NOT NULL DEFAULT 1,
    remind INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    notification_id TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.transaction(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
