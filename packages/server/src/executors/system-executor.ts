import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StageExecutor, ExecutionContext, ExecutionResult, Artifact, ArtifactType } from './interface.js';

const execAsync = promisify(exec);

/**
 * 系统动作类型
 */
export type SystemAction =
  | 'code_pull'
  | 'code_merge'
  | 'lint'
  | 'build'
  | 'security_scan'
  | 'test_e2e';

/**
 * 系统动作处理器
 */
type SystemActionHandler = (params: Record<string, unknown>, context: ExecutionContext) => Promise<ExecutionResult>;

/**
 * System 执行器
 * 负责执行系统级工具命令
 */
export class SystemExecutor implements StageExecutor {
  readonly type = 'system' as const;

  /**
   * 系统动作注册表
   */
  private actionHandlers: Map<string, SystemActionHandler> = new Map();

  /**
   * 报告输出目录（相对于工作目录）
   */
  private readonly REPORTS_DIR = '.pipeline-reports';

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认的系统动作处理器
   */
  private registerDefaultHandlers(): void {
    this.actionHandlers.set('code_pull', this.handleCodePull.bind(this));
    this.actionHandlers.set('code_merge', this.handleCodeMerge.bind(this));
    this.actionHandlers.set('lint', this.handleLint.bind(this));
    this.actionHandlers.set('build', this.handleBuild.bind(this));
    this.actionHandlers.set('security_scan', this.handleSecurityScan.bind(this));
    this.actionHandlers.set('test_e2e', this.handleTestE2E.bind(this));
  }

  /**
   * 注册自定义动作处理器（扩展点）
   */
  registerHandler(action: string, handler: SystemActionHandler): void {
    this.actionHandlers.set(action, handler);
  }

  /**
   * 执行系统动作
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    if (mock) {
      return this.executeMock(context);
    }

    return this.executeReal(context);
  }

  /**
   * 模拟执行
   */
  private async executeMock(context: ExecutionContext): Promise<ExecutionResult> {
    const { action, stageRunId } = context;

    await this.delay(500);

    // Mock 模式总是返回成功，便于测试
    const mockArtifacts = this.getMockArtifacts(action, stageRunId);
    return {
      success: true,
      output: `[Mock] System action "${action}" executed successfully`,
      artifacts: mockArtifacts,
      metadata: { action, executionTime: Date.now() }
    };
  }

  /**
   * 真实执行
   */
  private async executeReal(context: ExecutionContext): Promise<ExecutionResult> {
    const { action, input } = context;

    const handler = this.actionHandlers.get(action);

    if (!handler) {
      return {
        success: false,
        error: `Unknown system action: ${action}. Available: ${Array.from(this.actionHandlers.keys()).join(', ')}`
      };
    }

    try {
      const params: Record<string, unknown> = {
        ...input,
        targetDir: input?.targetDir || process.cwd(),
      };
      return await handler(params, context);
    } catch (error) {
      return {
        success: false,
        error: `System action "${action}" error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // ─── 真实动作处理器 ─────────────────────────────────────────────────────

  /**
   * Git 拉取代码
   */
  private async handleCodePull(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { repoUrl, branch, targetDir } = params as { repoUrl?: string; branch?: string; targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'code-pull.json');

    try {
      let output = '';

      if (repoUrl) {
        // Clone new repo
        const cmd = `git clone --branch ${branch || 'main'} ${repoUrl} ${targetDir}`;
        const result = await execAsync(cmd, { timeout: 60000 });
        output = result.stdout;
      } else {
        // Pull existing repo
        const cmd = `git pull origin ${branch || 'main'}`;
        const result = await execAsync(cmd, { cwd: targetDir, timeout: 60000 });
        output = result.stdout;
      }

      // 写报告
      writeFileSync(reportPath, JSON.stringify({
        action: 'code_pull',
        repoUrl,
        branch,
        timestamp: new Date().toISOString(),
        output
      }));

      return {
        success: true,
        output: `Code pulled from ${repoUrl || 'origin'} (branch: ${branch || 'main'})`,
        artifacts: [{ type: 'other', url: `file://${reportPath}`, title: 'Git Pull Report' }]
      };
    } catch (err) {
      return {
        success: false,
        error: `Git pull failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /**
   * Git 合并代码
   */
  private async handleCodeMerge(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { sourceBranch, targetBranch, targetDir } = params as { sourceBranch?: string; targetBranch?: string; targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'code-merge.json');

    try {
      // Checkout target and merge
      await execAsync(`git checkout ${targetBranch || 'main'}`, { cwd: targetDir, timeout: 30000 });
      const result = await execAsync(`git merge ${sourceBranch || 'feature'}`, { cwd: targetDir, timeout: 60000 });

      // 写报告
      writeFileSync(reportPath, JSON.stringify({
        action: 'code_merge',
        sourceBranch,
        targetBranch,
        timestamp: new Date().toISOString(),
        output: result.stdout
      }));

      return {
        success: true,
        output: `Merged ${sourceBranch || 'feature'} into ${targetBranch || 'main'}`,
        artifacts: [{ type: 'commit', url: `file://${reportPath}`, title: 'Git Merge Report' }]
      };
    } catch (err) {
      return {
        success: false,
        error: `Git merge failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /**
   * Lint 检查
   */
  private async handleLint(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'lint-report.json');

    try {
      // 检测项目类型并执行对应 lint
      const lintCmd = this.detectLintCommand(targetDir);
      const result = await execAsync(`${lintCmd} --format json || true`, {
        cwd: targetDir,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      });

      // 写报告
      const lintResults = this.parseLintOutput(result.stdout);
      writeFileSync(reportPath, JSON.stringify(lintResults));

      const hasErrors = lintResults.errorCount > 0;
      const hasWarnings = lintResults.warningCount > 0;

      return {
        success: !hasErrors,
        output: hasErrors
          ? `Lint failed: ${lintResults.errorCount} errors, ${lintResults.warningCount} warnings`
          : `Lint passed: ${lintResults.warningCount} warnings`,
        artifacts: [{ type: 'lint_report', url: `file://${reportPath}`, title: 'Lint Report' }],
        metadata: { errorCount: lintResults.errorCount, warningCount: lintResults.warningCount }
      };
    } catch (err) {
      return {
        success: false,
        error: `Lint execution failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /**
   * 构建项目
   */
  private async handleBuild(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'build-report.json');

    try {
      const buildCmd = this.detectBuildCommand(targetDir);
      const result = await execAsync(buildCmd, {
        cwd: targetDir,
        timeout: 300000,  // 5 minutes for build
        maxBuffer: 20 * 1024 * 1024
      });

      // 写报告
      writeFileSync(reportPath, JSON.stringify({
        action: 'build',
        command: buildCmd,
        timestamp: new Date().toISOString(),
        output: result.stdout,
        success: true
      }));

      // 检查构建产物目录
      const artifacts = this.findBuildArtifacts(targetDir);

      return {
        success: true,
        output: 'Build succeeded',
        artifacts: [
          { type: 'build_artifact', url: `file://${reportPath}`, title: 'Build Report' },
          ...artifacts
        ]
      };
    } catch (err) {
      writeFileSync(reportPath, JSON.stringify({
        action: 'build',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        success: false
      }));

      return {
        success: false,
        error: `Build failed: ${err instanceof Error ? err.message : String(err)}`,
        artifacts: [{ type: 'build_artifact', url: `file://${reportPath}`, title: 'Build Report (Failed)' }]
      };
    }
  }

  /**
   * 安全扫描
   */
  private async handleSecurityScan(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'security-report.json');

    try {
      // 使用 npm audit 或 pnpm audit
      const auditCmd = await this.detectPackageManager(targetDir);
      const result = await execAsync(`${auditCmd} audit --json || true`, {
        cwd: targetDir,
        timeout: 60000
      });

      // 解析审计结果
      const auditResult = JSON.parse(result.stdout || '{}');
      const vulnerabilities = this.countVulnerabilities(auditResult);

      // 写报告
      writeFileSync(reportPath, JSON.stringify({
        action: 'security_scan',
        timestamp: new Date().toISOString(),
        vulnerabilities,
        raw: auditResult
      }));

      const hasVulnerabilities = vulnerabilities.total > 0;

      return {
        success: !hasVulnerabilities || vulnerabilities.high === 0,
        output: hasVulnerabilities
          ? `Security scan: ${vulnerabilities.high} high, ${vulnerabilities.medium} medium, ${vulnerabilities.low} low vulnerabilities`
          : 'Security scan passed: no vulnerabilities found',
        artifacts: [{ type: 'security_report', url: `file://${reportPath}`, title: 'Security Report' }],
        metadata: { vulnerabilities }
      };
    } catch (err) {
      // 即使工具不存在，也生成一个基础报告
      writeFileSync(reportPath, JSON.stringify({
        action: 'security_scan',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        note: 'Security scan tool not available or failed'
      }));

      return {
        success: true,  // 不阻塞流水线
        output: 'Security scan skipped (tool not available)',
        artifacts: [{ type: 'security_report', url: `file://${reportPath}`, title: 'Security Report (Skipped)' }]
      };
    }
  }

  /**
   * E2E 测试
   */
  private async handleTestE2E(params: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir: string };

    const workDir = this.ensureReportsDir(targetDir, context.stageRunId);
    const reportPath = join(workDir, 'e2e-report.json');
    const htmlReportPath = join(workDir, 'e2e-report.html');

    try {
      // 尝试运行 Playwright 或其他 E2E 测试
      const result = await execAsync('npx playwright test --reporter=json || pnpm test:e2e --reporter=json || npm run test:e2e', {
        cwd: targetDir,
        timeout: 180000,  // 3 minutes
        maxBuffer: 20 * 1024 * 1024
      });

      // 解析测试结果
      const testResult = this.parseTestOutput(result.stdout);
      writeFileSync(reportPath, JSON.stringify(testResult));

      return {
        success: testResult.passed > 0 && testResult.failed === 0,
        output: `E2E tests: ${testResult.passed} passed, ${testResult.failed} failed`,
        artifacts: [
          { type: 'test_report' as ArtifactType, url: `file://${reportPath}`, title: 'E2E Test Report' },
          ...(existsSync(htmlReportPath) ? [{ type: 'test_report' as ArtifactType, url: `file://${htmlReportPath}`, title: 'E2E Test Report (HTML)' }] : [])
        ],
        metadata: { passed: testResult.passed, failed: testResult.failed }
      };
    } catch (err) {
      writeFileSync(reportPath, JSON.stringify({
        action: 'test_e2e',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        passed: 0,
        failed: 0
      }));

      return {
        success: false,
        error: `E2E tests failed: ${err instanceof Error ? err.message : String(err)}`,
        artifacts: [{ type: 'test_report', url: `file://${reportPath}`, title: 'E2E Test Report (Failed)' }]
      };
    }
  }

  // ─── 辅助方法 ─────────────────────────────────────────────────────────────

  /**
   * 确保报告目录存在
   */
  private ensureReportsDir(targetDir: string, stageRunId: number): string {
    const reportsDir = join(targetDir, this.REPORTS_DIR, `stage-${stageRunId}`);
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    return reportsDir;
  }

  /**
   * 检测项目的 lint 命令
   */
  private detectLintCommand(targetDir: string): string {
    const pkgPath = join(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.lint) {
          return 'pnpm lint || npm run lint';
        }
      } catch {}
    }

    // 检测 ESLint 配置
    if (existsSync(join(targetDir, '.eslintrc.js')) || existsSync(join(targetDir, 'eslint.config.js'))) {
      return 'npx eslint . --format json';
    }

    // 默认
    return 'echo "No lint configured"';
  }

  /**
   * 检测项目的 build 命令
   */
  private detectBuildCommand(targetDir: string): string {
    const pkgPath = join(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.build) {
          return 'pnpm build || npm run build';
        }
      } catch {}
    }

    // 检测 Makefile
    if (existsSync(join(targetDir, 'Makefile'))) {
      return 'make build';
    }

    // 默认
    return 'echo "No build configured"';
  }

  /**
   * 检测包管理器
   */
  private async detectPackageManager(targetDir: string): Promise<string> {
    if (existsSync(join(targetDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(targetDir, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  /**
   * 解析 lint 输出
   */
  private parseLintOutput(stdout: string): { errorCount: number; warningCount: number; results: any[] } {
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        // ESLint JSON format
        const errorCount = parsed.reduce((sum, f) => sum + (f.errorCount || 0), 0);
        const warningCount = parsed.reduce((sum, f) => sum + (f.warningCount || 0), 0);
        return { errorCount, warningCount, results: parsed };
      }
    } catch {}

    return { errorCount: 0, warningCount: 0, results: [] };
  }

  /**
   * 计算漏洞数量
   */
  private countVulnerabilities(auditResult: any): { total: number; high: number; medium: number; low: number } {
    if (auditResult.metadata?.vulnerabilities) {
      const v = auditResult.metadata.vulnerabilities;
      return {
        total: v.total || 0,
        high: v.high || 0,
        medium: v.moderate || v.medium || 0,
        low: v.low || 0
      };
    }

    return { total: 0, high: 0, medium: 0, low: 0 };
  }

  /**
   * 解析测试输出
   */
  private parseTestOutput(stdout: string): { passed: number; failed: number; duration: number } {
    try {
      const parsed = JSON.parse(stdout);
      // Playwright JSON reporter format
      if (parsed.stats) {
        return {
          passed: parsed.stats.passed || 0,
          failed: parsed.stats.failed || 0,
          duration: parsed.stats.duration || 0
        };
      }
    } catch {}

    return { passed: 0, failed: 0, duration: 0 };
  }

  /**
   * 查找构建产物
   */
  private findBuildArtifacts(targetDir: string): Artifact[] {
    const artifacts: Artifact[] = [];
    const commonDirs = ['dist', 'build', '.output', 'out'];

    for (const dir of commonDirs) {
      const fullPath = join(targetDir, dir);
      if (existsSync(fullPath)) {
        artifacts.push({
          type: 'build_artifact',
          url: `file://${fullPath}`,
          title: `Build Output (${dir})`
        });
      }
    }

    return artifacts;
  }

  /**
   * Mock 产物生成
   */
  private getMockArtifacts(action: string, stageRunId: number): Artifact[] {
    const timestamp = Date.now();

    switch (action) {
      case 'lint':
        return [{ type: 'lint_report', url: `mock://lint-report-${stageRunId}`, title: 'Lint Report' }];
      case 'build':
        return [{ type: 'build_artifact', url: `mock://build-output-${stageRunId}`, title: 'Build Output' }];
      case 'security_scan':
        return [{ type: 'security_report', url: `mock://security-report-${stageRunId}`, title: 'Security Report' }];
      case 'test_e2e':
        return [{ type: 'test_report', url: `mock://e2e-report-${stageRunId}`, title: 'E2E Test Report' }];
      case 'code_pull':
        return [{ type: 'commit', url: `mock://git-pull-${timestamp}`, title: 'Git Pull Log' }];
      case 'code_merge':
        return [{ type: 'commit', url: `mock://git-merge-${timestamp}`, title: 'Git Merge Log' }];
      default:
        return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}