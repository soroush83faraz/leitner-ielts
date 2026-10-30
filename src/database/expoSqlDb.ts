import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { SerialQueue } from './mutex';
import type { SqlDb, SqlValue } from './types';

type Runner = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync'>;

/**
 * Adapts expo-sqlite to the app's SqlDb. Top-level transactions are serialised
 * here so two taps can never interleave their read-check-write sequences.
 */
export class ExpoSqlDb implements SqlDb {
  private readonly queue = new SerialQueue();

  private constructor(
    private readonly runner: Runner,
    private readonly root: SQLiteDatabase | null,
  ) {}

  static from(db: SQLiteDatabase): ExpoSqlDb {
    return new ExpoSqlDb(db, db);
  }

  async run(sql: string, params: SqlValue[] = []) {
    const r = await this.runner.runAsync(sql, params);
    return { changes: r.changes };
  }

  all<T>(sql: string, params: SqlValue[] = []) {
    return this.runner.getAllAsync<T>(sql, params);
  }

  get<T>(sql: string, params: SqlValue[] = []) {
    return this.runner.getFirstAsync<T>(sql, params);
  }

  exec(sql: string) {
    return this.runner.execAsync(sql);
  }

  async transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T> {
    const root = this.root;
    if (!root) return fn(this); // already inside a transaction: join it
    return this.queue.run(async () => {
      let result!: T;
      if (Platform.OS === 'web') {
        // Web (dev preview only) has no exclusive transactions; our queue already serialises writers.
        await root.withTransactionAsync(async () => {
          result = await fn(new ExpoSqlDb(root, null));
        });
        return result;
      }
      await root.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(new ExpoSqlDb(txn, null));
      });
      return result;
    });
  }
}
