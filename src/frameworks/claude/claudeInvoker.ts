import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Logger } from 'pino';

import { getProjectAgents, getFollowupAgents, loadProjectConfig } from '@/config/projectConfig.js';
import { buildAuditScopeDirective } from '@/frameworks/claude/auditScopeDirective.js';
import { broadcastBudgetAfterUsage } from '@/frameworks/claude/broadcastBudgetAfterUsage.js';
import { buildLanguageDirective } from '@/frameworks/claude/languageDirective.js';
import { logInfo, logWarn, logError } from '@/frameworks/logging/logBuffer.js';
import { getModel, getReviewTimeoutMs } from '@/frameworks/settings/runtimeSettings.js';
import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { McpCompletionBridge } from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import type { ReviewReportGateway } from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';
import { InMemoryBillingStateGateway } from '@/modules/claude-invocation/interface-adapters/gateways/billingState.memory.gateway.js';
import {
  ClaudeSessionCliGateway,
  type ClaudeProcessRunner,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { ProcessEnvironmentGateway } from '@/modules/claude-invocation/interface-adapters/gateways/environment.process.gateway.js';
import { FileSystemMcpCompletionBridge } from '@/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.fileSystem.gateway.js';
import { ReviewReportFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/reviewReport.fileSystem.gateway.js';
import { runClaudeReviewJob } from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import { defaultGitHubExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';
import { defaultGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { ClaudeModelName } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';
import type {
  ReviewProgress,
  ProgressEvent,
} from '@/modules/review-execution/entities/progress/progress.type.js';
import { ProjectConfigRoutingPolicyGateway } from '@/modules/review-execution/interface-adapters/gateways/projectConfig/routingPolicy.projectConfig.gateway.js';
import { SelectModelForReviewUseCase } from '@/modules/review-execution/usecases/selectModelForReview/selectModelForReview.usecase.js';
import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { GitHubDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.js';
import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { ProjectStatsCalculator } from '@/modules/statistics-insights/interface-adapters/presenters/projectStats.calculator.js';
import { fetchDiffStatsSafely } from '@/modules/statistics-insights/services/fetchDiffStatsSafely.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import type {
  TokenUsage,
  TokenUsageRecord,
} from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import { FilesystemBudgetGateway } from '@/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.js';
import { FilesystemTokenUsageGateway } from '@/modules/token-accounting/interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.js';
import {
  BudgetStatusPresenter,
  type BudgetStatusViewModel,
} from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { TrackTokenUsageUseCase } from '@/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.js';
import { FileSystemReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.js';
import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { MrSource } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { GitCommandCliGateway } from '@/modules/worktree-management/interface-adapters/gateways/gitCommand.cli.gateway.js';
import { WorktreeFileSystemGateway } from '@/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.js';
import { resolveClaudeCwd } from '@/modules/worktree-management/services/claudeCwd.js';
import { resolveClaudePath } from '@/shared/services/claudePathResolver.js';
import { getJobContextFilePath } from '@/shared/services/mcpJobContext.js';

/**
 * Bundle of gateways needed by runClaudeReviewJob. Built in the composition
 * root so the Fastify process, the supervisor/billing timers, and the MCP
 * completion bridge can share the same instances.
 */
export interface ClaudeInvocationDeps {
  sessionGateway: ClaudeSessionGateway;
  completionBridge: McpCompletionBridge;
  reportGateway: ReviewReportGateway;
  billingState: BillingStateGateway;
  environment: EnvironmentGateway;
  timeoutMs: number;
  pollIntervalMs: number;
}

/**
 * Gateways and use cases required by invokeClaudeReview. Extracted from the
 * function body so production wiring stays in the composition root and tests
 * can inject stubs without mocking the entire function.
 */
export interface ClaudeInvokerDependencies {
  diffStatsFetchFactory: (
    platform: 'gitlab' | 'github',
  ) => GitLabDiffStatsFetchGateway | GitHubDiffStatsFetchGateway;
  routingPolicyGateway: ProjectConfigRoutingPolicyGateway;
  selectModelForReview: SelectModelForReviewUseCase;
  trackingGateway: FileSystemReviewRequestTrackingGateway;
  statsGateway: StatsGateway;
  trackTokenUsage: TrackTokenUsageUseCase;
  getBudgetStatus: GetBudgetStatusUseCase;
  budgetStatusPresenter: BudgetStatusPresenter;
  broadcastBudgetStatus: (viewModel: BudgetStatusViewModel) => void;
  getEnabledLocalPaths?: () => string[];
  invocation: ClaudeInvocationDeps;
  worktreeGateway: WorktreeGateway;
  gitExecutor: GitCommandExecutor;
}

/**
 * Default wiring used when invokeClaudeReview is called without explicit deps.
 *
 * Production (the HTTP daemon) MUST override `broadcastBudgetStatus` and
 * `getEnabledLocalPaths` from the composition root in `main/routes.ts`,
 * otherwise the live budget broadcast and the multi-localPath sum are lost.
 * The no-op `broadcastBudgetStatus` here is intentional for tests and CLI
 * one-shots where there is no WebSocket fanout to perform.
 */
/**
 * Build the environment for spawning a Claude child process.
 *
 * Strips CLAUDECODE so a Claude-launched ReviewFlow does not leak its parent
 * session marker into the child, and forces TERM=dumb + CI=true to keep the
 * child in non-interactive mode.
 */
export function buildSpawnEnv(
  processEnv: NodeJS.ProcessEnv,
  override?: Record<string, string>,
): NodeJS.ProcessEnv {
  const { CLAUDECODE: _claudeCode, ...rest } = processEnv;
  return {
    ...rest,
    TERM: 'dumb',
    CI: 'true',
    ...override,
  };
}

/**
 * Default process runner used by createDefaultClaudeInvocationDeps when the
 * composition root does not provide one. Wraps node:child_process.spawn so
 * tests can inject a fake runner instead.
 */
export function defaultProcessRunner(): ClaudeProcessRunner {
  return async ({ args, cwd, env }) =>
    new Promise((resolve, reject) => {
      const child = spawn(resolveClaudePath(), args, {
        cwd,
        env: buildSpawnEnv(process.env, env),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
}

export function createDefaultClaudeInvocationDeps(): ClaudeInvocationDeps {
  return {
    sessionGateway: new ClaudeSessionCliGateway(defaultProcessRunner()),
    // FileSystem-backed because the MCP server runs in a sub-process spawned
    // by `claude --bg`, so an in-memory bridge cannot reach the Fastify host.
    // See FileSystemMcpCompletionBridge for the wire format.
    completionBridge: new FileSystemMcpCompletionBridge(),
    reportGateway: new ReviewReportFileSystemGateway(),
    billingState: new InMemoryBillingStateGateway(),
    environment: new ProcessEnvironmentGateway(),
    timeoutMs: getReviewTimeoutMs(),
    pollIntervalMs: 30 * 1000,
  };
}

export function createDefaultClaudeInvokerDependencies(): ClaudeInvokerDependencies {
  const tokenUsageGateway = new FilesystemTokenUsageGateway();
  const budgetGateway = new FilesystemBudgetGateway();
  const gitExecutor = new GitCommandCliGateway();
  return {
    diffStatsFetchFactory: (platform) =>
      platform === 'github'
        ? new GitHubDiffStatsFetchGateway(defaultGitHubExecutor)
        : new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
    routingPolicyGateway: new ProjectConfigRoutingPolicyGateway(),
    selectModelForReview: new SelectModelForReviewUseCase(),
    trackingGateway: new FileSystemReviewRequestTrackingGateway(new ProjectStatsCalculator()),
    statsGateway: new FileSystemStatsGateway(),
    trackTokenUsage: new TrackTokenUsageUseCase(tokenUsageGateway),
    getBudgetStatus: new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway }),
    budgetStatusPresenter: new BudgetStatusPresenter(),
    broadcastBudgetStatus: () => {},
    invocation: createDefaultClaudeInvocationDeps(),
    worktreeGateway: new WorktreeFileSystemGateway({ executor: gitExecutor }),
    gitExecutor,
  };
}

const currentDir = dirname(fileURLToPath(import.meta.url));

export function resolveMcpServerPath(): string {
  // dist/frameworks/claude/claudeInvoker.js → dist/mcpServer.js
  const candidate = join(currentDir, '..', '..', 'mcpServer.js');
  if (existsSync(candidate)) return candidate;

  // Fallback for tsx dev mode: currentDir is src/frameworks/claude/
  const devCandidate = join(process.cwd(), 'dist', 'mcpServer.js');
  if (existsSync(devCandidate)) return devCandidate;

  throw new Error(
    `MCP server not found at: ${candidate} or ${devCandidate}\n` +
      'Run "yarn build" to compile the project.',
  );
}

export function writeMcpContext(job: ReviewJob): void {
  try {
    const filePath = getJobContextFilePath(job.id);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const mergeRequestId = `${job.platform}-${job.projectPath}-${job.mrNumber}`;
    const context = {
      jobId: job.id,
      localPath: job.localPath,
      mergeRequestId,
      jobType: job.jobType || 'review',
      platform: job.platform,
      projectPath: job.projectPath,
      sourceBranch: job.sourceBranch,
      targetBranch: job.targetBranch,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(context, null, 2));
  } catch {
    // Non-critical, MCP will work without context
  }
}

/**
 * Build MCP config JSON for --mcp-config flag.
 * Returns a self-contained JSON string with ONLY the review-progress server.
 * Used with --strict-mcp-config to isolate reviews from project .mcp.json
 * (which may contain other MCP servers that cause timeouts).
 */
export function buildMcpConfigJson(): string {
  const mcpServerPath = resolveMcpServerPath();
  return JSON.stringify({
    mcpServers: {
      'review-progress': {
        command: 'node',
        args: [mcpServerPath],
      },
    },
  });
}

export function cleanupMcpContext(jobId: string): void {
  try {
    const filePath = getJobContextFilePath(jobId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Memory guard configuration
// Memory guard removed alongside the synchronous spawn loop (SPEC-169 B1).
// `claude --bg` runs the review in a separate supervised process, so RSS
// monitoring of the Fastify host is no longer relevant. Reintroduce if a new
// host-side leak is observed.

export interface InvocationResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  finalProgress?: ReviewProgress;
  cancelled?: boolean;
  usage?: TokenUsage | null;
  selectedModel?: ClaudeModelName;
}

function fetchDiffStatsForJob(
  job: ReviewJob,
  deps: ClaudeInvokerDependencies,
  logger: Logger,
): DiffStats | null {
  const gateway = deps.diffStatsFetchFactory(job.platform);
  return fetchDiffStatsSafely(gateway, job.projectPath, job.mrNumber, logger);
}

async function resolveModel(
  job: ReviewJob,
  diffStats: DiffStats | null,
  deps: ClaudeInvokerDependencies,
  logger: Logger,
): Promise<ClaudeModelName> {
  if (job.model) {
    return job.model;
  }

  let defaultModel: ClaudeModelName = getModel();
  try {
    const projectConfig = loadProjectConfig(job.localPath);
    if (projectConfig?.defaultModel) {
      defaultModel = projectConfig.defaultModel;
    }
  } catch (error) {
    logger.warn({ jobId: job.id, error }, 'Failed to load project config, using runtime default');
  }

  const policy = await deps.routingPolicyGateway.load(job.localPath);
  if (!policy || !diffStats) {
    return defaultModel;
  }

  return deps.selectModelForReview.execute({ diffStats, policy, defaultModel });
}

export type ProgressCallback = (progress: ReviewProgress, event?: ProgressEvent) => void;

/**
 * Build MCP system prompt for progress tracking
 * This instruction is AUTHORITATIVE and forces Claude to use MCP tools
 */
export function buildMcpSystemPrompt(job: ReviewJob): string {
  const reportSuffix = (job.jobType || 'review') === 'followup' ? 'followup' : 'review';
  const auditScopeDirective = buildAuditScopeDirective(job.auditScope ?? []);
  return `
# AUTOMATED REVIEW MODE - EXECUTE IMMEDIATELY

## CRITICAL EXECUTION RULES

You are running in FULLY AUTOMATED, NON-INTERACTIVE mode.
- **EXECUTE the skill instructions step by step RIGHT NOW**
- Do NOT produce a "plan" or "summary" of what you will do
- Do NOT wait for approval, confirmation, or user input
- Do NOT say "once approved", "when you confirm", or "the plan is ready"
- Do NOT use EnterPlanMode or AskUserQuestion (they are disabled)
- Your output goes to a log file, not to a human

## PROJECT CLAUDE.md RULES CLARIFICATION

The project CLAUDE.md may contain rules like "mandatory skills before writing code" (/tdd, /architecture, /anti-overengineering).
These rules are about WRITING production code. You are in **READ-ONLY review mode** — you are NOT writing code.
- These mandatory-before-coding rules do NOT apply to you
- You CAN and SHOULD read/load any skill files referenced by the review skill (e.g. architecture/SKILL.md, tdd/SKILL.md) as audit references
- Do NOT invoke skills as interactive workflows — READ them for review criteria only
- JUST FOLLOW the review/followup skill instructions and EXECUTE each step

## Your Job Context
- **Job ID**: \`${job.id}\`
- **Job Type**: ${job.jobType || 'review'}
- **Platform**: ${job.platform}
- **Project**: ${job.projectPath}
- **MR Number**: ${job.mrNumber}
- **Source Branch**: ${job.sourceBranch || 'unknown'}
- **Target Branch**: ${job.targetBranch || 'unknown'}

The current working directory is the dedicated worktree for this MR. The branch is already
checked out and up to date — \`git diff\`, \`git log\`, and local file reads reflect MR state.
For thread metadata always use the MCP tool: \`get_threads({ jobId: "${job.id}" })\`.

## MANDATORY MCP Tools Usage

You MUST use these MCP tools for ALL operations. Do NOT use text markers.

### Phase Management
\`\`\`
set_phase({ jobId: "${job.id}", phase: "initializing" })
set_phase({ jobId: "${job.id}", phase: "agents-running" })
set_phase({ jobId: "${job.id}", phase: "synthesizing" })
set_phase({ jobId: "${job.id}", phase: "publishing" })
set_phase({ jobId: "${job.id}", phase: "completed" })
\`\`\`

### Agent Progress (call for EACH audit/step)
\`\`\`
start_agent({ jobId: "${job.id}", agentName: "agent-name" })
complete_agent({ jobId: "${job.id}", agentName: "agent-name", status: "success" })
complete_agent({ jobId: "${job.id}", agentName: "agent-name", status: "failed", error: "message" })
\`\`\`

### GitLab/GitHub Actions (USE THESE - do NOT use glab/gh CLI)
\`\`\`
get_threads({ jobId: "${job.id}" })
add_action({ jobId: "${job.id}", type: "THREAD_RESOLVE", threadId: "xxx" })
add_action({ jobId: "${job.id}", type: "THREAD_REPLY", threadId: "xxx", message: "..." })
add_action({ jobId: "${job.id}", type: "POST_COMMENT", body: "..." })
add_action({ jobId: "${job.id}", type: "POST_INLINE_COMMENT", filePath: "src/file.ts", line: 42, body: "..." })
\`\`\`

### Inline Comments on Diff
Use \`POST_INLINE_COMMENT\` to post comments directly on specific lines in the diff.
- **filePath**: The file path relative to the repository root
- **line**: The line number in the NEW version of the file (must be a line visible in the diff)
- **body**: The comment text (supports markdown)
- The diff metadata (SHAs) is pre-fetched automatically — just provide filePath, line, and body

## Workflow Pattern

1. **Start**: \`set_phase({ jobId: "${job.id}", phase: "initializing" })\`
2. **Before each audit**: \`start_agent({ jobId: "${job.id}", agentName: "xxx" })\`
3. **After each audit**: \`complete_agent({ jobId: "${job.id}", agentName: "xxx", status: "success" })\`
4. **Synthesis**: \`set_phase({ jobId: "${job.id}", phase: "synthesizing" })\`
5. **Threads**: \`start_agent({ jobId: "${job.id}", agentName: "threads" })\` then \`complete_agent\`
6. **Report**: \`start_agent({ jobId: "${job.id}", agentName: "report" })\` then \`complete_agent\`
7. **Publishing**: \`set_phase({ jobId: "${job.id}", phase: "publishing" })\`
8. **End**: \`set_phase({ jobId: "${job.id}", phase: "completed" })\`

**VIOLATIONS**:
- Producing a "plan" instead of executing → Review will be empty
- Using text markers like [PROGRESS:xxx] → Dashboard won't update
- Waiting for user approval → Review will hang forever

## REPORT OUTPUT PATH — MANDATORY

The review report is a DELIVERABLE, not a temporary file. Write it with the Write tool to EXACTLY this path, relative to the current working directory:

\`\`\`
.claude/reviews/<YYYY-MM-DD>-MR-${job.mrNumber}-${reportSuffix}.md
\`\`\`

- Create the \`.claude/reviews/\` directory if it does not exist.
- Do NOT write the report to \`/tmp\`, to \`$CLAUDE_JOB_DIR/tmp\`, or to any other temporary/scratch directory — even if a background-session instruction tells you to place temporary files there. That instruction does NOT apply to the review report; the report saved anywhere other than \`.claude/reviews/\` is LOST and the job FAILS with \`report-missing\`.

${buildLanguageDirective(job.language ?? 'en')}

${auditScopeDirective}
`.trim();
}

/**
 * Invoke Claude Code CLI for a review job
 * @param job - The review job to execute
 * @param logger - Pino logger instance
 * @param onProgress - Optional callback for progress updates
 * @param signal - Optional AbortSignal to cancel the review
 */
export async function invokeClaudeReview(
  job: ReviewJob,
  logger: Logger,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  deps: ClaudeInvokerDependencies = createDefaultClaudeInvokerDependencies(),
): Promise<InvocationResult> {
  const startTime = Date.now();

  // Build the prompt
  const prompt = `/${job.skill} ${job.mrNumber}`;

  // Fetch diff stats once: reused for both model routing and end-of-review stats
  const diffStats = fetchDiffStatsForJob(job, deps, logger);

  // Select model: explicit job override > routing policy + diff stats > project default > runtime default
  const model = await resolveModel(job, diffStats, deps, logger);

  // Build MCP system prompt injection
  const mcpSystemPrompt = buildMcpSystemPrompt(job);

  // Build MCP config: isolated from project .mcp.json to avoid
  // third-party MCP servers (e.g. gitnexus) causing initialization timeouts
  const mcpConfigJson = buildMcpConfigJson();

  // Build arguments for the --bg (background subscription billing) invocation.
  // The session id is captured from stdout; completion is observed through MCP
  // (set_phase) or `claude agents --json` polling. No -p, no --print, no stream-json.
  const args = [
    '--bg',
    '--model',
    model,
    '--permission-mode',
    'auto',
    '--append-system-prompt',
    mcpSystemPrompt,
    '--mcp-config',
    mcpConfigJson,
    '--strict-mcp-config',
    '--allowedTools',
    'Read,Glob,Grep,Bash,Edit,Task,Skill,Write,LSP,mcp__review-progress__*',
    '--disallowedTools',
    'EnterPlanMode,AskUserQuestion',
    prompt,
  ];

  // Setup MCP job context file (used by MCP server to identify the review)
  writeMcpContext(job);

  logger.info(
    {
      cwd: job.localPath,
      prompt,
      args,
    },
    'Invocation Claude CLI',
  );

  // Load project-specific agents configuration (use followup agents for followup jobs)
  const isFollowup = job.jobType === 'followup';
  const projectAgents = isFollowup
    ? getFollowupAgents(job.localPath)
    : getProjectAgents(job.localPath);

  // Log to dashboard
  logInfo(isFollowup ? 'Démarrage followup Claude' : 'Démarrage review Claude', {
    jobId: job.id,
    mrNumber: job.mrNumber,
    skill: job.skill,
    project: job.projectPath,
    model,
    jobType: job.jobType || 'review',
    customAgents: projectAgents?.length ?? 'default',
  });

  // Check if already cancelled
  if (signal?.aborted) {
    logWarn('Review annulée avant démarrage', { jobId: job.id });
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: 'Review cancelled before start',
      durationMs: Date.now() - startTime,
      cancelled: true,
    };
  }

  return invokeViaBackgroundSession(
    {
      job,
      prompt,
      model,
      mcpSystemPrompt,
      mcpConfigJson,
      diffStats,
      startTime,
      signal,
    },
    logger,
    onProgress,
    deps,
  );
}

interface BackgroundDispatchContext {
  job: ReviewJob;
  prompt: string;
  model: ClaudeModelName;
  mcpSystemPrompt: string;
  mcpConfigJson: string;
  diffStats: DiffStats | null;
  startTime: number;
  signal?: AbortSignal;
}

function deriveMrSourceFromJob(job: ReviewJob): MrSource {
  if (job.sourceForkCloneUrl) {
    return { kind: 'fork', cloneUrl: job.sourceForkCloneUrl };
  }
  return { kind: 'origin' };
}

async function invokeViaBackgroundSession(
  context: BackgroundDispatchContext,
  logger: Logger,
  onProgress: ProgressCallback | undefined,
  deps: ClaudeInvokerDependencies,
): Promise<InvocationResult> {
  const { job, prompt, model, mcpSystemPrompt, mcpConfigJson, diffStats, startTime, signal } =
    context;
  const invocation = deps.invocation;
  const mergeRequestId = `${job.platform}-${job.projectPath}-${job.mrNumber}`;
  const jobType = job.jobType === 'followup' ? 'followup' : 'review';

  const ensureStart = Date.now();
  const ensureResult = await deps.worktreeGateway.ensure({
    identity: {
      platform: job.platform,
      projectPath: job.projectPath,
      mrNumber: job.mrNumber,
    },
    sourceBranch: job.sourceBranch,
    source: deriveMrSourceFromJob(job),
    sourceCheckoutPath: job.localPath,
  });
  const ensureDurationMs = Date.now() - ensureStart;
  logger.info(
    { jobId: job.id, ensureDurationMs, status: ensureResult.status },
    'ensureWorktree completed',
  );

  if (ensureResult.status === 'failed') {
    cleanupMcpContext(job.id);
    logError('Préparation worktree échouée', { jobId: job.id, reason: ensureResult.reason });
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: `ensureWorktree failed: ${ensureResult.reason}`,
      durationMs: Date.now() - startTime,
      selectedModel: model,
    };
  }

  if (ensureResult.settingsWarning !== null) {
    logger.warn(
      { jobId: job.id, warning: ensureResult.settingsWarning },
      'Worktree created but settings write produced a warning (FR-4 bgIsolation may not be applied)',
    );
  }

  const worktreePath = ensureResult.path;
  const claudeCwd = await resolveClaudeCwd({
    localPath: job.localPath,
    worktreePath,
    executor: deps.gitExecutor,
  });
  if (claudeCwd !== worktreePath) {
    logger.info(
      { jobId: job.id, worktreePath, claudeCwd },
      'Claude cwd points to a sub-path of the worktree (monorepo source checkout)',
    );
  }
  // attempt counter is reserved for the queue layer to re-enqueue with backoff
  // when status === 'retry' is returned. Until that wiring exists, every
  // invocation is treated as attempt 0 and a single retry signal surfaces back
  // to the controller as a soft failure.
  const attempt = 0;

  const flags = {
    model,
    mcpConfigJson,
    systemPrompt: mcpSystemPrompt,
    allowedTools: 'Read,Glob,Grep,Bash,Edit,Task,Skill,Write,LSP,mcp__review-progress__*',
    disallowedTools: 'EnterPlanMode,AskUserQuestion',
    permissionMode: 'auto' as const,
  };

  let result: Awaited<ReturnType<typeof runClaudeReviewJob>>;
  try {
    result = await runClaudeReviewJob(
      {
        jobId: job.id,
        jobType,
        prompt,
        flags,
        localPath: claudeCwd,
        reportFallbackLocalPath: worktreePath,
        mergeRequestId,
        mergeRequestNumber: job.mrNumber,
        attempt,
        signal,
      },
      {
        sessionGateway: invocation.sessionGateway,
        completionBridge: invocation.completionBridge,
        reportGateway: invocation.reportGateway,
        billingState: invocation.billingState,
        environment: invocation.environment,
        now: () => new Date(),
        timeoutMs: invocation.timeoutMs,
        pollIntervalMs: invocation.pollIntervalMs,
      },
    );
  } catch (error) {
    cleanupMcpContext(job.id);
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, jobId: job.id }, 'runClaudeReviewJob threw');
    logError('Review en erreur', { jobId: job.id, message });
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: message,
      durationMs: Date.now() - startTime,
      selectedModel: model,
    };
  }

  cleanupMcpContext(job.id);
  const durationMs = Date.now() - startTime;
  const durationMin = Math.round(durationMs / 60000);

  if (result.status === 'completed') {
    logInfo('Review terminée', {
      jobId: job.id,
      mrNumber: job.mrNumber,
      duration: `${durationMin} min`,
      outputLength: result.content.length,
      model,
    });

    // Save review statistics (followups are not counted as reviews)
    if (job.jobType !== 'followup') {
      try {
        const mrId = `${job.platform}-${job.projectPath}-${job.mrNumber}`;
        const mrDetails = deps.trackingGateway.getById(job.localPath, mrId);
        const assignedBy = mrDetails?.assignment?.username;
        const reviewStats = new AddReviewStatsUseCase(deps.statsGateway).execute({
          projectPath: job.localPath,
          mrNumber: job.mrNumber,
          duration: durationMs,
          parsed: parseReviewOutput(result.content),
          assignedBy,
          diffStats,
        });
        logger.info({ reviewStats }, 'Stats de review enregistrées');
      } catch (statsError) {
        logger.warn({ error: statsError }, "Erreur lors de l'enregistrement des stats");
      }
    }

    if (result.usage !== null) {
      try {
        const tokenUsageRecord: TokenUsageRecord = {
          jobId: job.id,
          mrNumber: job.mrNumber,
          platform: job.platform,
          projectPath: job.projectPath,
          model: result.usage.model,
          recordedAt: new Date().toISOString(),
          localPath: job.localPath,
          usage: result.usage.usage,
        };
        await deps.trackTokenUsage.execute(tokenUsageRecord);
        await broadcastBudgetAfterUsage(
          {
            getBudgetStatus: deps.getBudgetStatus,
            broadcastBudgetStatus: deps.broadcastBudgetStatus,
            presenter: deps.budgetStatusPresenter,
          },
          { localPaths: deps.getEnabledLocalPaths?.() ?? [job.localPath] },
          logger,
        );
      } catch (tokenUsageError) {
        logger.warn(
          { error: tokenUsageError, jobId: job.id },
          'Failed to record token usage for --bg review',
        );
      }
    } else {
      logger.warn(
        { jobId: job.id, sessionContext: claudeCwd },
        'Token usage unavailable for --bg review (missing or unparseable JSONL transcript)',
      );
    }

    if (onProgress) {
      onProgress({
        currentPhase: 'completed',
        overallProgress: 100,
        lastUpdate: new Date(),
        agents: [],
      });
    }

    return {
      success: true,
      exitCode: 0,
      stdout: result.content,
      stderr: '',
      durationMs,
      usage: result.usage?.usage ?? null,
      selectedModel: model,
    };
  }

  if (result.status === 'retry') {
    logWarn('Rate-limited — backoff demandé', {
      jobId: job.id,
      delayMs: result.delayMs,
      nextAttempt: result.attempt,
    });
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: `rate-limited; retry in ${result.delayMs}ms (attempt ${result.attempt})`,
      durationMs,
      selectedModel: model,
    };
  }

  logError('Review échouée', {
    jobId: job.id,
    mrNumber: job.mrNumber,
    duration: `${durationMin} min`,
    reason: result.reason,
  });
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: result.reason,
    durationMs,
    selectedModel: model,
  };
}

/**
 * Send desktop notification
 */
export function sendNotification(title: string, message: string, logger: Logger): void {
  try {
    // Use notify-send on Linux
    const child = spawn('notify-send', [
      '--app-name=Claude Review',
      '--urgency=normal',
      '--icon=dialog-information',
      title,
      message,
    ]);

    child.on('error', (error) => {
      logger.warn({ error }, 'Notification desktop non disponible');
    });
  } catch {
    logger.warn('notify-send non disponible');
  }
}
