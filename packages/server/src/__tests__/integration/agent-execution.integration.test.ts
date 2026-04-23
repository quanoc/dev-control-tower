import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputParser } from '../../context/output-parser.js';
import type { Artifact } from '../../executors/interface.js';
import type { StepOutput } from '../../context/types.js';

/**
 * Integration tests for complete Agent execution flow
 *
 * Tests the full pipeline:
 * 1. Agent returns OpenClaw response format
 * 2. OutputParser extracts and parses the output
 * 3. Structured output is saved to database
 * 4. Runtime context is merged and updated
 */

describe('Agent Execution Flow Integration', () => {
  let db: Database.Database;
  let dbPath: string;
  let parser: OutputParser;

  beforeAll(() => {
    dbPath = join(tmpdir(), `test-agent-flow-${Date.now()}.db`);
    db = new Database(dbPath);
    parser = new OutputParser();

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

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT,
        role TEXT,
        skills TEXT
      );
    `);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM pipeline_stage_runs');
    db.exec('DELETE FROM pipeline_instances');
    db.exec('DELETE FROM pipeline_templates');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM agents');
  });

  describe('Complete flow: OpenClaw response → Parsed output → Database', () => {
    it('should handle requirements analysis agent output', async () => {
      // Setup: Create task, pipeline instance, stage run
      const taskId = createTask(db, '用户管理模块需求分析');
      const instanceId = createPipelineInstance(db, taskId);
      const stageRunId = createStageRun(db, instanceId, 'step_requirements_analysis', 'pending');
      createAgent(db, 'xiaoxi-pm', '产品经理');

      // Simulate OpenClaw agent response
      const openclawResponse = {
        runId: 'a344e1a9-533f-4981-9fa5-b2dbe41c87ab',
        status: 'ok',
        result: {
          payloads: [{
            text: JSON.stringify({
              artifacts: [{
                type: 'document',
                url: 'file:///root/.openclaw/workspace/xiaoxi-pm/requirements-用户管理模块.md',
                title: '电商后台用户管理模块需求文档'
              }],
              nextStepInput: {
                summary: '完成电商后台用户管理模块需求分析，输出包含10个用户故事的完整需求文档',
                keyPoints: [
                  '需求划分为3个Epic：用户管理CRUD、角色与权限管理、批量操作',
                  '定义10个用户故事，每个包含明确的验收标准'
                ],
                decisions: [{
                  decision: '采用用户故事+验收标准的格式编写需求',
                  reason: '便于开发团队理解和测试验证'
                }]
              }
            })
          }]
        }
      };

      const rawOutput = JSON.stringify(openclawResponse);

      // Step 1: Parse the OpenClaw response
      const parsed = parser.parse(rawOutput);

      expect(parsed.success).toBe(true);
      expect(parsed.output).not.toBeNull();

      const output = parsed.output!;
      expect(output.artifacts).toHaveLength(1);
      expect(output.nextStepInput.summary).toContain('需求分析');

      // Step 2: Save structured output to stage run
      db.prepare(`
        UPDATE pipeline_stage_runs
        SET structured_output = ?, output = ?, artifacts = ?, status = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        JSON.stringify(output),
        rawOutput,
        JSON.stringify(output.artifacts),
        'completed',
        stageRunId
      );

      // Step 3: Update runtime context
      const currentContext = getRuntimeContext(db, instanceId);
      const mergedContext = mergeRuntimeContext(currentContext, output, 'step_requirements_analysis');

      db.prepare(`
        UPDATE pipeline_instances SET runtime_context = ? WHERE id = ?
      `).run(JSON.stringify(mergedContext), instanceId);

      // Verify stage run was updated
      const stageRun = db.prepare(`
        SELECT * FROM pipeline_stage_runs WHERE id = ?
      `).get(stageRunId) as any;

      expect(stageRun.status).toBe('completed');
      expect(stageRun.structured_output).not.toBeNull();

      const savedOutput = JSON.parse(stageRun.structured_output);
      expect(savedOutput.artifacts).toHaveLength(1);
      expect(savedOutput.artifacts[0].type).toBe('document');

      // Verify runtime context was merged
      const instance = db.prepare(`
        SELECT runtime_context FROM pipeline_instances WHERE id = ?
      `).get(instanceId) as any;

      const context = JSON.parse(instance.runtime_context);
      expect(context.summary).toContain('需求分析');
      expect(context.artifacts).toHaveLength(1);
      expect(context.keyDecisions).toHaveLength(1);
    });

    it('should handle code agent output with PR artifact', async () => {
      const taskId = createTask(db, '用户管理模块开发');
      const instanceId = createPipelineInstance(db, taskId, JSON.stringify({
        summary: '需求分析已完成',
        artifacts: [{ type: 'document', url: 'file:///requirements.md' }],
        keyDecisions: []
      }));
      const stageRunId = createStageRun(db, instanceId, 'step_code', 'pending');
      createAgent(db, 'xiaozhi-dev', '开发工程师');

      // Simulate code agent response with PR
      const openclawResponse = {
        runId: 'code-run-123',
        status: 'ok',
        result: {
          payloads: [{
            text: JSON.stringify({
              artifacts: [{
                type: 'pr',
                url: 'https://github.com/owner/repo/pull/42',
                title: 'feat: 实现用户管理模块'
              }],
              nextStepInput: {
                summary: '完成用户管理模块开发，已创建PR',
                keyPoints: [
                  '实现了用户CRUD接口',
                  '添加了单元测试',
                  '代码覆盖率 85%'
                ]
              }
            })
          }]
        }
      };

      const rawOutput = JSON.stringify(openclawResponse);
      const parsed = parser.parse(rawOutput);

      expect(parsed.success).toBe(true);
      expect(parsed.output).not.toBeNull();

      const output = parsed.output!;
      expect(output.artifacts[0].type).toBe('pr');

      // Save and merge
      db.prepare(`
        UPDATE pipeline_stage_runs
        SET structured_output = ?, output = ?, artifacts = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(output), rawOutput, JSON.stringify(output.artifacts), stageRunId);

      const currentContext = getRuntimeContext(db, instanceId);
      const mergedContext = mergeRuntimeContext(currentContext, output, 'step_code');
      db.prepare(`UPDATE pipeline_instances SET runtime_context = ? WHERE id = ?`)
        .run(JSON.stringify(mergedContext), instanceId);

      // Verify artifacts were merged (should have 2 now)
      const instance = db.prepare(`SELECT runtime_context FROM pipeline_instances WHERE id = ?`)
        .get(instanceId) as any;
      const context = JSON.parse(instance.runtime_context);

      expect(context.artifacts).toHaveLength(2);
      expect(context.artifacts.find((a: Artifact) => a.type === 'pr')).toBeDefined();
      expect(context.artifacts.find((a: Artifact) => a.type === 'document')).toBeDefined();
    });

    it('should handle test agent output with test report', async () => {
      const taskId = createTask(db, '测试任务');
      const instanceId = createPipelineInstance(db, taskId);
      const stageRunId = createStageRun(db, instanceId, 'step_unit_test', 'pending');
      createAgent(db, 'xiaozhi-test', '测试工程师');

      const openclawResponse = {
        runId: 'test-run-456',
        status: 'ok',
        result: {
          payloads: [{
            text: JSON.stringify({
              artifacts: [{
                type: 'test_report',
                url: 'file:///reports/unit-test-coverage.html',
                title: '单元测试覆盖率报告'
              }],
              nextStepInput: {
                summary: '单元测试通过，覆盖率 85%',
                keyPoints: [
                  '测试用例数: 42',
                  '通过: 40',
                  '失败: 2'
                ]
              }
            })
          }]
        }
      };

      const parsed = parser.parse(JSON.stringify(openclawResponse));

      expect(parsed.success).toBe(true);
      expect(parsed.output).not.toBeNull();
      expect(parsed.output!.artifacts[0].type).toBe('test_report');
      expect(parsed.output!.nextStepInput.summary).toContain('85%');
    });

    it('should handle deployment agent output', async () => {
      const taskId = createTask(db, '部署任务');
      const instanceId = createPipelineInstance(db, taskId);
      const stageRunId = createStageRun(db, instanceId, 'step_deploy', 'pending');
      createAgent(db, 'xiaoyun-ops', '运维工程师');

      const openclawResponse = {
        runId: 'deploy-run-789',
        status: 'ok',
        finalAssistantVisibleText: JSON.stringify({
          artifacts: [{
            type: 'deploy',
            url: 'https://app.example.com/v1.2.3',
            title: '生产环境部署'
          }],
          nextStepInput: {
            summary: '部署成功，版本 v1.2.3'
          }
        })
      };

      const parsed = parser.parse(JSON.stringify(openclawResponse));

      expect(parsed.success).toBe(true);
      expect(parsed.output).not.toBeNull();
      expect(parsed.output!.artifacts[0].type).toBe('deploy');
    });
  });

  describe('Error handling', () => {
    it('should handle malformed OpenClaw response gracefully', () => {
      const malformedResponse = '{ invalid json }';
      const parsed = parser.parse(malformedResponse);

      // Should fallback to URL extraction
      expect(parsed.success).toBe(true);
      expect(parsed.error).toContain('JSON parsing failed');
    });

    it('should handle empty payloads array', () => {
      const emptyPayloads = JSON.stringify({
        runId: 'empty',
        status: 'ok',
        result: { payloads: [] }
      });

      const parsed = parser.parse(emptyPayloads);

      // Should fallback
      expect(parsed.success).toBe(true);
    });

    it('should handle missing nextStepInput', () => {
      const missingField = JSON.stringify({
        runId: 'missing',
        result: {
          payloads: [{
            text: JSON.stringify({ artifacts: [] })  // missing nextStepInput
          }]
        }
      });

      const parsed = parser.parse(missingField);

      // Should fallback
      expect(parsed.success).toBe(true);
      expect(parsed.error).toContain('JSON parsing failed');
    });
  });

  describe('retryFrom scenario', () => {
    it('should clear previous output when retrying from a stage', async () => {
      const taskId = createTask(db, '需要重试的任务');
      const instanceId = createPipelineInstance(db, taskId);

      // Create completed stages with output
      const stage1 = createStageRun(db, instanceId, 'stage_1', 'completed',
        JSON.stringify({ artifacts: [], nextStepInput: { summary: 'Stage 1 done' } }),
        'output 1'
      );
      const stage2 = createStageRun(db, instanceId, 'stage_2', 'completed',
        JSON.stringify({ artifacts: [], nextStepInput: { summary: 'Stage 2 done' } }),
        'output 2'
      );
      const stage3 = createStageRun(db, instanceId, 'stage_3', 'pending');

      // Simulate retryFrom stage_2
      // Clear output for stage 2 and 3
      db.prepare(`UPDATE pipeline_stage_runs SET output = NULL, structured_output = NULL, artifacts = NULL WHERE id IN (?, ?)`)
        .run(stage2, stage3);

      // Update statuses
      db.prepare(`UPDATE pipeline_stage_runs SET status = 'pending' WHERE id = ?`).run(stage2);
      db.prepare(`UPDATE pipeline_instances SET status = 'running' WHERE id = ?`).run(instanceId);

      // Verify stage 1 is unchanged
      const s1 = db.prepare(`SELECT * FROM pipeline_stage_runs WHERE id = ?`).get(stage1) as any;
      expect(s1.status).toBe('completed');
      expect(s1.output).toBe('output 1');

      // Verify stage 2 was cleared
      const s2 = db.prepare(`SELECT * FROM pipeline_stage_runs WHERE id = ?`).get(stage2) as any;
      expect(s2.status).toBe('pending');
      expect(s2.output).toBeNull();
      expect(s2.structured_output).toBeNull();

      // Verify stage 3 was cleared (even though already pending)
      const s3 = db.prepare(`SELECT * FROM pipeline_stage_runs WHERE id = ?`).get(stage3) as any;
      expect(s3.output).toBeNull();
    });
  });

  // Helper functions
  function createTask(db: Database.Database, title: string): number {
    const result = db.prepare(`INSERT INTO tasks (title, status) VALUES (?, 'running')`).run(title);
    return result.lastInsertRowid as number;
  }

  function createPipelineInstance(db: Database.Database, taskId: number, initialContext = '{}'): number {
    const result = db.prepare(`
      INSERT INTO pipeline_instances (task_id, status, runtime_context)
      VALUES (?, 'running', ?)
    `).run(taskId, initialContext);
    return result.lastInsertRowid as number;
  }

  function createStageRun(
    db: Database.Database,
    instanceId: number,
    stageKey: string,
    status: string,
    structuredOutput: string | null = null,
    output: string | null = null
  ): number {
    const result = db.prepare(`
      INSERT INTO pipeline_stage_runs (instance_id, stage_key, status, structured_output, output)
      VALUES (?, ?, ?, ?, ?)
    `).run(instanceId, stageKey, status, structuredOutput, output);
    return result.lastInsertRowid as number;
  }

  function createAgent(db: Database.Database, id: string, name: string): void {
    db.prepare(`INSERT INTO agents (id, name, source) VALUES (?, ?, 'openclaw')`).run(id, name);
  }

  function getRuntimeContext(db: Database.Database, instanceId: number): any {
    const row = db.prepare(`SELECT runtime_context FROM pipeline_instances WHERE id = ?`).get(instanceId) as any;
    if (!row || !row.runtime_context) {
      return { summary: '', keyDecisions: [], artifacts: [], constraints: [] };
    }
    try {
      return JSON.parse(row.runtime_context);
    } catch {
      return { summary: '', keyDecisions: [], artifacts: [], constraints: [] };
    }
  }

  function mergeRuntimeContext(
    current: any,
    output: StepOutput,
    stageKey: string
  ): any {
    const keyDecisions = (output.nextStepInput.decisions || []).map((d: any) => ({
      from: stageKey,
      decision: d.decision,
      reason: d.reason
    }));

    // Merge artifacts (avoid duplicates by URL)
    const existingUrls = new Set((current.artifacts || []).map((a: Artifact) => a.url));
    const newArtifacts = output.artifacts.filter(a => !existingUrls.has(a.url));

    return {
      ...current,
      summary: output.nextStepInput.summary,
      keyDecisions: [...(current.keyDecisions || []), ...keyDecisions],
      artifacts: [...(current.artifacts || []), ...newArtifacts],
      constraints: [...new Set([...(current.constraints || []), ...(output.nextStepInput.keyPoints || [])])],
      lastUpdatedBy: stageKey,
      lastUpdatedAt: new Date().toISOString()
    };
  }
});
