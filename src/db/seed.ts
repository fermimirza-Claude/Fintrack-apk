import type { CategoryKind } from '../domain/types';

export interface SeedCategory {
  key: string;
  name: string;
  kind: CategoryKind;
  icon: string; // Ionicons name
  color: string;
  children?: string[];
}

/** Default categories (Bahasa Indonesia), created on first launch. */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { key: 'food', name: 'Makanan & Minuman', kind: 'expense', icon: 'restaurant-outline', color: '#F97362',
    children: ['Makan di luar', 'Belanja dapur', 'Kopi & jajan'] },
  { key: 'transport', name: 'Transportasi', kind: 'expense', icon: 'car-outline', color: '#3B82F6',
    children: ['Bensin', 'Ojek / taksi online', 'Parkir & tol', 'Transportasi umum'] },
  { key: 'shopping', name: 'Belanja', kind: 'expense', icon: 'bag-handle-outline', color: '#A855F7',
    children: ['Pakaian', 'Elektronik', 'Perawatan diri'] },
  { key: 'bills', name: 'Tagihan & Utilitas', kind: 'expense', icon: 'flash-outline', color: '#F59E0B',
    children: ['Listrik', 'Air', 'Internet', 'Pulsa & paket data'] },
  { key: 'household', name: 'Rumah Tangga', kind: 'expense', icon: 'home-outline', color: '#14B8A6',
    children: ['Sewa', 'Perlengkapan rumah', 'Asisten rumah tangga'] },
  { key: 'health', name: 'Kesehatan', kind: 'expense', icon: 'medkit-outline', color: '#EF4444',
    children: ['Obat', 'Dokter', 'Asuransi kesehatan'] },
  { key: 'education', name: 'Pendidikan', kind: 'expense', icon: 'school-outline', color: '#6366F1',
    children: ['Biaya sekolah', 'Buku & kursus'] },
  { key: 'entertainment', name: 'Hiburan', kind: 'expense', icon: 'film-outline', color: '#EC4899',
    children: ['Langganan streaming', 'Liburan', 'Hobi'] },
  { key: 'debt', name: 'Cicilan & Utang', kind: 'expense', icon: 'card-outline', color: '#64748B',
    children: ['Cicilan kendaraan', 'KPR', 'Paylater'] },
  { key: 'invest', name: 'Investasi & Tabungan', kind: 'expense', icon: 'trending-up-outline', color: '#10B981',
    children: ['Reksa dana', 'Saham', 'Emas', 'Dana darurat'] },
  { key: 'fees', name: 'Biaya Admin & Transfer', kind: 'expense', icon: 'receipt-outline', color: '#94A3B8' },
  { key: 'other_exp', name: 'Lain-lain', kind: 'expense', icon: 'ellipsis-horizontal-outline', color: '#78716C' },

  { key: 'salary', name: 'Gaji', kind: 'income', icon: 'briefcase-outline', color: '#16A34A' },
  { key: 'bonus', name: 'Bonus & THR', kind: 'income', icon: 'gift-outline', color: '#22C55E' },
  { key: 'business', name: 'Usaha', kind: 'income', icon: 'storefront-outline', color: '#0FA3A3' },
  { key: 'invest_inc', name: 'Hasil Investasi', kind: 'income', icon: 'stats-chart-outline', color: '#0EA5E9' },
  { key: 'freelance', name: 'Freelance', kind: 'income', icon: 'laptop-outline', color: '#8B5CF6' },
  { key: 'other_inc', name: 'Pemasukan Lain', kind: 'income', icon: 'add-circle-outline', color: '#84CC16' },
];

export const ACCOUNT_COLORS = ['#0B1F3A', '#0FA3A3', '#2563EB', '#16A34A', '#F97362', '#A855F7', '#F59E0B', '#64748B'];
