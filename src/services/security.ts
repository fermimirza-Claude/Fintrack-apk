import type { Repo } from '../db/repo';

export type Sha256 = (input: string) => Promise<string>;

const ITERATIONS = 120;

/** Salted, iterated SHA-256 of the PIN. The plain PIN is never stored. */
export async function derivePinHash(pin: string, salt: string, sha256: Sha256): Promise<string> {
  let h = await sha256(`${salt}:${pin}`);
  for (let i = 1; i < ITERATIONS; i++) h = await sha256(`${salt}:${h}:${i}`);
  return h;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function setPin(repo: Repo, pin: string, sha256: Sha256, randomSalt: () => string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN harus 4–6 digit angka.');
  const salt = randomSalt();
  const hash = await derivePinHash(pin, salt, sha256);
  await repo.setSetting('pin_salt', salt);
  await repo.setSetting('pin_hash', hash);
  await repo.setSetting('lock_enabled', '1');
  await repo.deleteSetting('pin_fail_count');
  await repo.deleteSetting('pin_locked_until');
}

export async function clearPin(repo: Repo): Promise<void> {
  for (const k of ['pin_salt', 'pin_hash', 'pin_fail_count', 'pin_locked_until']) await repo.deleteSetting(k);
  await repo.setSetting('lock_enabled', '0');
  await repo.setSetting('biometric_enabled', '0');
}

export type VerifyResult = { ok: true } | { ok: false; lockedSeconds?: number; attemptsLeft?: number };

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

/** Verifies the PIN with a temporary lockout after 5 failed attempts. */
export async function verifyPin(repo: Repo, pin: string, sha256: Sha256, now = Date.now()): Promise<VerifyResult> {
  const lockedUntil = Number((await repo.getSetting('pin_locked_until')) ?? 0);
  if (lockedUntil > now) return { ok: false, lockedSeconds: Math.ceil((lockedUntil - now) / 1000) };
  const salt = await repo.getSetting('pin_salt');
  const stored = await repo.getSetting('pin_hash');
  if (!salt || !stored) return { ok: true };
  const hash = await derivePinHash(pin, salt, sha256);
  if (hash === stored) {
    await repo.deleteSetting('pin_fail_count');
    await repo.deleteSetting('pin_locked_until');
    return { ok: true };
  }
  const fails = Number((await repo.getSetting('pin_fail_count')) ?? 0) + 1;
  if (fails >= MAX_ATTEMPTS) {
    await repo.setSetting('pin_locked_until', String(now + LOCK_MS));
    await repo.setSetting('pin_fail_count', '0');
    return { ok: false, lockedSeconds: LOCK_MS / 1000 };
  }
  await repo.setSetting('pin_fail_count', String(fails));
  return { ok: false, attemptsLeft: MAX_ATTEMPTS - fails };
}
