import type { StageExecutor, ExecutionContext, ExecutionResult, Artifact, ArtifactType } from './interface.js';
import { OpenClawAgentClient } from '../openclaw/agent.js';
import { ClaudeAgentClient } from '../openclaw/claude-agent.js';
import * as queries from '../db/queries.js';
import { ContextBuilder, PromptGenerator, OutputParser } from '../context/index.js';
import type { Agent, StructuredOutput } from '@pipeline/shared';

/**
 * Agent 执行器
 * 负责调用 OpenClaw 或 Claude Agent 执行任务
 *
 * Context Passing 流程：
 * 1. ContextBuilder 构建 ChainContext（从数据库获取前序阶段输出）
 * 2. PromptGenerator 生成结构化 Prompt（包含相关上下文）
 * 3. Agent 执行，返回原始输出
 * 4. OutputParser 解析输出为 StructuredOutput
 * 5. 保存 StructuredOutput 到数据库
 */
export class AgentExecutor implements StageExecutor {
  readonly type = 'agent' as const;

  private openclawClient = new OpenClawAgentClient();
  private claudeClient = new ClaudeAgentClient();
  private contextBuilder = new ContextBuilder();
  private promptGenerator = new PromptGenerator();
  private outputParser = new OutputParser();

  /**
   * 执行 Agent 任务
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { agentId, action, taskContext, stageRunId, instanceId, stageKey, input } = context;

    if (mock) {
      return this.executeMock(context);
    }

    // 获取 Agent 信息，判断类型
    const agent = queries.getAgentById(agentId || '');

    if (!agent) {
      // Agent 不存在，fallback to mock
      console.log(`[AgentExecutor] Agent "${agentId}" not found, using mock`);
      return this.executeMock(context);
    }

    // 构建 ChainContext（使用 ContextBuilder）
    const chainContext = await this.contextBuilder.build(
      instanceId || 0,
      stageKey || action,
      action
    );

    // 生成 Prompt（使用 PromptGenerator）
    const prompt = this.promptGenerator.generate(chainContext, agent, input || {});

    // 根据 Agent 类型选择客户端
    const source = agent.source || 'openclaw';

    let result: ExecutionResult;

    if (source === 'openclaw') {
      result = await this.executeWithOpenClaw(agent, action, prompt);
    } else if (source === 'claude') {
      result = await this.executeWithClaude(agent, action, prompt);
    } else {
      // 未知类型，fallback to mock
      result = await this.executeMock(context);
    }

    // 解析输出为 StructuredOutput（使用 OutputParser）
    if (result.success && result.output && stageRunId) {
      const parsed = this.outputParser.parse(result.output, action);
      if (parsed.confidence > 0.5) {
        // 保存 StructuredOutput 到数据库
        queries.setStageRunStructuredOutput(stageRunId, parsed.structured, result.output);

        // 合并提取的 artifacts
        if (parsed.structured.artifacts.length > 0) {
          result.artifacts = [...(result.artifacts || []), ...parsed.structured.artifacts];
        }
      }
    }

    return result;
  }

  /**
   * 模拟执行
   */
  private async executeMock(context: ExecutionContext): Promise<ExecutionResult> {
    const { agentId, action, componentId, instanceId, stageRunId } = context;

    // 模拟延迟 2-5 秒
    await this.delay(2000 + Math.random() * 3000);

    // 80% 成功率
    const success = Math.random() < 0.8;

    if (success) {
      const mockArtifacts = this.getMockArtifacts(action, agentId || 'default', stageRunId);
      return {
        success: true,
        output: `[Mock] Agent "${agentId || 'default'}" executed action "${action}" successfully`,
        artifacts: mockArtifacts,
        metadata: { componentId, action, executionTime: Date.now() }
      };
    }

    return {
      success: false,
      error: `[Mock] Agent "${agentId || 'default'}" failed action "${action}" (random 20% failure)`
    };
  }

  /**
   * 使用 OpenClaw 执行
   */
  private async executeWithOpenClaw(
    agent: Agent,
    action: string,
    prompt: string
  ): Promise<ExecutionResult> {
    console.log(`[AgentExecutor] Calling OpenClaw agent "${agent.id}" for action "${action}"`);

    const response = await this.openclawClient.sendMessage(agent.id, prompt);

    // 提取产物
    const artifacts = this.extractArtifacts(response.output, action);

    return {
      success: response.success,
      output: response.output,
      error: response.error,
      artifacts,
      metadata: {
        agentId: agent.id,
        action,
        duration: response.duration,
        source: 'openclaw'
      }
    };
  }

  /**
   * 使用 Claude 执行
   */
  private async executeWithClaude(
    agent: Agent,
    action: string,
    prompt: string
  ): Promise<ExecutionResult> {
    console.log(`[AgentExecutor] Calling Claude agent "${agent.id}" for action "${action}"`);

    const response = await this.claudeClient.sendMessage(
      agent.id,
      prompt,
      {
        systemPrompt: agent.systemPrompt,
        model: agent.model,
      }
    );

    // 提取产物
    const artifacts = this.extractArtifacts(response.output, action);

    return {
      success: response.success,
      output: response.output,
      error: response.error,
      artifacts,
      metadata: {
        agentId: agent.id,
        action,
        duration: response.duration,
        source: 'claude'
      }
    };
  }

  /**
   * 从输出中提取产物
   * 支持两种格式：
   * 1. Markdown 格式: ### 产物 后跟 - 文档: URL
   * 2. JSON 格式: ```artifacts\n{"urls": [...]}\n```
   */
  private extractArtifacts(output: string, action: string): Artifact[] {
    const artifacts: Artifact[] = [];

    // 方法 1：解析 Markdown 格式
    const artifactSection = output.match(/### 产物\n([\s\S]*?)(?:\n\n|$)/);
    if (artifactSection) {
      const lines = artifactSection[1].split('\n');
      for (const line of lines) {
        // 匹配格式：- 文档: URL 或 - PR: URL 等
        const match = line.match(/-\s*(文档|PR|链接|部署|测试|报告|commit)[:：]\s*(https?:\/\/\S+|file:\/\/\S+)/i);
        if (match) {
          const typeStr = match[1].toLowerCase();
          const url = match[2];
          const artifactType = this.mapArtifactType(typeStr);
          artifacts.push({
            type: artifactType,
            url,
            title: match[1],
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // 方法 2：解析 JSON 块格式
    const jsonMatch = output.match(/```artifacts\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed.urls)) {
          for (const url of parsed.urls) {
            artifacts.push({
              type: this.inferArtifactType(url, action),
              url,
              createdAt: new Date().toISOString()
            });
          }
        }
        if (Array.isArray(parsed.items)) {
          for (const item of parsed.items) {
            artifacts.push({
              type: item.type || this.inferArtifactType(item.url, action),
              url: item.url,
              title: item.title,
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.log('[AgentExecutor] Failed to parse artifacts JSON:', e);
      }
    }

    // 方法 3：直接提取 URL（github.com、docs.example.com 等）
    const urlPattern = /https?:\/\/(github\.com\/[^\/]+\/[^\/]+\/(pull|commit|blob|tree)[\/\S]+|docs\.[^\s]+|[^\/]*\.(md|html|pdf)[^\s]*)/gi;
    const directUrls = output.match(urlPattern);
    if (directUrls) {
      for (const url of directUrls) {
        // 避免重复
        if (!artifacts.some(a => a.url === url)) {
          artifacts.push({
            type: this.inferArtifactType(url, action),
            url,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return artifacts;
  }

  /**
   * 映射产物类型字符串
   */
  private mapArtifactType(typeStr: string): ArtifactType {
    const typeMap: Record<string, ArtifactType> = {
      '文档': 'document',
      'document': 'document',
      'pr': 'pr',
      'pull': 'pr',
      '部署': 'deploy',
      'deploy': 'deploy',
      'deployment': 'deploy',
      '测试': 'test_report',
      'test': 'test_report',
      '报告': 'test_report',
      'report': 'test_report',
      'commit': 'commit',
      '链接': 'other',
      'link': 'other',
    };
    return typeMap[typeStr] || 'other';
  }

  /**
   * 根据 URL 和 action 推断产物类型
   */
  private inferArtifactType(url: string, action: string): ArtifactType {
    // 根据 URL 特征推断
    if (url.includes('/pull/') || url.includes('pr')) return 'pr';
    if (url.includes('/commit/')) return 'commit';
    if (url.includes('github.com')) return action.includes('code') ? 'pr' : 'document';
    if (url.includes('deploy') || url.includes('deployment')) return 'deploy';
    if (url.includes('test') || url.includes('.test.')) return 'test_report';
    if (url.includes('security') || url.includes('audit')) return 'security_report';
    if (url.includes('docs') || url.endsWith('.md') || url.endsWith('.pdf')) return 'document';

    // 根据 action 推断
    const actionTypeMap: Record<string, ArtifactType> = {
      'requirements_analysis': 'document',
      'architecture_design': 'document',
      'code': 'pr',
      'code_dev': 'pr',
      'unit_test': 'test_report',
      'integration_test': 'test_report',
      'doc_update': 'document',
      'deploy': 'deploy',
      'security_scan': 'security_report',
    };

    return actionTypeMap[action] || 'other';
  }

  /**
   * Mock 产物生成
   */
  private getMockArtifacts(action: string, agentId: string, stageRunId?: number): Artifact[] {
    const timestamp = Date.now();

    switch (action) {
      case 'requirements_analysis':
        return [
          { type: 'document', url: `mock://docs/requirements-${timestamp}`, title: '需求分析文档' }
        ];
      case 'architecture_design':
        return [
          { type: 'document', url: `mock://docs/architecture-${timestamp}`, title: '架构设计文档' }
        ];
      case 'code':
      case 'code_dev':
        return [
          { type: 'pr', url: `mock://github/pr-${Math.floor(Math.random() * 1000)}`, title: '代码 PR' }
        ];
      case 'unit_test':
        return [
          { type: 'test_report', url: `mock://reports/unit-test-${stageRunId}`, title: '单元测试报告' }
        ];
      case 'integration_test':
        return [
          { type: 'test_report', url: `mock://reports/integration-test-${stageRunId}`, title: '集成测试报告' }
        ];
      case 'review':
        return [
          { type: 'document', url: `mock://reports/review-${timestamp}`, title: '代码审查报告' }
        ];
      case 'doc_update':
        return [
          { type: 'document', url: `mock://docs/api-${timestamp}`, title: 'API 文档' }
        ];
      case 'deploy':
        return [
          { type: 'deploy', url: `mock://deploy/v${Math.floor(Math.random() * 10)}`, title: '部署链接' }
        ];
      default:
        const hasArtifact = Math.random() > 0.3;
        return hasArtifact
          ? [{ type: 'other', url: `mock://output/${action}-${timestamp}`, title: `${action} 产物` }]
          : [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}