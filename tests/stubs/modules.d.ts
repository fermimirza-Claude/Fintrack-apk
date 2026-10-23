// Minimal type stubs so the app's own code can be type-checked in an environment without
// node_modules (no npm registry access). Library components are typed loosely (any);
// our own components, props, hooks usage and domain/service signatures are fully checked.
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type ComponentType<P = any> = (props: P) => any;
  export type ComponentProps<T> = T extends (props: infer P) => any ? P : any;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export interface Context<T> { Provider: (props: { value: T; children?: ReactNode }) => any }
  export function createContext<T>(v: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type ComponentProps<T> = T extends (props: infer P) => any ? P : any;
  }
  const React: { Fragment: any };
  export default React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements { [k: string]: any }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: any }
}
declare module 'react-native' {
  export const View: any, Text: any, TextInput: (props: any) => any, ScrollView: any, Pressable: any, Modal: any, Switch: any,
    ActivityIndicator: any, KeyboardAvoidingView: any, SectionList: any, Image: any, RefreshControl: any;
  export const Animated: any, Easing: any, StyleSheet: any, Platform: any, Alert: any, AppState: any;
  export function useColorScheme(): 'light' | 'dark' | null;
  export type StyleProp<T> = any;
  export type ViewStyle = { [k: string]: any };
  export type TextStyle = { [k: string]: any };
  export type LayoutChangeEvent = any;
}
declare module 'react-native-svg' {
  const Svg: any;
  export default Svg;
  export const Circle: any, G: any, Line: any, Path: any, Rect: any, Text: any, Defs: any, LinearGradient: any, Stop: any;
}
declare module '@expo/vector-icons' {
  export const Ionicons: (props: { name: string; size?: number; color?: string; style?: any }) => any;
}
declare module 'react-native-safe-area-context' {
  export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number };
  export const SafeAreaProvider: any;
}
declare module '@react-navigation/native' {
  export function useNavigation<T = any>(): T;
  export function useRoute<T = any>(): T;
  export function useFocusEffect(cb: () => void | (() => void)): void;
  export const NavigationContainer: any, DefaultTheme: any, DarkTheme: any;
}
declare module '@react-navigation/native-stack' {
  export type NativeStackScreenProps<P, K extends keyof P> = { route: { params: P[K] }; navigation: any };
  export function createNativeStackNavigator<P>(): any;
}
declare module '@react-navigation/bottom-tabs' {
  export function createBottomTabNavigator<P>(): any;
}
declare module '@react-native-community/datetimepicker' {
  export const DateTimePickerAndroid: { open(opts: any): void };
}
declare module 'expo' { export function registerRootComponent(c: any): void }
declare module 'expo-status-bar' { export const StatusBar: any }
declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params: any[]): Promise<{ changes: number; lastInsertRowId: number }>;
    getAllAsync<T>(sql: string, params: any[]): Promise<T[]>;
    getFirstAsync<T>(sql: string, params: any[]): Promise<T | null>;
  }
  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
declare module 'expo-crypto' {
  export const CryptoDigestAlgorithm: { SHA256: string };
  export function digestStringAsync(a: string, s: string): Promise<string>;
  export function getRandomBytes(n: number): Uint8Array;
  export function randomUUID(): string;
}
declare module 'expo-local-authentication' {
  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function authenticateAsync(o: any): Promise<{ success: boolean }>;
}
declare module 'expo-notifications' {
  export function setNotificationHandler(h: any): void;
  export function setNotificationChannelAsync(id: string, c: any): Promise<any>;
  export function getPermissionsAsync(): Promise<{ granted: boolean }>;
  export function requestPermissionsAsync(): Promise<{ granted: boolean }>;
  export function getAllScheduledNotificationsAsync(): Promise<{ identifier: string; content: { data: any } }[]>;
  export function cancelScheduledNotificationAsync(id: string): Promise<void>;
  export function scheduleNotificationAsync(r: any): Promise<string>;
  export const AndroidImportance: { DEFAULT: number };
  export const SchedulableTriggerInputTypes: { DATE: string };
}
declare module 'expo-file-system/legacy' {
  export const cacheDirectory: string | null;
  export const documentDirectory: string | null;
  export const EncodingType: { UTF8: string };
  export function writeAsStringAsync(uri: string, s: string, o?: any): Promise<void>;
  export function readAsStringAsync(uri: string, o?: any): Promise<string>;
  export function deleteAsync(uri: string, o?: any): Promise<void>;
  export function moveAsync(o: { from: string; to: string }): Promise<void>;
  export function copyAsync(o: { from: string; to: string }): Promise<void>;
  export function makeDirectoryAsync(uri: string, o?: any): Promise<void>;
}
declare module 'expo-sharing' {
  export function isAvailableAsync(): Promise<boolean>;
  export function shareAsync(uri: string, o?: any): Promise<void>;
}
declare module 'expo-document-picker' {
  export function getDocumentAsync(o: any): Promise<{ canceled: boolean; assets?: { uri: string; name: string }[] }>;
}
declare module 'expo-image-picker' {
  export function requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  export function launchCameraAsync(o: any): Promise<{ canceled: boolean; assets?: { uri: string }[] }>;
  export function launchImageLibraryAsync(o: any): Promise<{ canceled: boolean; assets?: { uri: string }[] }>;
}
declare module 'expo-print' { export function printToFileAsync(o: { html: string }): Promise<{ uri: string }> }
declare module 'node:sqlite' { export const DatabaseSync: any }
declare module 'node:assert/strict' { const a: any; export default a }
declare module 'node:fs' { export const mkdtempSync: any, rmSync: any }
declare module 'node:os' { export const tmpdir: any }
declare module 'node:path' { export const join: any }
declare const process: any;
declare const console: any;
declare function requestAnimationFrame(cb: () => void): any;
declare function cancelAnimationFrame(id: any): void;
declare function setTimeout(cb: () => void, ms?: number): any;
