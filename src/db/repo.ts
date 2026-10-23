import { addDays, isValidDate, isValidTime, monthRange, nowIso, shiftMonth, todayJakarta } from '../domain/dates';
import { anchorDayOf, dueOccurrences, nextOccurrence } from '../domain/recurring';
import type {
  Account, AccountType, AccountWithBalance, Budget, Category, CategoryKind, Frequency,
  NewTransactionInput, PaymentMethod, RecurringRule, Transaction, TxFilter, TxType, TxView,
} from '../domain/types';
import { DEFAULT_CATEGORIES } from './seed';
import { newId, type Db, type SqlParam } from './types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ---------- row mappers ----------
type Row = Record<string, any>;

const mapAccount = (r: Row): Account => ({
  id: r.id, name: r.name, type: r.type, openingBalance: Number(r.opening_balance),
  isActive: !!r.is_active, color: r.color, sortOrder: Number(r.sort_order), isDemo: !!r.is_demo,
  createdAt: r.created_at,
});

const mapCategory = (r: Row): Category => ({
  id: r.id, name: r.name, kind: r.kind, icon: r.icon, color: r.color, parentId: r.parent_id ?? null,
  isArchived: !!r.is_archived, sortOrder: Number(r.sort_order),
});

const mapTx = (r: Row): Transaction => ({
  id: r.id, type: r.type, amount: Number(r.amount), title: r.title, categoryId: r.category_id ?? null,
  accountId: r.account_id, toAccountId: r.to_account_id ?? null, date: r.date, time: r.time,
  paymentMethod: r.payment_method ?? null, note: r.note ?? '',
  tags: r.tags ? String(r.tags).split(',').filter(Boolean) : [], receiptUri: r.receipt_uri ?? null,
  linkedTxId: r.linked_tx_id ?? null, recurringId: r.recurring_id ?? null, recurringDate: r.recurring_date ?? null,
  isDemo: !!r.is_demo, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapTxView = (r: Row): TxView => ({
  ...mapTx(r),
  categoryName: r.category_name ?? null, categoryIcon: r.category_icon ?? null,
  categoryColor: r.category_color ?? null, parentCategoryId: r.parent_category_id ?? null,
  accountName: r.account_name ?? '', toAccountName: r.to_account_name ?? null,
});

const mapBudget = (r: Row): Budget => ({ id: r.id, month: r.month, categoryId: r.category_id, amount: Number(r.amount) });

const mapRule = (r: Row): RecurringRule => ({
  id: r.id, type: r.type, amount: Number(r.amount), title: r.title, categoryId: r.category_id ?? null,
  accountId: r.account_id, toAccountId: r.to_account_id ?? null, paymentMethod: r.payment_method ?? null,
  note: r.note ?? '', frequency: r.frequency, interval: Number(r.interval_n), startDate: r.start_date,
  endDate: r.end_date ?? null, nextDate: r.next_date, anchorDay: Number(r.anchor_day), autoPost: !!r.auto_post,
  remind: !!r.remind, isActive: !!r.is_active, notificationId: r.notification_id ?? null, isDemo: !!r.is_demo,
});

const TX_VIEW_SELECT = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         c.parent_id AS parent_category_id, a.name AS account_name, ta.name AS to_account_name
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id`;

/** SQL expression for "effect of transaction t on account X's balance" */
const BALANCE_SQL = `
  a.opening_balance
  + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
              FROM transactions t WHERE t.account_id = a.id AND t.date <= ?), 0)
  + COALESCE((SELECT SUM(t.amount) FROM transactions t
              WHERE t.type = 'transfer' AND t.to_account_id = a.id AND t.date <= ?), 0)`;

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  count: number;
}

export interface BudgetStatus extends Budget {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  spent: number;
  remaining: number;
  percent: number;
  status: 'safe' | 'warning' | 'over';
}

export interface DailyFlow {
  date: string;
  income: number;
  expense: number;
}

export function budgetStatusOf(spent: number, limit: number): 'safe' | 'warning' | 'over' {
  if (limit <= 0) return 'safe';
  const p = (spent / limit) * 100;
  if (p >= 100) return 'over';
  if (p >= 80) return 'warning';
  return 'safe';
}

export class Repo {
  constructor(private db: Db) {}

  get raw(): Db {
    return this.db;
  }

  // ================= settings =================
  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.first<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
    return r ? r.value : null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    await this.db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
  async deleteSetting(key: string): Promise<void> {
    await this.db.run('DELETE FROM app_settings WHERE key = ?', [key]);
  }
  async allSettings(): Promise<Record<string, string>> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM app_settings');
    const out: Record<string, string> = {};
    rows.forEach((r) => (out[r.key] = r.value));
    return out;
  }

  // ================= bootstrap =================
  /** Creates default categories and a cash account on first launch. Idempotent. */
  async ensureSeed(): Promise<void> {
    const seeded = await this.getSetting('seeded');
    if (seeded) return;
    await this.db.transaction(async () => {
      await this.insertDefaultCategories();
      const accCount = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
      if (!accCount || accCount.n === 0) {
        await this.db.run(
          'INSERT INTO accounts (id, name, type, opening_balance, is_active, color, sort_order, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          ['acc_cash', 'Dompet', 'cash', 0, 1, '#0FA3A3', 0, 0, nowIso()],
        );
      }
      await this.setSetting('seeded', '1');
    });
  }

  private async insertDefaultCategories() {
    let order = 0;
    for (const c of DEFAULT_CATEGORIES) {
      const id = 'cat_' + c.key;
      await this.db.run(
        'INSERT OR IGNORE INTO categories (id, name, kind, icon, color, parent_id, is_archived, sort_order) VALUES (?,?,?,?,?,NULL,0,?)',
        [id, c.name, c.kind, c.icon, c.color, order++],
      );
      let sub = 0;
      for (const child of c.children ?? []) {
        await this.db.run(
          'INSERT OR IGNORE INTO categories (id, name, kind, icon, color, parent_id, is_archived, sort_order) VALUES (?,?,?,?,?,?,0,?)',
          [`${id}_${++sub}`, child, c.kind, c.icon, c.color, id, sub],
        );
      }
    }
  }

  // ================= accounts =================
  async listAccounts(includeInactive = true): Promise<Account[]> {
    const rows = await this.db.all<Row>(
      `SELECT * FROM accounts ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, created_at`,
    );
    return rows.map(mapAccount);
  }

  async accountsWithBalance(asOf: string = '9999-12-31', includeInactive = true): Promise<AccountWithBalance[]> {
    const rows = await this.db.all<Row>(
      `SELECT a.*, (${BALANCE_SQL}) AS balance FROM accounts a
       ${includeInactive ? '' : 'WHERE a.is_active = 1'} ORDER BY a.sort_order, a.created_at`,
      [asOf, asOf],
    );
    return rows.map((r) => ({ ...mapAccount(r), balance: Number(r.balance) }));
  }

  /** Total of all account balances (credit-card debt is negative and reduces the total). */
  async totalBalance(asOf: string = '9999-12-31'): Promise<number> {
    const r = await this.db.first<{ total: number }>(
      `SELECT COALESCE(SUM(${BALANCE_SQL}), 0) AS total FROM accounts a`,
      [asOf, asOf],
    );
    return Number(r?.total ?? 0);
  }

  async createAccount(input: { name: string; type: AccountType; openingBalance: number; color?: string; isDemo?: boolean }): Promise<string> {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Nama akun wajib diisi.');
    if (!Number.isInteger(input.openingBalance)) throw new ValidationError('Saldo awal tidak valid.');
    const id = newId();
    const order = await this.db.first<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM accounts');
    await this.db.run(
      'INSERT INTO accounts (id, name, type, opening_balance, is_active, color, sort_order, is_demo, created_at) VALUES (?,?,?,?,1,?,?,?,?)',
      [id, name, input.type, input.openingBalance, input.color ?? '#0FA3A3', order?.n ?? 0, input.isDemo ? 1 : 0, nowIso()],
    );
    return id;
  }

  async updateAccount(id: string, patch: { name?: string; type?: AccountType; openingBalance?: number; color?: string; isActive?: boolean }) {
    const cur = await this.db.first<Row>('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!cur) throw new ValidationError('Akun tidak ditemukan.');
    const a = mapAccount(cur);
    const name = (patch.name ?? a.name).trim();
    if (!name) throw new ValidationError('Nama akun wajib diisi.');
    const opening = patch.openingBalance ?? a.openingBalance;
    if (!Number.isInteger(opening)) throw new ValidationError('Saldo awal tidak valid.');
    await this.db.run(
      'UPDATE accounts SET name = ?, type = ?, opening_balance = ?, color = ?, is_active = ? WHERE id = ?',
      [name, patch.type ?? a.type, opening, patch.color ?? a.color, (patch.isActive ?? a.isActive) ? 1 : 0, id],
    );
  }

  async accountTxCount(id: string): Promise<number> {
    const r = await this.db.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?', [id, id]);
    return Number(r?.n ?? 0);
  }

  /** Deletes an account only when nothing references it; otherwise the UI should deactivate it. */
  async deleteAccount(id: string): Promise<void> {
    if ((await this.accountTxCount(id)) > 0) {
      throw new ValidationError('Akun masih memiliki transaksi. Nonaktifkan akun sebagai gantinya.');
    }
    const n = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
    if ((n?.n ?? 0) <= 1) throw new ValidationError('Minimal harus ada satu akun.');
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM recurring_transactions WHERE account_id = ? OR to_account_id = ?', [id, id]);
      await this.db.run('DELETE FROM accounts WHERE id = ?', [id]);
    });
  }

  // ================= categories =================
  async listCategories(kind?: CategoryKind, includeArchived = false): Promise<Category[]> {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (kind) { where.push('kind = ?'); params.push(kind); }
    if (!includeArchived) where.push('is_archived = 0');
    const rows = await this.db.all<Row>(
      `SELECT * FROM categories ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort_order, name`,
      params,
    );
    return rows.map(mapCategory);
  }

  async createCategory(input: { name: string; kind: CategoryKind; icon: string; color: string; parentId?: string | null }): Promise<string> {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Nama kategori wajib diisi.');
    if (input.parentId) {
      const p = await this.db.first<Row>('SELECT * FROM categories WHERE id = ?', [input.parentId]);
      if (!p) throw new ValidationError('Kategori induk tidak ditemukan.');
      if (p.parent_id) throw new ValidationError('Subkategori hanya boleh satu tingkat.');
      if (p.kind !== input.kind) throw new ValidationError('Jenis subkategori harus sama dengan induknya.');
    }
    const id = newId();
    const order = await this.db.first<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories');
    await this.db.run(
      'INSERT INTO categories (id, name, kind, icon, color, parent_id, is_archived, sort_order) VALUES (?,?,?,?,?,?,0,?)',
      [id, name, input.kind, input.icon, input.color, input.parentId ?? null, order?.n ?? 0],
    );
    return id;
  }

  async updateCategory(id: string, patch: { name?: string; icon?: string; color?: string; isArchived?: boolean }) {
    const cur = await this.db.first<Row>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cur) throw new ValidationError('Kategori tidak ditemukan.');
    const c = mapCategory(cur);
    const name = (patch.name ?? c.name).trim();
    if (!name) throw new ValidationError('Nama kategori wajib diisi.');
    await this.db.run('UPDATE categories SET name = ?, icon = ?, color = ?, is_archived = ? WHERE id = ?', [
      name, patch.icon ?? c.icon, patch.color ?? c.color, (patch.isArchived ?? c.isArchived) ? 1 : 0, id,
    ]);
  }

  async categoryUsage(id: string): Promise<number> {
    const r = await this.db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?
          OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`, [id, id]);
    return Number(r?.n ?? 0);
  }

  /** Deletes unused categories; used ones must be archived so history keeps its labels. */
  async deleteCategory(id: string): Promise<void> {
    if ((await this.categoryUsage(id)) > 0) {
      throw new ValidationError('Kategori sudah dipakai transaksi. Arsipkan kategori sebagai gantinya.');
    }
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM budgets WHERE category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)', [id, id]);
      await this.db.run('DELETE FROM categories WHERE parent_id = ?', [id]);
      await this.db.run('DELETE FROM categories WHERE id = ?', [id]);
    });
  }

  // ================= transactions =================
  private async validateTx(input: NewTransactionInput): Promise<void> {
    if (!['income', 'expense', 'transfer'].includes(input.type)) throw new ValidationError('Jenis transaksi tidak valid.');
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationError('Nominal harus lebih dari Rp0.');
    if (input.amount > 999_999_999_999) throw new ValidationError('Nominal terlalu besar.');
    if (!isValidDate(input.date)) throw new ValidationError('Tanggal tidak valid.');
    if (!isValidTime(input.time)) throw new ValidationError('Waktu tidak valid.');
    const acc = await this.db.first<Row>('SELECT * FROM accounts WHERE id = ?', [input.accountId]);
    if (!acc) throw new ValidationError('Akun wajib dipilih.');
    if (input.type === 'transfer') {
      if (!input.toAccountId) throw new ValidationError('Akun tujuan wajib dipilih.');
      if (input.toAccountId === input.accountId) throw new ValidationError('Akun sumber dan tujuan tidak boleh sama.');
      const to = await this.db.first<Row>('SELECT id FROM accounts WHERE id = ?', [input.toAccountId]);
      if (!to) throw new ValidationError('Akun tujuan tidak ditemukan.');
      if (input.fee !== undefined && (!Number.isInteger(input.fee) || input.fee < 0)) throw new ValidationError('Biaya transfer tidak valid.');
    } else {
      if (!input.categoryId) throw new ValidationError('Kategori wajib dipilih.');
      const cat = await this.db.first<Row>('SELECT * FROM categories WHERE id = ?', [input.categoryId]);
      if (!cat) throw new ValidationError('Kategori tidak ditemukan.');
      if (cat.kind !== input.type) throw new ValidationError('Kategori tidak sesuai dengan jenis transaksi.');
    }
  }

  private defaultTitle(input: NewTransactionInput): string {
    if (input.title.trim()) return input.title.trim();
    return input.type === 'transfer' ? 'Transfer antar akun' : input.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  }

  private async insertTxRow(id: string, input: NewTransactionInput, linkedTxId: string | null) {
    const now = nowIso();
    await this.db.run(
      `INSERT INTO transactions (id, type, amount, title, category_id, account_id, to_account_id, date, time,
         payment_method, note, tags, receipt_uri, linked_tx_id, recurring_id, recurring_date, is_demo, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, input.type, input.amount, this.defaultTitle(input),
        input.type === 'transfer' ? null : input.categoryId, input.accountId,
        input.type === 'transfer' ? input.toAccountId ?? null : null,
        input.date, input.time, input.paymentMethod ?? null, (input.note ?? '').trim(),
        (input.tags ?? []).map((t) => t.trim().replace(/,/g, ' ')).filter(Boolean).join(','),
        input.receiptUri ?? null, linkedTxId, input.recurringId ?? null, input.recurringDate ?? null,
        input.isDemo ? 1 : 0, now, now,
      ],
    );
  }

  private async insertFee(parentId: string, input: NewTransactionInput) {
    if (input.type !== 'transfer' || !input.fee || input.fee <= 0) return;
    const feeCat = input.feeCategoryId ?? (await this.feeCategoryId());
    await this.insertTxRow(newId(), {
      type: 'expense', amount: input.fee, title: 'Biaya transfer', categoryId: feeCat,
      accountId: input.accountId, date: input.date, time: input.time, paymentMethod: 'transfer',
      note: '', tags: [], isDemo: input.isDemo,
    }, parentId);
  }

  private async feeCategoryId(): Promise<string> {
    const r = await this.db.first<{ id: string }>("SELECT id FROM categories WHERE id = 'cat_fees'");
    if (r) return r.id;
    const any = await this.db.first<{ id: string }>("SELECT id FROM categories WHERE kind = 'expense' ORDER BY sort_order LIMIT 1");
    if (!any) throw new ValidationError('Tidak ada kategori pengeluaran untuk biaya transfer.');
    return any.id;
  }

  /** Creates a transaction. A transfer with a fee writes both rows atomically. */
  async createTransaction(input: NewTransactionInput): Promise<string> {
    await this.validateTx(input);
    const id = newId();
    await this.db.transaction(async () => {
      await this.insertTxRow(id, input, null);
      await this.insertFee(id, input);
    });
    return id;
  }

  async getTransaction(id: string): Promise<(TxView & { fee: number }) | null> {
    const r = await this.db.first<Row>(`${TX_VIEW_SELECT} WHERE t.id = ?`, [id]);
    if (!r) return null;
    const fee = await this.db.first<{ amount: number }>('SELECT COALESCE(SUM(amount),0) AS amount FROM transactions WHERE linked_tx_id = ?', [id]);
    return { ...mapTxView(r), fee: Number(fee?.amount ?? 0) };
  }

  async updateTransaction(id: string, input: NewTransactionInput): Promise<void> {
    const cur = await this.db.first<Row>('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!cur) throw new ValidationError('Transaksi tidak ditemukan.');
    if (cur.linked_tx_id) throw new ValidationError('Biaya transfer diubah melalui transaksi transfernya.');
    await this.validateTx(input);
    await this.db.transaction(async () => {
      await this.db.run(
        `UPDATE transactions SET type = ?, amount = ?, title = ?, category_id = ?, account_id = ?, to_account_id = ?,
           date = ?, time = ?, payment_method = ?, note = ?, tags = ?, receipt_uri = ?, updated_at = ? WHERE id = ?`,
        [
          input.type, input.amount, this.defaultTitle(input), input.type === 'transfer' ? null : input.categoryId,
          input.accountId, input.type === 'transfer' ? input.toAccountId ?? null : null, input.date, input.time,
          input.paymentMethod ?? null, (input.note ?? '').trim(),
          (input.tags ?? []).map((t) => t.trim().replace(/,/g, ' ')).filter(Boolean).join(','),
          input.receiptUri ?? null, nowIso(), id,
        ],
      );
      // Re-create the fee row so it always mirrors the transfer's account/date.
      await this.db.run('DELETE FROM transactions WHERE linked_tx_id = ?', [id]);
      await this.insertFee(id, { ...input, isDemo: !!cur.is_demo });
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM transactions WHERE linked_tx_id = ?', [id]);
      await this.db.run('DELETE FROM transactions WHERE id = ?', [id]);
    });
  }

  async duplicateTransaction(id: string, date = todayJakarta(), time?: string): Promise<string> {
    const t = await this.getTransaction(id);
    if (!t) throw new ValidationError('Transaksi tidak ditemukan.');
    return this.createTransaction({
      type: t.type, amount: t.amount, title: t.title, categoryId: t.categoryId, accountId: t.accountId,
      toAccountId: t.toAccountId, date, time: time ?? t.time, paymentMethod: t.paymentMethod, note: t.note,
      tags: t.tags, receiptUri: null, fee: t.type === 'transfer' ? t.fee : undefined,
    });
  }

  async listTransactions(f: TxFilter = {}): Promise<TxView[]> {
    const where: string[] = [];
    const p: SqlParam[] = [];
    if (f.from) { where.push('t.date >= ?'); p.push(f.from); }
    if (f.to) { where.push('t.date <= ?'); p.push(f.to); }
    if (f.type) { where.push('t.type = ?'); p.push(f.type); }
    if (f.accountId) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); p.push(f.accountId, f.accountId); }
    if (f.categoryIds && f.categoryIds.length) {
      const qs = f.categoryIds.map(() => '?').join(',');
      where.push(`(t.category_id IN (${qs}) OR c.parent_id IN (${qs}))`);
      p.push(...f.categoryIds, ...f.categoryIds);
    }
    if (f.minAmount !== undefined) { where.push('t.amount >= ?'); p.push(f.minAmount); }
    if (f.maxAmount !== undefined) { where.push('t.amount <= ?'); p.push(f.maxAmount); }
    if (f.search && f.search.trim()) {
      const q = '%' + f.search.trim().toLowerCase().replace(/[%_]/g, '') + '%';
      where.push('(LOWER(t.title) LIKE ? OR LOWER(t.note) LIKE ? OR LOWER(t.tags) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ? OR LOWER(a.name) LIKE ?)');
      p.push(q, q, q, q, q);
    }
    const order =
      f.sort === 'oldest' ? 't.date ASC, t.time ASC, t.created_at ASC'
        : f.sort === 'largest' ? 't.amount DESC, t.date DESC'
          : 't.date DESC, t.time DESC, t.created_at DESC';
    const sql = `${TX_VIEW_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} ${f.limit ? 'LIMIT ' + Math.floor(f.limit) : ''}`;
    const rows = await this.db.all<Row>(sql, p);
    return rows.map(mapTxView);
  }

  async transactionCount(): Promise<number> {
    const r = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
    return Number(r?.n ?? 0);
  }

  async firstTransactionDate(): Promise<string | null> {
    const r = await this.db.first<{ d: string | null }>("SELECT MIN(date) AS d FROM transactions");
    return r?.d ?? null;
  }

  // ================= aggregations =================
  /** Income/expense totals. Transfers are excluded by definition; transfer fees are ordinary expenses. */
  async totals(from: string, to: string, accountId?: string): Promise<Totals> {
    const r = await this.db.first<Row>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense,
              COUNT(CASE WHEN type <> 'transfer' THEN 1 END) AS cnt
       FROM transactions WHERE date >= ? AND date <= ? ${accountId ? 'AND account_id = ?' : ''}`,
      accountId ? [from, to, accountId] : [from, to],
    );
    const income = Number(r?.income ?? 0);
    const expense = Number(r?.expense ?? 0);
    return { income, expense, net: income - expense, count: Number(r?.cnt ?? 0) };
  }

  /** Totals grouped by top-level category (subcategories roll up into their parent). */
  async totalsByCategory(from: string, to: string, kind: CategoryKind, detail = false): Promise<CategoryTotal[]> {
    const groupExpr = detail ? 't.category_id' : 'COALESCE(c.parent_id, t.category_id)';
    const rows = await this.db.all<Row>(
      `SELECT ${groupExpr} AS gid, SUM(t.amount) AS amount, COUNT(*) AS cnt
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = ? AND t.date >= ? AND t.date <= ?
       GROUP BY gid ORDER BY amount DESC`,
      [kind, from, to],
    );
    const cats = new Map((await this.listCategories(undefined, true)).map((c) => [c.id, c]));
    return rows.map((r) => {
      const c = r.gid ? cats.get(r.gid) : undefined;
      return {
        categoryId: r.gid ?? null, name: c?.name ?? 'Tanpa kategori', icon: c?.icon ?? 'help-circle-outline',
        color: c?.color ?? '#94A3B8', amount: Number(r.amount), count: Number(r.cnt),
      };
    });
  }

  async expenseByAccount(from: string, to: string): Promise<{ accountId: string; name: string; color: string; amount: number }[]> {
    const rows = await this.db.all<Row>(
      `SELECT a.id, a.name, a.color, SUM(t.amount) AS amount FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ? GROUP BY a.id ORDER BY amount DESC`, [from, to]);
    return rows.map((r) => ({ accountId: r.id, name: r.name, color: r.color, amount: Number(r.amount) }));
  }

  async expenseByPaymentMethod(from: string, to: string): Promise<{ method: PaymentMethod | null; amount: number }[]> {
    const rows = await this.db.all<Row>(
      `SELECT payment_method AS m, SUM(amount) AS amount FROM transactions
       WHERE type = 'expense' AND date >= ? AND date <= ? GROUP BY payment_method ORDER BY amount DESC`, [from, to]);
    return rows.map((r) => ({ method: r.m ?? null, amount: Number(r.amount) }));
  }

  async dailyFlows(from: string, to: string): Promise<DailyFlow[]> {
    const rows = await this.db.all<Row>(
      `SELECT date, COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
       FROM transactions WHERE date >= ? AND date <= ? AND type <> 'transfer' GROUP BY date ORDER BY date`, [from, to]);
    return rows.map((r) => ({ date: r.date, income: Number(r.income), expense: Number(r.expense) }));
  }

  /** Days that have at least one transaction of any kind (for the calendar). */
  async activityDays(from: string, to: string): Promise<{ date: string; income: number; expense: number; transfers: number }[]> {
    const rows = await this.db.all<Row>(
      `SELECT date, COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense,
              COUNT(CASE WHEN type='transfer' THEN 1 END) AS transfers
       FROM transactions WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`, [from, to]);
    return rows.map((r) => ({ date: r.date, income: Number(r.income), expense: Number(r.expense), transfers: Number(r.transfers) }));
  }

  async activeDayCount(from: string, to: string): Promise<number> {
    const r = await this.db.first<{ n: number }>('SELECT COUNT(DISTINCT date) AS n FROM transactions WHERE date >= ? AND date <= ?', [from, to]);
    return Number(r?.n ?? 0);
  }

  async topTransactions(from: string, to: string, type: TxType, limit = 10): Promise<TxView[]> {
    return this.listTransactions({ from, to, type, sort: 'largest', limit });
  }

  /** Daily end-of-day total balance across all accounts, for trend charts. */
  async balanceSeries(from: string, to: string): Promise<{ date: string; balance: number }[]> {
    const start = await this.totalBalance(addDays(from, -1));
    const flows = await this.dailyFlows(from, to);
    const byDate = new Map(flows.map((f) => [f.date, f.income - f.expense]));
    const out: { date: string; balance: number }[] = [];
    let bal = start;
    let cur = from;
    let guard = 0;
    while (cur <= to && guard++ < 4000) {
      bal += byDate.get(cur) ?? 0;
      out.push({ date: cur, balance: bal });
      cur = addDays(cur, 1);
    }
    return out;
  }

  // ================= budgets =================
  async budgetStatuses(month: string): Promise<BudgetStatus[]> {
    const { from, to } = monthRange(month);
    const rows = await this.db.all<Row>(
      `SELECT b.*, c.name AS cname, c.icon AS cicon, c.color AS ccolor,
         COALESCE((SELECT SUM(t.amount) FROM transactions t LEFT JOIN categories tc ON tc.id = t.category_id
                   WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
                     AND (t.category_id = b.category_id OR tc.parent_id = b.category_id)), 0) AS spent
       FROM budgets b JOIN categories c ON c.id = b.category_id
       WHERE b.month = ? ORDER BY c.sort_order, c.name`,
      [from, to, month],
    );
    return rows.map((r) => {
      const b = mapBudget(r);
      const spent = Number(r.spent);
      return {
        ...b, categoryName: r.cname, categoryIcon: r.cicon, categoryColor: r.ccolor, spent,
        remaining: b.amount - spent, percent: b.amount > 0 ? (spent / b.amount) * 100 : 0,
        status: budgetStatusOf(spent, b.amount),
      };
    });
  }

  async upsertBudget(month: string, categoryId: string, amount: number): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('Bulan tidak valid.');
    if (!Number.isInteger(amount) || amount <= 0) throw new ValidationError('Batas anggaran harus lebih dari Rp0.');
    const cat = await this.db.first<Row>('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (!cat || cat.kind !== 'expense') throw new ValidationError('Pilih kategori pengeluaran.');
    await this.db.run(
      `INSERT INTO budgets (id, month, category_id, amount) VALUES (?,?,?,?)
       ON CONFLICT(month, category_id) DO UPDATE SET amount = excluded.amount`,
      [newId(), month, categoryId, amount],
    );
  }

  async deleteBudget(id: string): Promise<void> {
    await this.db.run('DELETE FROM budgets WHERE id = ?', [id]);
  }

  /** Copies budgets from one month to another. Existing budgets in the target month are kept. Returns copied count. */
  async copyBudgets(fromMonth: string, toMonth: string): Promise<number> {
    const src = await this.db.all<Row>('SELECT * FROM budgets WHERE month = ?', [fromMonth]);
    let copied = 0;
    await this.db.transaction(async () => {
      for (const b of src) {
        const res = await this.db.run(
          'INSERT OR IGNORE INTO budgets (id, month, category_id, amount) VALUES (?,?,?,?)',
          [newId(), toMonth, b.category_id, b.amount],
        );
        copied += res.changes;
      }
    });
    return copied;
  }

  async budgetSummary(month: string): Promise<{ limit: number; spent: number; percent: number | null; count: number }> {
    const list = await this.budgetStatuses(month);
    const limit = list.reduce((s, b) => s + b.amount, 0);
    const spent = list.reduce((s, b) => s + b.spent, 0);
    return { limit, spent, percent: limit > 0 ? (spent / limit) * 100 : null, count: list.length };
  }

  previousMonth(month: string) {
    return shiftMonth(month, -1);
  }

  // ================= recurring =================
  async listRecurring(): Promise<RecurringRule[]> {
    const rows = await this.db.all<Row>('SELECT * FROM recurring_transactions ORDER BY is_active DESC, next_date ASC');
    return rows.map(mapRule);
  }

  async getRecurring(id: string): Promise<RecurringRule | null> {
    const r = await this.db.first<Row>('SELECT * FROM recurring_transactions WHERE id = ?', [id]);
    return r ? mapRule(r) : null;
  }

  async saveRecurring(input: {
    id?: string; type: TxType; amount: number; title: string; categoryId: string | null; accountId: string;
    toAccountId?: string | null; paymentMethod?: PaymentMethod | null; note?: string; frequency: Frequency;
    interval: number; startDate: string; endDate?: string | null; autoPost: boolean; remind: boolean; isActive?: boolean;
    isDemo?: boolean;
  }): Promise<string> {
    // Validate through the same rules as a normal transaction.
    await this.validateTx({
      type: input.type, amount: input.amount, title: input.title, categoryId: input.categoryId,
      accountId: input.accountId, toAccountId: input.toAccountId, date: input.startDate, time: '08:00',
    });
    if (!input.title.trim()) throw new ValidationError('Nama transaksi berulang wajib diisi.');
    if (input.endDate && (!isValidDate(input.endDate) || input.endDate < input.startDate)) {
      throw new ValidationError('Tanggal berakhir harus setelah tanggal mulai.');
    }
    const interval = Math.max(1, Math.floor(input.interval || 1));
    if (input.id) {
      const cur = await this.getRecurring(input.id);
      if (!cur) throw new ValidationError('Transaksi berulang tidak ditemukan.');
      // If the schedule changed, restart from the start date but skip occurrences already recorded.
      const scheduleChanged = cur.startDate !== input.startDate || cur.frequency !== input.frequency || cur.interval !== interval;
      let nextDate = cur.nextDate;
      if (scheduleChanged) {
        nextDate = input.startDate;
        const last = await this.db.first<{ d: string | null }>('SELECT MAX(recurring_date) AS d FROM transactions WHERE recurring_id = ?', [input.id]);
        const anchor = anchorDayOf(input.startDate);
        let guard = 0;
        while (last?.d && nextDate <= last.d && guard++ < 5000) nextDate = nextOccurrence(nextDate, input.frequency, interval, anchor);
      }
      await this.db.run(
        `UPDATE recurring_transactions SET type=?, amount=?, title=?, category_id=?, account_id=?, to_account_id=?,
           payment_method=?, note=?, frequency=?, interval_n=?, start_date=?, end_date=?, next_date=?, anchor_day=?,
           auto_post=?, remind=?, is_active=? WHERE id=?`,
        [
          input.type, input.amount, input.title.trim(), input.type === 'transfer' ? null : input.categoryId,
          input.accountId, input.type === 'transfer' ? input.toAccountId ?? null : null, input.paymentMethod ?? null,
          input.note ?? '', input.frequency, interval, input.startDate, input.endDate ?? null, nextDate,
          anchorDayOf(input.startDate), input.autoPost ? 1 : 0, input.remind ? 1 : 0,
          (input.isActive ?? cur.isActive) ? 1 : 0, input.id,
        ],
      );
      return input.id;
    }
    const id = newId();
    await this.db.run(
      `INSERT INTO recurring_transactions (id, type, amount, title, category_id, account_id, to_account_id, payment_method,
         note, frequency, interval_n, start_date, end_date, next_date, anchor_day, auto_post, remind, is_active, is_demo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, input.type, input.amount, input.title.trim(), input.type === 'transfer' ? null : input.categoryId,
        input.accountId, input.type === 'transfer' ? input.toAccountId ?? null : null, input.paymentMethod ?? null,
        input.note ?? '', input.frequency, interval, input.startDate, input.endDate ?? null, input.startDate,
        anchorDayOf(input.startDate), input.autoPost ? 1 : 0, input.remind ? 1 : 0, (input.isActive ?? true) ? 1 : 0,
        input.isDemo ? 1 : 0,
      ],
    );
    return id;
  }

  async setRecurringNotification(id: string, notificationId: string | null) {
    await this.db.run('UPDATE recurring_transactions SET notification_id = ? WHERE id = ?', [notificationId, id]);
  }

  async setRecurringActive(id: string, active: boolean) {
    await this.db.run('UPDATE recurring_transactions SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
  }

  async deleteRecurring(id: string): Promise<void> {
    // Already-recorded transactions stay; they simply lose the link.
    await this.db.transaction(async () => {
      await this.db.run('UPDATE transactions SET recurring_id = NULL, recurring_date = NULL WHERE recurring_id = ?', [id]);
      await this.db.run('DELETE FROM recurring_transactions WHERE id = ?', [id]);
    });
  }

  private ruleToInput(rule: RecurringRule, date: string): NewTransactionInput {
    return {
      type: rule.type, amount: rule.amount, title: rule.title, categoryId: rule.categoryId, accountId: rule.accountId,
      toAccountId: rule.toAccountId, date, time: '08:00', paymentMethod: rule.paymentMethod, note: rule.note,
      tags: [], recurringId: rule.id, recurringDate: date, isDemo: rule.isDemo,
    };
  }

  /**
   * Records every due occurrence of auto-post rules up to `today`. Idempotent: the unique index on
   * (recurring_id, recurring_date) plus advancing next_date in the same SQL transaction means opening
   * the app twice never records an occurrence twice. Returns number of transactions created.
   */
  async materializeDue(today = todayJakarta()): Promise<number> {
    const rules = (await this.listRecurring()).filter((r) => r.isActive && r.autoPost && r.nextDate <= today);
    let created = 0;
    for (const rule of rules) {
      const { dates, newNextDate } = dueOccurrences(rule, today);
      await this.db.transaction(async () => {
        for (const d of dates) {
          const exists = await this.db.first<{ id: string }>(
            'SELECT id FROM transactions WHERE recurring_id = ? AND recurring_date = ?', [rule.id, d]);
          if (exists) continue;
          await this.insertTxRow(newId(), this.ruleToInput(rule, d), null);
          created++;
        }
        const ended = !!rule.endDate && newNextDate > rule.endDate;
        await this.db.run('UPDATE recurring_transactions SET next_date = ?, is_active = ? WHERE id = ?',
          [newNextDate, ended ? 0 : 1, rule.id]);
      });
    }
    return created;
  }

  /** Records the pending occurrence of a manual (non auto-post) rule and advances it. */
  async postRecurringNow(id: string, amountOverride?: number): Promise<string> {
    const rule = await this.getRecurring(id);
    if (!rule) throw new ValidationError('Transaksi berulang tidak ditemukan.');
    const input = this.ruleToInput(rule, rule.nextDate);
    if (amountOverride) input.amount = amountOverride;
    await this.validateTx(input);
    const txId = newId();
    await this.db.transaction(async () => {
      const exists = await this.db.first<{ id: string }>('SELECT id FROM transactions WHERE recurring_id = ? AND recurring_date = ?', [rule.id, rule.nextDate]);
      if (!exists) await this.insertTxRow(txId, input, null);
      await this.advanceRule(rule);
    });
    return txId;
  }

  async skipRecurring(id: string): Promise<void> {
    const rule = await this.getRecurring(id);
    if (!rule) return;
    await this.advanceRule(rule);
  }

  private async advanceRule(rule: RecurringRule) {
    const next = nextOccurrence(rule.nextDate, rule.frequency, rule.interval, rule.anchorDay);
    const ended = !!rule.endDate && next > rule.endDate;
    await this.db.run('UPDATE recurring_transactions SET next_date = ?, is_active = ? WHERE id = ?', [next, ended ? 0 : 1, rule.id]);
  }

  // ================= maintenance =================
  async hasDemoData(): Promise<boolean> {
    const r = await this.db.first<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM transactions WHERE is_demo = 1) + (SELECT COUNT(*) FROM accounts WHERE is_demo = 1) AS n');
    return (r?.n ?? 0) > 0;
  }

  async clearDemoData(): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM transactions WHERE is_demo = 1');
      await this.db.run('DELETE FROM recurring_transactions WHERE is_demo = 1');
      await this.db.run("DELETE FROM budgets WHERE id LIKE 'demo_%'");
      // Demo accounts are removed only if no real transaction uses them.
      await this.db.run(
        `DELETE FROM accounts WHERE is_demo = 1 AND id NOT IN (SELECT account_id FROM transactions)
           AND id NOT IN (SELECT to_account_id FROM transactions WHERE to_account_id IS NOT NULL)`);
      await this.db.run('UPDATE accounts SET is_demo = 0 WHERE is_demo = 1');
    });
  }

  /** Deletes ALL user data and re-seeds defaults. Settings (incl. PIN) are kept unless wipeSettings. */
  async wipeAll(wipeSettings = false): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM transactions WHERE linked_tx_id IS NOT NULL');
      await this.db.run('DELETE FROM transactions');
      await this.db.run('DELETE FROM recurring_transactions');
      await this.db.run('DELETE FROM budgets');
      await this.db.run('DELETE FROM accounts');
      await this.db.run('DELETE FROM categories');
      if (wipeSettings) await this.db.run('DELETE FROM app_settings');
      else await this.db.run("DELETE FROM app_settings WHERE key = 'seeded'");
    });
    await this.ensureSeed();
  }
}
