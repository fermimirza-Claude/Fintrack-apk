// Native implementations wired into the platform-independent services.
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import type { Sha256 } from './security';

export const sha256: Sha256 = (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);

export function randomSalt(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuid(): string {
  return Crypto.randomUUID();
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Buka FinTrack',
      cancelLabel: 'Gunakan PIN',
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
}
