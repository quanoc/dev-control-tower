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
    if (!stageRunsColumns.some(c => c.name === 'heartbeat_at')) {
      db.exec(
        "ALTER TABLE pipeline_stage_runs ADD COLUMN heartbeat_at DATETIME"
      );
    }
    if (!stageRunsColumns.some(c => c.name === 'timeout_seconds')) {
      db.exec(
        "ALTER TABLE pipeline_stage_runs ADD COLUMN timeout_seconds INTEGER DEFAULT 300"
      );
    }

    // Migrate agents table for multi-agent support
    const agentsColumns = db.prepare(
      "PRAGMA table_info(agents)"
    ).all() as any[];

    // Add 'type' column if missing (replacing 'source')
    if (!agentsColumns.some(c => c.name === 'type')) {
      const hasSource = agentsColumns.some(c => c.name === 'source');
      if (!hasSource) {
        db.exec("ALTER TABLE agents ADD COLUMN type TEXT DEFAULT 'openclaw'");
      }
    }

    // Add metadata, last_sync, created_at columns (without default values for SQLite compatibility)
    if (!agentsColumns.some(c => c.name === 'metadata')) {
      db.exec("ALTER TABLE agents ADD COLUMN metadata TEXT");
    }
    if (!agentsColumns.some(c => c.name === 'last_sync')) {
      db.exec("ALTER TABLE agents ADD COLUMN last_sync TEXT");
    }
    if (!agentsColumns.some(c => c.name === 'created_at')) {
      db.exec("ALTER TABLE agents ADD COLUMN created_at TEXT");
    }

    // Legacy columns (keep for backward compatibility)
    if (!agentsColumns.some(c => c.name === 'source')) {
      db.exec("ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'openclaw'");
    }
    if (!agentsColumns.some(c => c.name === 'model')) {
      db.exec("ALTER TABLE agents ADD COLUMN model TEXT");
    }
    if (!agentsColumns.some(c => c.name === 'system_prompt')) {
      db.exec("ALTER TABLE agents ADD COLUMN system_prompt TEXT");
    }
    if (!agentsColumns.some(c => c.name === 'tools')) {
      db.exec("ALTER TABLE agents ADD COLUMN tools TEXT DEFAULT '[]'");
    }
    if (!agentsColumns.some(c => c.name === 'icon')) {
      db.exec("ALTER TABLE agents ADD COLUMN icon TEXT");
    }
    if (!agentsColumns.some(c => c.name === 'path')) {
      db.exec("ALTER TABLE agents ADD COLUMN path TEXT");
    }
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
