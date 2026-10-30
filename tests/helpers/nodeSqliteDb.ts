import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '@/database/migrations';
import { SerialQueue } from '@/database/mutex';
import type { SqlDb, SqlValue } from '@/database/types';

/** Real SQLite (Node's built-in) behind the app's SqlDb interface, for repository tests. */
export class NodeSqlDb implements SqlDb {
  private readonly queue = new SerialQueue();

  constructor(
    readonly raw: DatabaseSync,
    private readonly inTransaction = false,
  ) {}

  static memory(): NodeSqlDb {
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    return new NodeSqlDb(raw);
  }

  async run(sql: string, params: SqlValue[] = []) {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  async all<T>(sql: string, params: SqlValue[] = []) {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: SqlValue[] = []) {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async exec(sql: string) {
    this.raw.exec(sql);
  }

  async transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    return this.queue.run(async () => {
      this.raw.exec('BEGIN');
      try {
        const out = await fn(new NodeSqlDb(this.raw, true));
        this.raw.exec('COMMIT');
        return out;
      } catch (e) {
        this.raw.exec('ROLLBACK');
        throw e;
      }
    });
  }
}

export async function freshDb(): Promise<NodeSqlDb> {
  const db = NodeSqlDb.memory();
  await runMigrations(db);
  return db;
}
