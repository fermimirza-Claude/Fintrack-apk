export interface Palette {
  mode: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string; // navy
  primarySoft: string;
  accent: string; // teal
  accentSoft: string;
  income: string;
  incomeSoft: string;
  expense: string;
  expenseSoft: string;
  warning: string;
  warningSoft: string;
  hero: string;
  heroText: string;
  heroMuted: string;
  overlay: string;
  shadow: string;
}

export const light: Palette = {
  mode: 'light',
  bg: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F7',
  border: '#E3E8EF',
  text: '#0B1F3A',
  textMuted: '#5B6B82',
  textFaint: '#94A3B8',
  primary: '#0B1F3A',
  primarySoft: '#E6ECF5',
  accent: '#0FA3A3',
  accentSoft: '#DDF4F3',
  income: '#16A34A',
  incomeSoft: '#E3F6EA',
  expense: '#E8584A',
  expenseSoft: '#FDECEA',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  hero: '#0B1F3A',
  heroText: '#FFFFFF',
  heroMuted: '#9FB3CF',
  overlay: 'rgba(11,31,58,0.45)',
  shadow: '#0B1F3A',
};

export const dark: Palette = {
  mode: 'dark',
  bg: '#0A1220',
  surface: '#121C2D',
  surfaceAlt: '#1A2639',
  border: '#24324A',
  text: '#E8EEF7',
  textMuted: '#9AA9BF',
  textFaint: '#64748B',
  primary: '#7FB3FF',
  primarySoft: '#1B2A44',
  accent: '#2CC5C2',
  accentSoft: '#123536',
  income: '#34D399',
  incomeSoft: '#10302A',
  expense: '#FF7A6B',
  expenseSoft: '#3A1D1E',
  warning: '#F59E0B',
  warningSoft: '#3A2A10',
  hero: '#14233B',
  heroText: '#FFFFFF',
  heroMuted: '#8EA3C2',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const font = {
  h1: 26,
  h2: 20,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
};
