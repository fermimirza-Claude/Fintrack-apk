import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TxType } from '../domain/types';

export type RootStackParamList = {
  Tabs: undefined;
  TxForm: { id?: string; type?: TxType; duplicateOf?: string } | undefined;
  TxFiltered: { title: string; categoryIds?: string[]; from?: string; to?: string; accountId?: string; type?: TxType };
  Accounts: undefined;
  AccountForm: { id?: string } | undefined;
  Categories: undefined;
  CategoryForm: { id?: string; kind: 'income' | 'expense'; parentId?: string | null };
  Recurring: undefined;
  RecurringForm: { id?: string } | undefined;
  Backup: undefined;
  ImportCsv: undefined;
  Security: undefined;
  Profile: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  Budget: { openAdd?: number } | undefined;
  Reports: undefined;
  Settings: undefined;
};

export type RootScreen<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;
