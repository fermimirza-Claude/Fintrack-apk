import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { Repo } from '../db/repo';
import { dark, light, type Palette } from '../ui/theme';

export type ThemePref = 'system' | 'light' | 'dark';
export type DateFormatPref = 'short' | 'numeric';

export interface AppSettings {
  profileName: string;
  theme: ThemePref;
  dateFormat: DateFormatPref;
  lockEnabled: boolean;
  biometricEnabled: boolean;
}

interface Ctx {
  repo: Repo;
  colors: Palette;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Increments whenever data changes; screens reload when it changes. */
  dataVersion: number;
  notifyDataChanged: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export async function readSettings(repo: Repo): Promise<AppSettings> {
  const s = await repo.allSettings();
  return {
    profileName: s.profile_name ?? '',
    theme: (s.theme as ThemePref) ?? 'system',
    dateFormat: (s.date_format as DateFormatPref) ?? 'short',
    lockEnabled: s.lock_enabled === '1' && !!s.pin_hash,
    biometricEnabled: s.biometric_enabled === '1',
  };
}

export function AppProvider({ repo, initialSettings, children }: { repo: Repo; initialSettings: AppSettings; children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [dataVersion, setDataVersion] = useState(0);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const map: Record<string, string> = {};
    if (patch.profileName !== undefined) map.profile_name = patch.profileName;
    if (patch.theme !== undefined) map.theme = patch.theme;
    if (patch.dateFormat !== undefined) map.date_format = patch.dateFormat;
    if (patch.lockEnabled !== undefined) map.lock_enabled = patch.lockEnabled ? '1' : '0';
    if (patch.biometricEnabled !== undefined) map.biometric_enabled = patch.biometricEnabled ? '1' : '0';
    for (const [k, v] of Object.entries(map)) await repo.setSetting(k, v);
    setSettings((s) => ({ ...s, ...patch }));
  }, [repo]);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  const colors = useMemo(() => {
    const mode = settings.theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : settings.theme;
    return mode === 'dark' ? dark : light;
  }, [settings.theme, scheme]);

  const value = useMemo(
    () => ({ repo, colors, settings, updateSettings, dataVersion, notifyDataChanged }),
    [repo, colors, settings, updateSettings, dataVersion, notifyDataChanged],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

export function useColors(): Palette {
  return useApp().colors;
}

/**
 * Loads data from the repository and reloads whenever data changes anywhere in the app,
 * when the screen regains focus, or when deps change. Keeps stale data visible while reloading.
 */
export function useData<T>(loader: (repo: Repo) => Promise<T>, deps: unknown[] = []) {
  const { repo, dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await loaderRef.current(repo);
      if (id === reqId.current) { setData(d); setError(null); }
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message ?? String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [repo]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, dataVersion, ...deps]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { data, error, loading, reload };
}
