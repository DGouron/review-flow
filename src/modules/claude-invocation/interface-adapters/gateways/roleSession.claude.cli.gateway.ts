import { z } from 'zod';

import type { DispatchResult } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type {
  BackgroundSession,
  BackgroundSessionListing,
  RoleSessionGateway,
  RoleSessionLaunch,
} from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import {
  classifyDispatchOutput,
  type ClaudeProcessRunner,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';

/** No Bash: even `git log` writes files through `--output=<file>`. SendMessage reports to the clerk. */
const ROLE_TOOLS = 'Read,Glob,Grep,SendMessage';
const NO_MCP_SERVER = '{"mcpServers":{}}';
const TRUSTED_SETTING_SOURCES = 'user';
const SESSION_IN_PLACE_SETTINGS = '{"worktree":{"bgIsolation":"none"}}';

const backgroundSessionEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  startedAt: z.number().optional(),
  state: z.string().min(1).optional(),
});

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roleSessionArgs(launch: RoleSessionLaunch): string[] {
  return [
    '--bg',
    '--name',
    launch.name,
    '--model',
    launch.model,
    '--permission-mode',
    'dontAsk',
    '--tools',
    ROLE_TOOLS,
    '--allowedTools',
    ROLE_TOOLS,
    '--setting-sources',
    TRUSTED_SETTING_SOURCES,
    '--settings',
    SESSION_IN_PLACE_SETTINGS,
    '--mcp-config',
    NO_MCP_SERVER,
    '--strict-mcp-config',
    '--',
  ];
}

function toBackgroundSession(
  entry: z.infer<typeof backgroundSessionEntrySchema>,
): BackgroundSession {
  return {
    sessionId: parseSessionId(entry.id),
    name: entry.name ?? null,
    cwd: entry.cwd ?? null,
    startedAt: entry.startedAt === undefined ? null : new Date(entry.startedAt),
    state: entry.state ?? null,
  };
}

function readableSessionsOf(candidates: unknown[]): BackgroundSession[] {
  return candidates.flatMap((candidate) => {
    const entry = backgroundSessionEntrySchema.safeParse(candidate);
    return entry.success ? [toBackgroundSession(entry.data)] : [];
  });
}

function parseListing(stdout: string): BackgroundSessionListing {
  try {
    const candidates = z.array(z.unknown()).parse(JSON.parse(stdout));
    return { status: 'listed', sessions: readableSessionsOf(candidates) };
  } catch (error) {
    return {
      status: 'failed',
      reason: `unreadable claude agents output: ${errorMessageOf(error)}`,
    };
  }
}

export class RoleSessionClaudeCliGateway implements RoleSessionGateway {
  constructor(private readonly runner: ClaudeProcessRunner) {}

  async launch(launch: RoleSessionLaunch): Promise<DispatchResult> {
    try {
      const result = await this.runner({
        args: roleSessionArgs(launch),
        cwd: launch.cwd,
        stdin: launch.brief,
      });
      return classifyDispatchOutput(result);
    } catch (error) {
      return { status: 'failed', rawStderr: errorMessageOf(error) };
    }
  }

  async listBackgroundSessions(): Promise<BackgroundSessionListing> {
    try {
      const result = await this.runner({ args: ['agents', '--json', '--all'] });
      if (result.exitCode !== 0) {
        return {
          status: 'failed',
          reason: result.stderr || `claude agents exited ${result.exitCode}`,
        };
      }
      return parseListing(result.stdout);
    } catch (error) {
      return { status: 'failed', reason: errorMessageOf(error) };
    }
  }
}
