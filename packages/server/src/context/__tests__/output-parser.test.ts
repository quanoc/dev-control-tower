import { describe, it, expect } from 'vitest';
import { OutputParser } from '../output-parser.js';

describe('OutputParser', () => {
  const parser = new OutputParser();

  describe('parse() - JSON code block', () => {
    it('should parse JSON from markdown code block', () => {
      const input = '```json\n{"artifacts": [{"type": "document", "url": "https://example.com/doc.md"}], "nextStepInput": {"summary": "Test summary"}}\n```';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toHaveLength(1);
      expect(result.output!.artifacts[0].url).toBe('https://example.com/doc.md');
      expect(result.output!.nextStepInput.summary).toBe('Test summary');
    });

    it('should handle empty artifacts array', () => {
      const input = '```json\n{"artifacts": [], "nextStepInput": {"summary": "No artifacts"}}\n```';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toEqual([]);
      expect(result.output!.nextStepInput.summary).toBe('No artifacts');
    });
  });

  describe('parse() - OpenClaw response format', () => {
    it('should extract text from result.payloads[0].text', () => {
      const input = JSON.stringify({
        runId: 'test-uuid',
        status: 'ok',
        result: {
          payloads: [{
            text: '```json\n{"artifacts": [{"type": "pr", "url": "https://github.com/repo/pull/1"}], "nextStepInput": {"summary": "PR created"}}\n```'
          }]
        }
      });

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toHaveLength(1);
      expect(result.output!.artifacts[0].type).toBe('pr');
      expect(result.output!.nextStepInput.summary).toBe('PR created');
    });

    it('should extract from finalAssistantVisibleText', () => {
      const input = JSON.stringify({
        runId: 'test-uuid',
        status: 'ok',
        finalAssistantVisibleText: '{"artifacts": [], "nextStepInput": {"summary": "Visible text result"}}'
      });

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.nextStepInput.summary).toBe('Visible text result');
    });

    it('should extract from finalAssistantRawText', () => {
      const input = JSON.stringify({
        runId: 'test-uuid',
        finalAssistantRawText: '```json\n{"artifacts": [], "nextStepInput": {"summary": "Raw text result"}}\n```'
      });

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.nextStepInput.summary).toBe('Raw text result');
    });

    it('should handle nested JSON in payloads with code block', () => {
      const input = JSON.stringify({
        runId: 'abc-123',
        status: 'ok',
        result: {
          payloads: [{
            text: 'Here is my output:\n```json\n{\n  "artifacts": [\n    {"type": "document", "url": "file:///path/to/doc.md", "title": "My Doc"}\n  ],\n  "nextStepInput": {\n    "summary": "Complex nested output",\n    "keyPoints": ["point 1", "point 2"],\n    "decisions": [{"decision": "Use X", "reason": "It is better"}]\n  }\n}\n```'
          }]
        }
      });

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toHaveLength(1);
      expect(result.output!.nextStepInput.summary).toBe('Complex nested output');
      expect(result.output!.nextStepInput.keyPoints).toEqual(['point 1', 'point 2']);
      expect(result.output!.nextStepInput.decisions).toHaveLength(1);
    });
  });

  describe('parse() - plain JSON', () => {
    it('should parse plain JSON object', () => {
      const input = '{"artifacts": [], "nextStepInput": {"summary": "Plain JSON"}}';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.nextStepInput.summary).toBe('Plain JSON');
    });
  });

  describe('parse() - fallback extraction', () => {
    it('should extract URLs as artifacts when JSON parsing fails', () => {
      // GitHub PR URL format: https://github.com/owner/repo/pull/42
      const input = 'Check out https://github.com/owner/repo/pull/42 for the PR and https://github.com/owner/repo/commit/abc123 for the commit.';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts.length).toBeGreaterThan(0);
      // Should have extracted PR URL
      const prArtifact = result.output!.artifacts.find(a => a.url.includes('/pull/42'));
      expect(prArtifact).toBeDefined();
      expect(prArtifact!.type).toBe('pr');
    });

    it('should use raw text as summary in fallback mode', () => {
      const input = 'This is some non-JSON text that cannot be parsed.';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.nextStepInput.summary).toContain('non-JSON text');
    });
  });

  describe('parse() - artifact type inference', () => {
    it('should infer PR type from URL', () => {
      const input = '{"artifacts": [{"url": "https://github.com/owner/repo/pull/123"}], "nextStepInput": {"summary": "test"}}';

      const result = parser.parse(input);

      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts[0].type).toBe('pr');
    });

    it('should infer commit type from URL', () => {
      const input = '{"artifacts": [{"url": "https://github.com/owner/repo/commit/abc123def456"}], "nextStepInput": {"summary": "test"}}';

      const result = parser.parse(input);

      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts[0].type).toBe('commit');
    });

    it('should infer document type from .md extension', () => {
      const input = '{"artifacts": [{"url": "file:///path/to/readme.md"}], "nextStepInput": {"summary": "test"}}';

      const result = parser.parse(input);

      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts[0].type).toBe('document');
    });

    it('should infer test_report type from URL', () => {
      const input = '{"artifacts": [{"url": "https://ci.example.com/test/coverage"}], "nextStepInput": {"summary": "test"}}';

      const result = parser.parse(input);

      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts[0].type).toBe('test_report');
    });
  });

  describe('parse() - validation', () => {
    it('should reject output without nextStepInput', () => {
      const input = '{"artifacts": []}';

      const result = parser.parse(input);

      // Should fallback to URL extraction
      expect(result.error).toContain('JSON parsing failed');
    });

    it('should reject output without summary in nextStepInput', () => {
      const input = '{"artifacts": [], "nextStepInput": {}}';

      const result = parser.parse(input);

      expect(result.error).toContain('JSON parsing failed');
    });

    it('should accept output without artifacts', () => {
      const input = '{"nextStepInput": {"summary": "No artifacts needed"}}';

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toEqual([]);
      expect(result.output!.nextStepInput.summary).toBe('No artifacts needed');
    });
  });

  describe('parse() - real world examples', () => {
    it('should parse typical requirements analysis output', () => {
      const input = JSON.stringify({
        runId: 'a344e1a9-533f-4981-9fa5-b2dbe41c87ab',
        status: 'ok',
        result: {
          payloads: [{
            text: '```json\n{\n  "artifacts": [\n    {\n      "type": "document",\n      "url": "file:///root/.openclaw/workspace/xiaoxi-pm/requirements-用户管理模块.md",\n      "title": "电商后台用户管理模块需求文档"\n    }\n  ],\n  "nextStepInput": {\n    "summary": "完成电商后台用户管理模块需求分析",\n    "keyPoints": [\n      "需求划分为3个Epic：用户管理CRUD、角色与权限管理、批量操作",\n      "定义10个用户故事"\n    ],\n    "decisions": [\n      {"decision": "采用用户故事+验收标准的格式", "reason": "便于开发团队理解"}\n    ]\n  }\n}\n```'
          }]
        }
      });

      const result = parser.parse(input);

      expect(result.success).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.output!.artifacts).toHaveLength(1);
      expect(result.output!.artifacts[0].title).toBe('电商后台用户管理模块需求文档');
      expect(result.output!.nextStepInput.summary).toBe('完成电商后台用户管理模块需求分析');
      expect(result.output!.nextStepInput.keyPoints).toHaveLength(2);
      expect(result.output!.nextStepInput.decisions).toHaveLength(1);
    });
  });
});
