import * as SQLite from 'expo-sqlite';
import { createMutex, type Db, type SqlParam } from './types';

/** expo-sqlite implementation of the Db interface (file persists in the app's private storage). */
export async function openExpoDb(name = 'fintrack.db'): Promise<Db> {
  const conn = await SQLite.openDatabaseAsync(name);
  await conn.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const lock = createMutex();

  const db: Db = {
    exec: (sql) => conn.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await conn.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T,>(sql: string, params: SqlParam[] = []) => conn.getAllAsync<T>(sql, params),
    first: async <T,>(sql: string, params: SqlParam[] = []) => (await conn.getFirstAsync<T>(sql, params)) ?? null,
    transaction: <T,>(fn: () => Promise<T>) => {
      // Serialised by the mutex. Repositories never nest transactions (verified by the test adapter).
      return lock(async () => {
        await conn.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await fn();
          await conn.execAsync('COMMIT');
          return result;
        } catch (e) {
          try { await conn.execAsync('ROLLBACK'); } catch { /* already rolled back */ }
          throw e;
        }
      });
    },
  };
  return db;
}
