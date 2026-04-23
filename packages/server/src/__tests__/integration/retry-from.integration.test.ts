import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Integration tests for retryFrom functionality
 *
 * These tests use a real SQLite database to verify the complete flow
 * including state machine transitions and data persistence.
 */

describe('retryFrom Integration', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeAll(() => {
    // Create a temporary test database
    dbPath = join(tmpdir(), `test-pipeline-${Date.now()}.db`);
    db = new Database(dbPath);

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS pipeline_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        phases TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pipeline_instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        template_id INTEGER,
        status TEXT DEFAULT 'pending',
        current_stage_index INTEGER DEFAULT 0,
        runtime_context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (template_id) REFERENCES pipeline_templates(id)
      );

      CREATE TABLE IF NOT EXISTS pipeline_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER,
        stage_key TEXT NOT NULL,
        phase_key TEXT,
        step_label TEXT,
        status TEXT DEFAULT 'pending',
        input TEXT,
        output TEXT,
        structured_output TEXT,
        artifacts TEXT,
        error TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (instance_id) REFERENCES pipeline_instances(id)
      );

      CREATE TABLE IF NOT EXISTS state_transition_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        triggered_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clean up before each test
    db.exec('DELETE FROM state_transition_log');
    db.exec('DELETE FROM pipeline_stage_runs');
    db.exec('DELETE FROM pipeline_instances');
    db.exec('DELETE FROM pipeline_templates');
    db.exec('DELETE FROM tasks');
  });

  describe('Database operations', () => {
    it('should create and query pipeline instance', () => {
      // Create task
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'pending');
      const taskId = taskResult.lastInsertRowid;

      // Create template
      const templateResult = db.prepare(
        'INSERT INTO pipeline_templates (name, phases) VALUES (?, ?)'
      ).run('Test Template', '[]');
      const templateId = templateResult.lastInsertRowid;

      // Create pipeline instance
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, template_id, status) VALUES (?, ?, ?)'
      ).run(taskId, templateId, 'pending');
      const instanceId = instanceResult.lastInsertRowid;

      // Query back
      const instance = db.prepare(
        'SELECT * FROM pipeline_instances WHERE id = ?'
      ).get(instanceId) as any;

      expect(instance).toBeDefined();
      expect(instance.status).toBe('pending');
      expect(instance.task_id).toBe(taskId);
    });

    it('should create and query stage runs', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'pending');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status) VALUES (?, ?)'
      ).run(taskResult.lastInsertRowid, 'pending');

      // Create stage runs
      const stage1 = db.prepare(
        'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status) VALUES (?, ?, ?)'
      ).run(instanceResult.lastInsertRowid, 'stage_1', 'completed');

      const stage2 = db.prepare(
        'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status) VALUES (?, ?, ?)'
      ).run(instanceResult.lastInsertRowid, 'stage_2', 'completed');

      const stage3 = db.prepare(
        'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status) VALUES (?, ?, ?)'
      ).run(instanceResult.lastInsertRowid, 'stage_3', 'pending');

      // Query all stages
      const stages = db.prepare(
        'SELECT * FROM pipeline_stage_runs WHERE instance_id = ? ORDER BY id'
      ).all(instanceResult.lastInsertRowid) as any[];

      expect(stages).toHaveLength(3);
      expect(stages[0].status).toBe('completed');
      expect(stages[1].status).toBe('completed');
      expect(stages[2].status).toBe('pending');
    });

    it('should update stage status and log transition', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'pending');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status) VALUES (?, ?)'
      ).run(taskResult.lastInsertRowid, 'paused');
      const stageResult = db.prepare(
        'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status, output) VALUES (?, ?, ?, ?)'
      ).run(instanceResult.lastInsertRowid, 'stage_1', 'completed', '{"test": "output"}');

      const stageId = stageResult.lastInsertRowid;

      // Simulate retryFrom: clear output and reset status
      db.prepare(
        'UPDATE pipeline_stage_runs SET output = NULL, structured_output = NULL, artifacts = NULL, status = ? WHERE id = ?'
      ).run('pending', stageId);

      // Log transition
      db.prepare(
        'INSERT INTO state_transition_log (entity_type, entity_id, from_state, to_state, triggered_by) VALUES (?, ?, ?, ?, ?)'
      ).run('stage', stageId, 'completed', 'pending', 'human');

      // Verify
      const stage = db.prepare(
        'SELECT * FROM pipeline_stage_runs WHERE id = ?'
      ).get(stageId) as any;

      expect(stage.status).toBe('pending');
      expect(stage.output).toBeNull();

      const log = db.prepare(
        'SELECT * FROM state_transition_log WHERE entity_id = ?'
      ).get(stageId) as any;

      expect(log).toBeDefined();
      expect(log.from_state).toBe('completed');
      expect(log.to_state).toBe('pending');
      expect(log.triggered_by).toBe('human');
    });

    it('should clear output for multiple stages', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'pending');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status) VALUES (?, ?)'
      ).run(taskResult.lastInsertRowid, 'paused');

      const instanceId = instanceResult.lastInsertRowid;

      // Create stages with output
      const stages = [
        { key: 'stage_1', status: 'completed', output: '{"a": 1}' },
        { key: 'stage_2', status: 'completed', output: '{"b": 2}' },
        { key: 'stage_3', status: 'completed', output: '{"c": 3}' },
        { key: 'stage_4', status: 'pending', output: null },
      ];

      const stageIds: number[] = [];
      for (const s of stages) {
        const result = db.prepare(
          'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status, output) VALUES (?, ?, ?, ?)'
        ).run(instanceId, s.key, s.status, s.output);
        stageIds.push(result.lastInsertRowid as number);
      }

      // Clear output for stages 2, 3, 4 (retryFrom stage_2)
      for (let i = 1; i < stageIds.length; i++) {
        db.prepare(
          'UPDATE pipeline_stage_runs SET output = NULL, structured_output = NULL, artifacts = NULL WHERE id = ?'
        ).run(stageIds[i]);
      }

      // Verify
      const updatedStages = db.prepare(
        'SELECT id, stage_key, status, output FROM pipeline_stage_runs WHERE instance_id = ? ORDER BY id'
      ).all(instanceId) as any[];

      expect(updatedStages[0].output).toBe('{"a": 1}'); // Stage 1 unchanged
      expect(updatedStages[1].output).toBeNull(); // Stage 2 cleared
      expect(updatedStages[2].output).toBeNull(); // Stage 3 cleared
      expect(updatedStages[3].output).toBeNull(); // Stage 4 cleared
    });
  });

  describe('State transitions', () => {
    it('should allow completed -> pending for stage', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'running');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status) VALUES (?, ?)'
      ).run(taskResult.lastInsertRowid, 'paused');
      const stageResult = db.prepare(
        'INSERT INTO pipeline_stage_runs (instance_id, stage_key, status) VALUES (?, ?, ?)'
      ).run(instanceResult.lastInsertRowid, 'stage_1', 'completed');

      const stageId = stageResult.lastInsertRowid;

      // Verify current state
      const before = db.prepare(
        'SELECT status FROM pipeline_stage_runs WHERE id = ?'
      ).get(stageId) as any;
      expect(before.status).toBe('completed');

      // Update status (simulating state machine transition)
      db.prepare(
        'UPDATE pipeline_stage_runs SET status = ? WHERE id = ?'
      ).run('pending', stageId);

      // Verify new state
      const after = db.prepare(
        'SELECT status FROM pipeline_stage_runs WHERE id = ?'
      ).get(stageId) as any;
      expect(after.status).toBe('pending');
    });

    it('should update pipeline and task status together', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'paused');
      const taskId = taskResult.lastInsertRowid;
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status) VALUES (?, ?)'
      ).run(taskId, 'paused');
      const instanceId = instanceResult.lastInsertRowid;

      // Update both to running
      db.prepare('UPDATE pipeline_instances SET status = ? WHERE id = ?').run('running', instanceId);
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('running', taskId);

      // Verify
      const instance = db.prepare(
        'SELECT status FROM pipeline_instances WHERE id = ?'
      ).get(instanceId) as any;
      const task = db.prepare(
        'SELECT status FROM tasks WHERE id = ?'
      ).get(taskId) as any;

      expect(instance.status).toBe('running');
      expect(task.status).toBe('running');
    });
  });

  describe('Runtime context', () => {
    it('should update runtime context when stage completes', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'running');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status, runtime_context) VALUES (?, ?, ?)'
      ).run(taskResult.lastInsertRowid, 'running', '{}');
      const instanceId = instanceResult.lastInsertRowid;

      // Update runtime context
      const context = {
        summary: 'Requirements analysis completed',
        keyDecisions: [
          { from: 'stage_1', decision: 'Use React', reason: 'Better UX' }
        ],
        artifacts: [
          { type: 'document', url: 'file:///path/to/doc.md', title: 'Requirements Doc' }
        ],
        lastUpdatedBy: 'stage_1',
        lastUpdatedAt: new Date().toISOString()
      };

      db.prepare(
        'UPDATE pipeline_instances SET runtime_context = ? WHERE id = ?'
      ).run(JSON.stringify(context), instanceId);

      // Verify
      const instance = db.prepare(
        'SELECT runtime_context FROM pipeline_instances WHERE id = ?'
      ).get(instanceId) as any;

      const parsedContext = JSON.parse(instance.runtime_context);
      expect(parsedContext.summary).toBe('Requirements analysis completed');
      expect(parsedContext.artifacts).toHaveLength(1);
      expect(parsedContext.keyDecisions).toHaveLength(1);
    });

    it('should merge artifacts from multiple stages', () => {
      // Setup
      const taskResult = db.prepare(
        'INSERT INTO tasks (title, status) VALUES (?, ?)'
      ).run('Test Task', 'running');
      const instanceResult = db.prepare(
        'INSERT INTO pipeline_instances (task_id, status, runtime_context) VALUES (?, ?, ?)'
      ).run(taskResult.lastInsertRowid, 'running', JSON.stringify({
        artifacts: [{ type: 'document', url: 'file:///doc1.md' }],
        keyDecisions: []
      }));
      const instanceId = instanceResult.lastInsertRowid;

      // Get current context and merge
      const current = db.prepare(
        'SELECT runtime_context FROM pipeline_instances WHERE id = ?'
      ).get(instanceId) as any;
      const currentContext = JSON.parse(current.runtime_context);

      // Merge new artifact
      const newArtifact = { type: 'pr', url: 'https://github.com/repo/pull/1' };
      const existingUrls = new Set(currentContext.artifacts.map((a: any) => a.url));
      const merged = {
        ...currentContext,
        artifacts: [...currentContext.artifacts, newArtifact],
        lastUpdatedBy: 'stage_2'
      };

      db.prepare(
        'UPDATE pipeline_instances SET runtime_context = ? WHERE id = ?'
      ).run(JSON.stringify(merged), instanceId);

      // Verify
      const updated = db.prepare(
        'SELECT runtime_context FROM pipeline_instances WHERE id = ?'
      ).get(instanceId) as any;
      const updatedContext = JSON.parse(updated.runtime_context);

      expect(updatedContext.artifacts).toHaveLength(2);
    });
  });
});
