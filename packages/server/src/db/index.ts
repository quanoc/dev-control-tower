import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(__dirname, '../../data/pipeline.db');
    mkdirSync(dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    // Migration: add complexity column if missing
    const columns = db.prepare(
      "PRAGMA table_info(pipeline_templates)"
    ).all() as any[];
    if (!columns.some(c => c.name === 'complexity')) {
      db.exec(
        "ALTER TABLE pipeline_templates ADD COLUMN complexity TEXT DEFAULT 'medium'"
      );
    }
    if (!columns.some(c => c.name === 'phases')) {
      db.exec(
        "ALTER TABLE pipeline_templates ADD COLUMN phases TEXT"
      );
    }

    // Migrate pipeline_stage_runs table
    const stageRunsColumns = db.prepare(
      "PRAGMA table_info(pipeline_stage_runs)"
    ).all() as any[];
    if (!stageRunsColumns.some(c => c.name === 'phase_key')) {
      db.exec(
        "ALTER TABLE pipeline_stage_runs ADD COLUMN phase_key TEXT"
      );
    }
    if (!stageRunsColumns.some(c => c.name === 'step_label')) {
      db.exec(
        "ALTER TABLE pipeline_stage_runs ADD COLUMN step_label TEXT"
      );
    }
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
