import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { openExpoDb } from './src/db/expoDb';
import { migrate } from './src/db/migrations';
import { Repo } from './src/db/repo';
import { setIdGenerator } from './src/db/types';
import { AppProvider, readSettings, useApp, type AppSettings } from './src/state/AppContext';
import { syncReminders } from './src/services/notifications';
import { uuid } from './src/services/platform';
import { light } from './src/ui/theme';
import type { RootStackParamList, TabParamList } from './src/navigation/types';

import DashboardScreen from './src/screens/DashboardScreen';
import TransactionsScreen, { TxFilteredScreen } from './src/screens/TransactionsScreen';
import TxFormScreen from './src/screens/TxFormScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { AccountFormScreen, AccountsScreen } from './src/screens/AccountsScreens';
import { CategoriesScreen, CategoryFormScreen } from './src/screens/CategoriesScreens';
import { RecurringFormScreen, RecurringScreen } from './src/screens/RecurringScreens';
import { BackupScreen, ImportCsvScreen } from './src/screens/BackupScreens';
import { LockScreen, ProfileScreen, SecurityScreen } from './src/screens/SecurityScreens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const RELOCK_AFTER_MS = 30_000;

function Tabs() {
  const { colors: c } = useApp();
  const insets = useSafeAreaInsets();
  const icons: Record<keyof TabParamList, [string, string]> = {
    Dashboard: ['home', 'home-outline'],
    Transactions: ['list', 'list-outline'],
    Budget: ['pie-chart', 'pie-chart-outline'],
    Reports: ['bar-chart', 'bar-chart-outline'],
    Settings: ['settings', 'settings-outline'],
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.text, fontWeight: '700' },
        tabBarActiveTintColor: c.mode === 'dark' ? c.accent : c.primary,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={(focused ? icons[route.name][0] : icons[route.name][1]) as any} size={size - 2} color={color} />
        ),
        animation: 'shift',
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false, title: 'Dashboard' }} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transaksi' }} />
      <Tab.Screen name="Budget" component={BudgetScreen} options={{ title: 'Anggaran' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ title: 'Laporan' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Pengaturan' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { colors: c, repo, settings, notifyDataChanged } = useApp();
  const [locked, setLocked] = useState(settings.lockEnabled);
  const bgAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'background') bgAt.current = Date.now();
      if (s === 'active') {
        if (settings.lockEnabled && bgAt.current && Date.now() - bgAt.current > RELOCK_AFTER_MS) setLocked(true);
        bgAt.current = null;
        // A new day may have started while the app was in the background.
        const created = await repo.materializeDue().catch(() => 0);
        if (created > 0) { notifyDataChanged(); syncReminders(repo); }
      }
    });
    return () => sub.remove();
  }, [settings.lockEnabled, repo, notifyDataChanged]);

  const navTheme = c.mode === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.primary } };

  return (
    <View style={{ flex: 1 }}>
    <NavigationContainer theme={navTheme}>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right',
      }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="TxForm" component={TxFormScreen} options={{ title: 'Transaksi', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="TxFiltered" component={TxFilteredScreen} options={({ route }) => ({ title: route.params.title })} />
        <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Akun' }} />
        <Stack.Screen name="AccountForm" component={AccountFormScreen} options={{ title: 'Akun' }} />
        <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Kategori' }} />
        <Stack.Screen name="CategoryForm" component={CategoryFormScreen} options={{ title: 'Kategori' }} />
        <Stack.Screen name="Recurring" component={RecurringScreen} options={{ title: 'Transaksi berulang' }} />
        <Stack.Screen name="RecurringForm" component={RecurringFormScreen} options={{ title: 'Transaksi berulang' }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Backup & data' }} />
        <Stack.Screen name="ImportCsv" component={ImportCsvScreen} options={{ title: 'Impor CSV' }} />
        <Stack.Screen name="Security" component={SecurityScreen} options={{ title: 'PIN & biometrik' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
      </Stack.Navigator>
    </NavigationContainer>
      {locked && settings.lockEnabled ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <LockScreen repo={repo} colors={c} biometric={settings.biometricEnabled} onUnlock={() => setLocked(false)} />
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [boot, setBoot] = useState<{ repo: Repo; settings: AppSettings } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIdGenerator(uuid);
        const db = await openExpoDb();
        await migrate(db);
        const repo = new Repo(db);
        await repo.ensureSeed();
        await repo.materializeDue();
        const settings = await readSettings(repo);
        setBoot({ repo, settings });
        syncReminders(repo);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: light.bg }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: light.text }}>Gagal membuka database</Text>
        <Text style={{ marginTop: 8, color: light.textMuted, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }
  if (!boot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' }}>
        <Text style={{ color: '#FFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>FinTrack</Text>
        <ActivityIndicator color="#5EE6E0" style={{ marginTop: 16 }} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AppProvider repo={boot.repo} initialSettings={boot.settings}>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
