import { isAbsolute, relative, sep } from 'node:path';

import { z } from 'zod';

import type {
  ReviewSession,
  ReviewSessionListingGateway,
} from '@/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.js';

export type AgentListingRunner = () => Promise<{ stdout: string; exitCode: number }>;

const agentEntrySchema = z.object({
  id: z.string().min(1),
  pid: z.number().int().positive(),
  cwd: z.string().min(1),
  startedAt: z.number().optional(),
});

function worktreeOf(worktreeRoot: string, cwd: string): string | null {
  const insideRoot = relative(worktreeRoot, cwd);
  if (insideRoot === '' || insideRoot.startsWith('..') || isAbsolute(insideRoot)) return null;
  return insideRoot.split(sep)[0];
}

function parseAgents(stdout: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Lists review sessions from `claude agents --json`. Sessions are dispatched with `claude --bg`
 * and belong to the Claude daemon, so the CLI listing is the only source of their process id.
 */
export class ReviewSessionListingClaudeCliGateway implements ReviewSessionListingGateway {
  constructor(
    private readonly listAgents: AgentListingRunner,
    private readonly worktreeRoot: string,
  ) {}

  async list(): Promise<ReviewSession[] | null> {
    let result: { stdout: string; exitCode: number };
    try {
      result = await this.listAgents();
    } catch {
      return null;
    }
    if (result.exitCode !== 0) return null;
    const agents = parseAgents(result.stdout);
    if (!agents) return null;
    return agents.flatMap((candidate) => this.toReviewSession(candidate));
  }

  private toReviewSession(candidate: unknown): ReviewSession[] {
    const parsed = agentEntrySchema.safeParse(candidate);
    if (!parsed.success) return [];
    const worktree = worktreeOf(this.worktreeRoot, parsed.data.cwd);
    if (!worktree) return [];
    const { startedAt } = parsed.data;
    return [
      {
        sessionId: parsed.data.id,
        worktree,
        mainPid: parsed.data.pid,
        startedAt: startedAt === undefined ? null : new Date(startedAt).toISOString(),
      },
    ];
  }
}
