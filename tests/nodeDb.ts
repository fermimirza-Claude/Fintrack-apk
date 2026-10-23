// Test adapter: implements the app's Db interface on Node's built-in SQLite so the real
// repository SQL runs against a real SQLite engine. A file path makes persistence testable.
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '../src/db/types';

export function openNodeDb(path = ':memory:'): Db & { close(): void } {
  const conn = new DatabaseSync(path);
  conn.exec('PRAGMA foreign_keys = ON;');
  let inTx = false;
  const db = {
    exec: async (sql: string) => { conn.exec(sql); },
    run: async (sql: string, params: SqlParam[] = []) => {
      const r = conn.prepare(sql).run(...(params as any[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T,>(sql: string, params: SqlParam[] = []) => conn.prepare(sql).all(...(params as any[])) as T[],
    first: async <T,>(sql: string, params: SqlParam[] = []) => (conn.prepare(sql).get(...(params as any[])) as T) ?? null,
    transaction: async <T,>(fn: () => Promise<T>) => {
      if (inTx) throw new Error('Nested transaction detected — repositories must not nest transactions');
      inTx = true;
      conn.exec('BEGIN IMMEDIATE');
      try {
        const r = await fn();
        conn.exec('COMMIT');
        return r;
      } catch (e) {
        conn.exec('ROLLBACK');
        throw e;
      } finally {
        inTx = false;
      }
    },
    close: () => conn.close(),
  };
  return db;
}
