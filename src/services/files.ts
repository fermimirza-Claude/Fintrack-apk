import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';

/** Writes text to a cache file and opens the Android share sheet (save to Files/Drive, send, etc.). */
export async function shareTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  const uri = (FileSystem.cacheDirectory ?? '') + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Fitur berbagi file tidak tersedia di perangkat ini.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename });
}

export async function sharePdfFromHtml(filename: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const target = (FileSystem.cacheDirectory ?? '') + filename;
  await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: target });
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
}

/** Lets the user pick a text file (CSV/JSON); returns its content or null when cancelled. */
export async function pickTextFile(types: string[]): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const text = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return { name: a.name, text };
}

const RECEIPT_DIR = (FileSystem.documentDirectory ?? '') + 'receipts/';

/** Picks or captures a receipt photo and copies it into app storage so it survives cache clears. */
export async function pickReceipt(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Izin kamera ditolak.');
  }
  const opts = { mediaTypes: ['images'] as any, quality: 0.6, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  await FileSystem.makeDirectoryAsync(RECEIPT_DIR, { intermediates: true }).catch(() => undefined);
  const dest = RECEIPT_DIR + `struk_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: res.assets[0].uri, to: dest });
  return dest;
}

export async function deleteReceipt(uri: string | null | undefined) {
  if (uri && uri.startsWith(RECEIPT_DIR)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
