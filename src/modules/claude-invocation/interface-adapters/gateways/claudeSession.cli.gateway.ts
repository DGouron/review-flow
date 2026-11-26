import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import type {
  AgentStatusEntry,
  AgentStatusValue,
  ClaudeDispatchFlags,
  ClaudeSessionGateway,
  CleanupResult,
  DaemonStatus,
  DispatchInput,
  DispatchResult,
  UsageReport,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import {
  parseSessionId,
  type SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import { computeCostUsd } from '@/modules/token-accounting/entities/modelPricing/modelPricing.js';

export interface ClaudeProcessRunArgs {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
}

export interface ClaudeProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ClaudeProcessRunner = (
  request: ClaudeProcessRunArgs,
) => Promise<ClaudeProcessRunResult>;

export const RATE_LIMIT_DETECTION_REGEX = /\b(rate[\s-]?limit|429|throttl)/i;
// Claude CLI (>= 2.1.x) outputs the new background session in the form:
//   "backgrounded · <hexSessionId>"
// followed by a multi-line "claude agents" hint block. The middle dot is
// U+00B7 (·). Some CLI versions wrap the id in ANSI colour codes even with
// piped, non-TTY stdout, so escape sequences are stripped before matching.
const SESSION_ID_REGEX = /^backgrounded\s*[·]\s*([0-9a-f]+)/m;
const ANSI_ESCAPE_SEQUENCE = String.fromCharCode(27);
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_SEQUENCE}\\[[0-9;]*m`, 'g');

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, '');
}

const agentEntrySchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
});
const agentArraySchema = z.array(agentEntrySchema);

const assistantUsageLineSchema = z.object({
  type: z.literal('assistant'),
  message: z.object({
    id: z.string().optional(),
    model: z.string(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    }),
  }),
});

function classifyAgentStatus(raw: string | undefined): AgentStatusValue {
  if (raw === 'running' || raw === 'completed' || raw === 'failed' || raw === 'stopped') {
    return raw;
  }
  return 'unknown';
}

function backgroundSessionArgs(flags: ClaudeDispatchFlags, systemPromptPath: string): string[] {
  return [
    '--bg',
    '--model',
    flags.model,
    '--permission-mode',
    flags.permissionMode,
    '--append-system-prompt-file',
    systemPromptPath,
    '--mcp-config',
    flags.mcpConfigJson,
    '--strict-mcp-config',
    '--allowedTools',
    flags.allowedTools,
    '--disallowedTools',
    flags.disallowedTools,
    '--',
  ];
}

function classifyDispatchOutput(result: ClaudeProcessRunResult): DispatchResult {
  if (
    RATE_LIMIT_DETECTION_REGEX.test(result.stderr) ||
    RATE_LIMIT_DETECTION_REGEX.test(result.stdout)
  ) {
    return { status: 'rate-limited', rawStderr: result.stderr || result.stdout };
  }

  if (result.exitCode !== 0) {
    return { status: 'failed', rawStderr: result.stderr };
  }

  const match = stripAnsi(result.stdout).match(SESSION_ID_REGEX);
  if (!match) {
    return {
      status: 'failed',
      rawStderr: `unable to parse session id from stdout: ${result.stdout}`,
    };
  }
  return { status: 'dispatched', sessionId: parseSessionId(match[1]) };
}

export interface ClaudeSessionCliGatewayOptions {
  homeDir?: string;
}

export class ClaudeSessionCliGateway implements ClaudeSessionGateway {
  private readonly homeDir: string;

  constructor(
    private readonly runner: ClaudeProcessRunner,
    options: ClaudeSessionCliGatewayOptions = {},
  ) {
    this.homeDir = options.homeDir ?? homedir();
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const systemPromptPath = join(tmpdir(), `reviewflow-system-prompt-${randomUUID()}.txt`);
    try {
      // Prompts stay out of argv: one argv string is capped at 128 KiB on Linux (spawn E2BIG).
      writeFileSync(systemPromptPath, input.flags.systemPrompt, { encoding: 'utf-8', mode: 0o600 });
      const result = await this.runner({
        args: backgroundSessionArgs(input.flags, systemPromptPath),
        cwd: input.localPath,
        stdin: input.prompt,
      });
      return classifyDispatchOutput(result);
    } catch (error) {
      return {
        status: 'failed',
        rawStderr: error instanceof Error ? error.message : String(error),
      };
    } finally {
      rmSync(systemPromptPath, { force: true });
    }
  }

  async stop(sessionId: SessionId): Promise<CleanupResult> {
    const result = await this.runWithoutRejecting(['stop', sessionId]);
    if (result.exitCode === 0) {
      return { success: true, warning: null };
    }
    return { success: false, warning: result.stderr || `claude stop exited ${result.exitCode}` };
  }

  async remove(sessionId: SessionId): Promise<CleanupResult> {
    const result = await this.runWithoutRejecting(['rm', sessionId]);
    if (result.exitCode === 0) {
      return { success: true, warning: null };
    }
    return { success: false, warning: result.stderr || `claude rm exited ${result.exitCode}` };
  }

  async listAgents(): Promise<AgentStatusEntry[]> {
    const result = await this.runWithoutRejecting(['agents', '--json']);
    if (result.exitCode !== 0) return [];
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      const safe = agentArraySchema.safeParse(parsed);
      if (!safe.success) return [];
      return safe.data.map((entry) => ({
        sessionId: parseSessionId(entry.id),
        status: classifyAgentStatus(entry.status),
      }));
    } catch {
      return [];
    }
  }

  async daemonStatus(): Promise<DaemonStatus> {
    const result = await this.runWithoutRejecting(['daemon', 'status']);
    if (result.exitCode === 0) {
      return { reachable: true, reason: null };
    }
    return { reachable: false, reason: result.stderr || `daemon status exited ${result.exitCode}` };
  }

  async usage(): Promise<UsageReport> {
    const result = await this.runWithoutRejecting(['usage']);
    const raw = result.stdout || result.stderr;
    if (result.exitCode !== 0) {
      return { usesApiPool: false, raw };
    }
    const usesApiPool = /\bAPI\b/i.test(raw) && /(token|cost|charge|pool)/i.test(raw);
    return { usesApiPool, raw };
  }

  private async runWithoutRejecting(args: string[]): Promise<ClaudeProcessRunResult> {
    try {
      return await this.runner({ args });
    } catch (error) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
      };
    }
  }

  async getSessionUsage(sessionId: SessionId, cwd: string): Promise<SessionUsageSnapshot | null> {
    const transcript = this.transcriptOf(sessionId, cwd);
    const transcriptPath = transcript.path;
    if (!existsSync(transcriptPath)) {
      return null;
    }

    let raw: string;
    try {
      raw = readFileSync(transcriptPath, 'utf-8');
    } catch {
      return null;
    }

    const entries = onePerMessage(
      raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => safeParseAssistantUsage(line))
        .filter((entry): entry is z.infer<typeof assistantUsageLineSchema> => entry !== null),
    );

    if (entries.length === 0) {
      return null;
    }

    const totals = entries.reduce(
      (accumulator, entry) => {
        const usage = entry.message.usage;
        accumulator.inputTokens += usage.input_tokens;
        accumulator.outputTokens += usage.output_tokens;
        accumulator.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
        accumulator.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
        return accumulator;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    );

    const lastEntry = entries[entries.length - 1];
    const model = lastEntry.message.model;
    const usageWithoutCost = { ...totals, costUsd: 0 };
    const costUsd = computeCostUsd(model, usageWithoutCost);

    return {
      sessionId: transcript.sessionId,
      model,
      turns: entries.length,
      usage: { ...totals, costUsd },
    };
  }

  /**
   * `claude --bg` prints a short id; the transcript is named by the full session id, which the job's
   * state records with the session's own cwd. The state is gone once the session is removed.
   */
  private transcriptOf(sessionId: SessionId, cwd: string): { sessionId: string; path: string } {
    const jobState = readBackgroundJobState(
      join(this.homeDir, '.claude', 'jobs', sessionId, 'state.json'),
    );
    const transcriptName = jobState?.sessionId ?? sessionId;
    const sessionCwd = jobState?.cwd ?? cwd;
    return {
      sessionId: transcriptName,
      path: join(
        this.homeDir,
        '.claude',
        'projects',
        projectFolderOf(sessionCwd),
        `${transcriptName}.jsonl`,
      ),
    };
  }
}

const backgroundJobStateSchema = z.object({ sessionId: z.string().min(1), cwd: z.string().min(1) });

function readBackgroundJobState(path: string): z.infer<typeof backgroundJobStateSchema> | null {
  try {
    const result = backgroundJobStateSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function projectFolderOf(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function onePerMessage(
  entries: Array<z.infer<typeof assistantUsageLineSchema>>,
): Array<z.infer<typeof assistantUsageLineSchema>> {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const messageId = entry.message.id;
    if (messageId === undefined) return true;
    if (seen.has(messageId)) return false;
    seen.add(messageId);
    return true;
  });
}

function safeParseAssistantUsage(line: string): z.infer<typeof assistantUsageLineSchema> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const result = assistantUsageLineSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
