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

const READ_ONLY_BUILT_IN_TOOLS = 'Read,Glob,Grep,Bash';
const READ_ONLY_ALLOWED_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git blame:*)',
  'Bash(git status:*)',
  'Bash(ls:*)',
].join(',');
const NO_MCP_SERVER = '{"mcpServers":{}}';

const backgroundSessionEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  startedAt: z.number().optional(),
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
    READ_ONLY_BUILT_IN_TOOLS,
    '--allowedTools',
    READ_ONLY_ALLOWED_TOOLS,
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
  };
}

function parseListing(stdout: string): BackgroundSessionListing {
  try {
    const entries = z.array(backgroundSessionEntrySchema).parse(JSON.parse(stdout));
    return { status: 'listed', sessions: entries.map(toBackgroundSession) };
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
