/**
 * Core domain types. All money values are integer Rupiah (IDR has no minor unit in practice).
 * All dates are local Asia/Jakarta calendar dates in 'YYYY-MM-DD' form, times in 'HH:mm'.
 */

export type TxType = 'income' | 'expense' | 'transfer';
export type CategoryKind = 'income' | 'expense';
export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'savings' | 'other';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'qris' | 'transfer' | 'ewallet' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  isActive: boolean;
  color: string;
  sortOrder: number;
  isDemo: boolean;
  createdAt: string;
}

export interface AccountWithBalance extends Account {
  balance: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  parentId: string | null;
  isArchived: boolean;
  sortOrder: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  title: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  paymentMethod: PaymentMethod | null;
  note: string;
  tags: string[];
  receiptUri: string | null;
  linkedTxId: string | null; // transfer fee -> parent transfer
  recurringId: string | null;
  recurringDate: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Transaction joined with display info. */
export interface TxView extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  parentCategoryId: string | null;
  accountName: string;
  toAccountName: string | null;
}

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  categoryId: string;
  amount: number;
}

export interface RecurringRule {
  id: string;
  type: TxType;
  amount: number;
  title: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  paymentMethod: PaymentMethod | null;
  note: string;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  nextDate: string;
  anchorDay: number; // day-of-month anchor for monthly/yearly
  autoPost: boolean;
  remind: boolean;
  isActive: boolean;
  notificationId: string | null;
  isDemo: boolean;
}

export interface TxFilter {
  from?: string;
  to?: string;
  type?: TxType;
  categoryIds?: string[];
  accountId?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sort?: 'newest' | 'oldest' | 'largest';
  limit?: number;
}

export interface NewTransactionInput {
  type: TxType;
  amount: number;
  title: string;
  categoryId: string | null;
  accountId: string;
  toAccountId?: string | null;
  date: string;
  time: string;
  paymentMethod?: PaymentMethod | null;
  note?: string;
  tags?: string[];
  receiptUri?: string | null;
  /** Only for transfers: optional fee recorded as a separate expense from the source account. */
  fee?: number;
  feeCategoryId?: string | null;
  recurringId?: string | null;
  recurringDate?: string | null;
  isDemo?: boolean;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Uang tunai',
  bank: 'Rekening bank',
  ewallet: 'E-wallet',
  credit_card: 'Kartu kredit',
  savings: 'Tabungan',
  other: 'Lainnya',
};

export const ACCOUNT_TYPE_ICON: Record<AccountType, string> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  ewallet: 'phone-portrait-outline',
  credit_card: 'card-outline',
  savings: 'wallet-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  debit: 'Kartu debit',
  credit: 'Kartu kredit',
  qris: 'QRIS',
  transfer: 'Transfer bank',
  ewallet: 'E-wallet',
  other: 'Lainnya',
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
};

export const TX_TYPE_LABEL: Record<TxType, string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};
