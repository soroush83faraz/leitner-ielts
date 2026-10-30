/**
 * Minimal async SQL surface. Repositories depend on this, never on expo-sqlite,
 * so they can run against `node:sqlite` in tests.
 */
export type SqlValue = string | number | null;

export interface SqlDb {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  /** All-or-nothing. Nested calls join the outer transaction. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
}
