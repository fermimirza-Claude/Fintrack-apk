// Replaces src/db/expoDb.ts in the browser preview: every SQL call is forwarded to Node's SQLite
// through a Playwright-exposed function, so the UI runs against the real repository code.
import { createMutex, type Db, type SqlParam } from '../../src/db/types';

declare global { interface Window { dbCall: (op: string, sql: string, params: SqlParam[]) => Promise<any> } }

export async function openExpoDb(): Promise<Db> {
  const lock = createMutex();
  return {
    exec: (sql) => window.dbCall('exec', sql, []),
    run: (sql, params = []) => window.dbCall('run', sql, params),
    all: (sql, params = []) => window.dbCall('all', sql, params),
    first: (sql, params = []) => window.dbCall('first', sql, params),
    transaction: (fn) => lock(async () => {
      await window.dbCall('exec', 'BEGIN IMMEDIATE', []);
      try { const r = await fn(); await window.dbCall('exec', 'COMMIT', []); return r; }
      catch (e) { await window.dbCall('exec', 'ROLLBACK', []); throw e; }
    }),
  };
}
