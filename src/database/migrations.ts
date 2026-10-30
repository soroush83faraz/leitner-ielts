import type { SqlDb } from './types';

/**
 * Ordered, append-only migrations. The applied version is stored in
 * `PRAGMA user_version`. Each migration runs in its own transaction, so a
 * failure leaves the database at the last good version with data intact.
 *
 * Never edit a shipped migration; add a new one.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE vocabulary (
        id TEXT PRIMARY KEY NOT NULL,
        term TEXT NOT NULL CHECK (length(trim(term)) > 0),
        normalized_term TEXT NOT NULL,
        meaning_fa TEXT,
        definition_en TEXT,
        part_of_speech TEXT,
        ipa TEXT,
        topic TEXT,
        entry_type TEXT NOT NULL DEFAULT 'word' CHECK (entry_type IN ('word','phrase','collocation')),
        source_sentence TEXT,
        source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','bulk','text')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE INDEX idx_vocabulary_normalized ON vocabulary(normalized_term);
      CREATE INDEX idx_vocabulary_topic ON vocabulary(topic);
      CREATE INDEX idx_vocabulary_created ON vocabulary(created_at);
      CREATE INDEX idx_vocabulary_archived ON vocabulary(archived_at);

      CREATE TABLE vocabulary_example (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        sentence TEXT NOT NULL,
        translation_fa TEXT
      );
      CREATE INDEX idx_example_vocab ON vocabulary_example(vocabulary_id);

      CREATE TABLE vocabulary_collocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX idx_collocation_vocab ON vocabulary_collocation(vocabulary_id);

      CREATE TABLE vocabulary_word_family (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        word TEXT NOT NULL,
        part_of_speech TEXT
      );
      CREATE INDEX idx_family_vocab ON vocabulary_word_family(vocabulary_id);

      CREATE TABLE review_state (
        vocabulary_id TEXT PRIMARY KEY NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        box_number INTEGER NOT NULL CHECK (box_number BETWEEN 1 AND 5),
        next_review_at TEXT NOT NULL,
        last_reviewed_at TEXT,
        correct_count INTEGER NOT NULL DEFAULT 0,
        incorrect_count INTEGER NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_state_due ON review_state(next_review_at);
      CREATE INDEX idx_state_box ON review_state(box_number);

      -- vocabulary_id is nullable so a permanently deleted card keeps its
      -- history (global accuracy stays truthful) without dangling references.
      -- id is the client-generated submission id, which makes double taps idempotent.
      CREATE TABLE review_log (
        id TEXT PRIMARY KEY NOT NULL,
        vocabulary_id TEXT REFERENCES vocabulary(id) ON DELETE SET NULL,
        reviewed_at TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('correct','incorrect')),
        box_before INTEGER NOT NULL CHECK (box_before BETWEEN 1 AND 5),
        box_after INTEGER NOT NULL CHECK (box_after BETWEEN 1 AND 5),
        scheduled_at_before TEXT,
        session_id TEXT
      );
      CREATE INDEX idx_log_reviewed ON review_log(reviewed_at);
      CREATE INDEX idx_log_vocab ON review_log(vocabulary_id);

      CREATE TABLE practice_session (
        id TEXT PRIMARY KEY NOT NULL,
        skill TEXT NOT NULL CHECK (skill IN ('reading','listening','writing','speaking')),
        activity_type TEXT NOT NULL,
        target_vocabulary_ids TEXT NOT NULL DEFAULT '[]',
        prompt TEXT NOT NULL,
        payload TEXT,
        user_response TEXT,
        feedback TEXT,
        score_correct INTEGER,
        score_total INTEGER,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX idx_practice_created ON practice_session(created_at);
      CREATE INDEX idx_practice_skill ON practice_session(skill);

      CREATE TABLE user_preference (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function runMigrations(db: SqlDb, migrations: Migration[] = MIGRATIONS): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      // user_version cannot be parameterised; the value is a trusted constant.
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}
