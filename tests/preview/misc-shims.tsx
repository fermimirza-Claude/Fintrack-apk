// Stand-ins for native modules, for the browser preview/smoke test only.
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Io5 from 'react-icons/io5';

// ---- react-native-svg → real SVG elements
const svgEl = (tag: string) => ({ children, onPress, ...p }: any) => React.createElement(tag, { ...p, onClick: onPress }, children);
const Svg = ({ children, width, height, ...p }: any) => <svg width={width} height={height} {...p} style={{ display: 'block', flexShrink: 0 }}>{children}</svg>;
export default Svg;
export const Circle = svgEl('circle');
export const G = svgEl('g');
export const Line = svgEl('line');
export const Path = svgEl('path');
export const Rect = svgEl('rect');
export const Text = svgEl('text');
export const Defs = svgEl('defs');
export const LinearGradient = svgEl('linearGradient');
export const Stop = svgEl('stop');

// ---- icons: Ionicons 5 glyphs from react-icons (same icon set as @expo/vector-icons Ionicons)
export function Ionicons({ name, size = 20, color = '#000' }: any) {
  const comp = 'Io' + String(name).split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const Icon = (Io5 as any)[comp];
  if (Icon) return <Icon size={size} color={color} style={{ flexShrink: 0, display: 'block' }} />;
  return <span title={name} style={{ width: size, height: size, borderRadius: size * 0.3, border: `2px solid ${color}`, display: 'inline-block', boxSizing: 'border-box' }} />;
}

// ---- safe area
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const useSafeAreaInsets = () => ({ top: 24, bottom: 0, left: 0, right: 0 });

// ---- expo
export function registerRootComponent(C: any) {
  createRoot(document.getElementById('root')!).render(<C />);
}
export const StatusBar = () => null;
export const DateTimePickerAndroid = { open: () => undefined };

// crypto
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export async function digestStringAsync(_a: string, s: string) {
  if (!crypto.subtle) return (window as any).nodeSha256(s);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const getRandomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const randomUUID = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join(''));

// local auth
export const hasHardwareAsync = async () => false;
export const isEnrolledAsync = async () => false;
export const authenticateAsync = async () => ({ success: false });

// notifications
export const setNotificationHandler = () => undefined;
export const setNotificationChannelAsync = async () => undefined;
export const getPermissionsAsync = async () => ({ granted: false });
export const requestPermissionsAsync = async () => ({ granted: false });
export const getAllScheduledNotificationsAsync = async () => [];
export const cancelScheduledNotificationAsync = async () => undefined;
export const scheduleNotificationAsync = async () => 'x';
export const AndroidImportance = { DEFAULT: 3 };
export const SchedulableTriggerInputTypes = { DATE: 'date' };

// files / sharing / pickers / print
export const cacheDirectory = 'file:///cache/';
export const documentDirectory = 'file:///docs/';
export const EncodingType = { UTF8: 'utf8' };
export const writeAsStringAsync = async (uri: string, s: string) => { (window as any).__files = { ...((window as any).__files ?? {}), [uri]: s }; };
export const readAsStringAsync = async () => '';
export const deleteAsync = async () => undefined;
export const moveAsync = async () => undefined;
export const copyAsync = async () => undefined;
export const makeDirectoryAsync = async () => undefined;
export const isAvailableAsync = async () => true;
export const shareAsync = async (uri: string) => { (window as any).__shared = [...((window as any).__shared ?? []), uri]; };
export const getDocumentAsync = async () => ({ canceled: true });
export const requestCameraPermissionsAsync = async () => ({ granted: false });
export const launchCameraAsync = async () => ({ canceled: true });
export const launchImageLibraryAsync = async () => ({ canceled: true });
export const printToFileAsync = async ({ html }: any) => { (window as any).__pdfHtml = html; return { uri: 'file:///cache/print.pdf' }; };
