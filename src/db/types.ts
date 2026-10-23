/**
 * Minimal database interface. The app implements it with expo-sqlite; the automated tests
 * implement it with Node's built-in SQLite, so the exact same SQL and repository code is tested.
 */
export type SqlParam = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<RunResult>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Runs fn atomically: commits if it resolves, rolls back if it throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

let idGen: () => string = () => {
  const rnd = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}`;
};

export function setIdGenerator(fn: () => string) {
  idGen = fn;
}

export function newId(): string {
  return idGen();
}

/** Serialises transactions so that two concurrent async writers never interleave inside BEGIN/COMMIT. */
export function createMutex() {
  let last: Promise<unknown> = Promise.resolve();
  return function lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = last.then(fn, fn);
    last = run.catch(() => undefined);
    return run;
  };
}
