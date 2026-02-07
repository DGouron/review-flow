import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Logger } from 'pino';
import type { ReviewJob } from '../../queue/reviewQueue.js';
import type { ReviewProgress, ProgressEvent } from '../../entities/progress/progress.type.js';
import { ProgressParser } from './progressParser.js';
import { logInfo, logWarn, logError } from '../../services/logService.js';
import { getModel } from '../../services/runtimeSettings.js';
import { getProjectAgents, getFollowupAgents } from '../../config/projectConfig.js';
import { addReviewStats } from '../../services/statsService.js';
import { getMrDetails } from '../../services/mrTrackingService.js';
import { resolveClaudePath } from '../../shared/services/claudePathResolver.js';
import { getJobContextFilePath } from '../../shared/services/mcpJobContext.js';

const MCP_SERVER_PATH = '/home/damien/Documents/Projets/claude-review-automation/dist/mcpServer.js';

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
      timestamp: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(context, null, 2));
  } catch {
    // Non-critical, MCP will work without context
  }
}

function ensureProjectMcpConfig(projectPath: string): void {
  try {
    const mcpConfigPath = join(projectPath, '.mcp.json');
    const expectedConfig = {
      mcpServers: {
        "review-progress": {
          command: "node",
          args: [MCP_SERVER_PATH],
        },
      },
    };

    // Check if file exists and has correct config
    if (existsSync(mcpConfigPath)) {
      const existing = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
      if (existing?.mcpServers?.["review-progress"]) {
        return; // Already configured
      }
      // Merge with existing config
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers["review-progress"] = expectedConfig.mcpServers["review-progress"];
      writeFileSync(mcpConfigPath, JSON.stringify(existing, null, 2) + '\n');
    } else {
      // Create new config
      writeFileSync(mcpConfigPath, JSON.stringify(expectedConfig, null, 2) + '\n');
    }
  } catch {
    // Non-critical, skill may still work without MCP
  }
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
const MEMORY_LIMIT_GB = 4; // Kill process if RSS exceeds 4GB
const MEMORY_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
const MEMORY_LIMIT_BYTES = MEMORY_LIMIT_GB * 1024 * 1024 * 1024;

export interface InvocationResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  finalProgress?: ReviewProgress;
  cancelled?: boolean;
}

export type ProgressCallback = (progress: ReviewProgress, event?: ProgressEvent) => void;

/**
 * Build MCP system prompt for progress tracking
 * This instruction is AUTHORITATIVE and forces Claude to use MCP tools
 */
function buildMcpSystemPrompt(job: ReviewJob): string {
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
- **MR Number**: ${job.mrNumber}

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
\`\`\`

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
  signal?: AbortSignal
): Promise<InvocationResult> {
  const startTime = Date.now();

  // Build the prompt
  const prompt = `/${job.skill} ${job.mrNumber}`;

  // Get configured model
  const model = getModel();

  // Build MCP system prompt injection
  const mcpSystemPrompt = buildMcpSystemPrompt(job);

  // Build arguments
  // MCP server reads context from per-job files in ~/.claude-review/jobs/
  // Note: --allowedTools grants permissions explicitly (safer than --dangerously-skip-permissions)
  const args = [
    '--print',
    '--model', model,
    '--append-system-prompt', mcpSystemPrompt,
    // Grant permissions for review operations (automated, no user to approve)
    // - Core tools: Read, Glob, Grep, Bash, Edit, Task, Skill, Write, LSP
    // - MCP tools: mcp__review-progress__* (all tools from our progress tracking server)
    '--allowedTools', 'Read,Glob,Grep,Bash,Edit,Task,Skill,Write,LSP,mcp__review-progress__*',
    // Disable interactive tools - reviews cannot wait for user approval
    '--disallowedTools', 'EnterPlanMode,AskUserQuestion',
    '-p', prompt,
  ];

  // Setup MCP: write context file and ensure project has .mcp.json
  writeMcpContext(job);
  ensureProjectMcpConfig(job.localPath);

  logger.info(
    {
      cwd: job.localPath,
      prompt,
      args,
    },
    'Invocation Claude CLI'
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

  // Initialize progress parser with project agents (or defaults)
  const progressParser = new ProgressParser(job.id, (event, progress) => {
    logger.debug({ event, progress: progress.overallProgress }, 'Progress update');
    onProgress?.(progress, event);
  }, projectAgents);

  // Emit initial progress
  onProgress?.(progressParser.getProgress());

  // Check if already cancelled
  if (signal?.aborted) {
    logWarn('Review annulée avant démarrage', { jobId: job.id });
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: 'Review cancelled before start',
      durationMs: Date.now() - startTime,
      finalProgress: progressParser.getProgress(),
      cancelled: true,
    };
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let cancelled = false;

    const child = spawn(resolveClaudePath(), args, {
      cwd: job.localPath,
      env: {
        ...process.env,
        // Ensure non-interactive mode
        TERM: 'dumb',
        CI: 'true',
        // Note: MCP env vars are now passed via --mcp-config
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Memory guard: monitor RSS and kill if exceeds limit
    let memoryExceeded = false;
    const memoryCheckInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);

      if (memUsage.rss > MEMORY_LIMIT_BYTES) {
        memoryExceeded = true;
        const errorMessage = `
╔═══════════════════════════════════════════════════════════════════╗
║  🚨 MEMORY LIMIT EXCEEDED - REVIEW KILLED                        ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Current RSS: ${rssMB} MB (limit: ${MEMORY_LIMIT_GB * 1024} MB)            ║
║  Job: ${job.id.substring(0, 50).padEnd(50)}    ║
║                                                                   ║
║  The review process consumed too much memory.                     ║
║  This usually happens when running too many sub-agents            ║
║  in parallel. Consider using sequential execution.                ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;
        logger.error({ rssMB, limitMB: MEMORY_LIMIT_GB * 1024, jobId: job.id }, 'Memory limit exceeded, killing process');
        logError('Memory limit exceeded', {
          jobId: job.id,
          rssMB,
          limitMB: MEMORY_LIMIT_GB * 1024,
          message: 'Review killed due to excessive memory consumption',
        });

        // Output error to stderr for visibility
        stderr += errorMessage;

        // Kill the child process
        child.kill('SIGKILL');
        clearInterval(memoryCheckInterval);
      } else if (rssMB > (MEMORY_LIMIT_GB * 1024 * 0.8)) {
        // Warn when approaching limit (80%)
        logger.warn({ rssMB, limitMB: MEMORY_LIMIT_GB * 1024 }, 'Memory usage high, approaching limit');
      }
    }, MEMORY_CHECK_INTERVAL_MS);

    // Handle cancellation via AbortSignal
    const abortHandler = () => {
      if (!cancelled) {
        cancelled = true;
        logger.info({ jobId: job.id }, 'Review annulée par utilisateur');
        logWarn('Review annulée', { jobId: job.id });
        child.kill('SIGTERM');
        // Give it time to cleanup, then force kill
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // Parse progress markers from chunk
      progressParser.parseChunk(chunk);

      // Log progress in real-time (truncated)
      const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk;
      logger.debug({ preview }, 'Claude stdout');
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      logger.warn({ chunk }, 'Claude stderr');
      logWarn('Claude stderr', { jobId: job.id, message: chunk.substring(0, 500) });
    });

    child.on('error', (error) => {
      logger.error({ error }, 'Erreur lors du spawn de Claude');
      logError('Erreur spawn Claude', { jobId: job.id, error: error.message });
      progressParser.markFailed(error.message);
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\nSpawn error: ${error.message}`,
        durationMs: Date.now() - startTime,
        finalProgress: progressParser.getProgress(),
      });
    });

    child.on('close', (code) => {
      // Cleanup interval, abort listener, and MCP context
      clearInterval(memoryCheckInterval);
      cleanupMcpContext(job.id);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }

      const durationMs = Date.now() - startTime;
      const success = code === 0 && !cancelled && !memoryExceeded;

      // Save stdout to log file for debugging
      try {
        const logsDir = join(job.localPath, '.claude', 'reviews', 'logs');
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }
        const sanitizedJobId = job.id.replace(/[:/\\]/g, '-');
        const logPath = join(logsDir, `${sanitizedJobId}-stdout.log`);
        writeFileSync(logPath, `=== Claude Review Output ===\nJob: ${job.id}\nMR: ${job.mrNumber}\nSkill: ${job.skill}\nExit code: ${code}\nDuration: ${Math.round(durationMs / 1000)}s\nTimestamp: ${new Date().toISOString()}\n\n--- STDOUT ---\n${stdout}\n\n--- STDERR ---\n${stderr}\n`);
        logger.info({ logPath }, 'Review stdout saved to log file');
      } catch {
        // Non-critical
      }

      // Finalize progress
      if (memoryExceeded) {
        progressParser.markFailed('Memory limit exceeded - review killed');
      } else if (cancelled) {
        progressParser.markFailed('Annulée par utilisateur');
      } else if (success) {
        progressParser.markAllCompleted();
      } else {
        progressParser.markFailed(`Exit code: ${code}`);
      }

      const finalProgress = progressParser.getProgress();
      onProgress?.(finalProgress);

      logger.info(
        {
          exitCode: code,
          durationMs,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          finalProgress: finalProgress.overallProgress,
          cancelled,
          memoryExceeded,
        },
        memoryExceeded
          ? 'Claude killed - memory limit exceeded'
          : cancelled
            ? 'Claude annulé'
            : success
              ? 'Claude terminé avec succès'
              : 'Claude terminé avec erreur'
      );

      // Log to dashboard with summary
      const durationMin = Math.round(durationMs / 60000);
      if (memoryExceeded) {
        logError('Review killed - Memory limit exceeded', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          duration: `${durationMin} min`,
          limitGB: MEMORY_LIMIT_GB,
        });
      } else if (cancelled) {
        logWarn('Review annulée', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          duration: `${durationMin} min`,
        });
      } else if (success) {
        logInfo('Review terminée', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          duration: `${durationMin} min`,
          outputLength: stdout.length,
        });

        // Save review statistics
        try {
          // Look up assignor from MR tracking
          const mrId = `${job.platform}-${job.projectPath}-${job.mrNumber}`;
          const mrDetails = getMrDetails(job.localPath, mrId);
          const assignedBy = mrDetails?.assignment?.username;

          const reviewStats = addReviewStats(job.localPath, job.mrNumber, durationMs, stdout, assignedBy);
          logger.info({ reviewStats }, 'Stats de review enregistrées');
        } catch (statsError) {
          logger.warn({ error: statsError }, 'Erreur lors de l\'enregistrement des stats');
        }
        // Log stdout preview for debugging
        if (stdout.length > 0) {
          logInfo('Claude output preview', {
            jobId: job.id,
            preview: stdout.substring(0, 1000),
            fullLength: stdout.length,
          });
        }
      } else {
        logError('Review échouée', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          exitCode: code,
          duration: `${durationMin} min`,
          stderr: stderr.substring(0, 500),
          stdoutPreview: stdout.substring(0, 300),
        });
      }

      resolve({
        success,
        exitCode: memoryExceeded ? null : code,
        stdout,
        stderr,
        durationMs,
        finalProgress,
        cancelled: cancelled || memoryExceeded,
      });
    });
  });
}

/**
 * Send desktop notification
 */
export function sendNotification(
  title: string,
  message: string,
  logger: Logger
): void {
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
