import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import { isExpired } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.js';
import type { ClaudeSession } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { McpCompletionBridge } from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import type {
  SessionCompletion,
  SessionCompletionOutcome,
} from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

export interface AwaitSessionCompletionInput {
  session: ClaudeSession;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface AwaitSessionCompletionDependencies {
  sessionGateway: ClaudeSessionGateway;
  completionBridge: McpCompletionBridge;
  now: () => Date;
}

const TERMINAL_AGENT_STATUSES = new Set(['completed', 'failed', 'stopped']);

function agentStatusToOutcome(status: string): SessionCompletionOutcome {
  if (status === 'completed') return 'completed';
  if (status === 'stopped') return 'stopped';
  return 'failed';
}

export function awaitSessionCompletion(
  input: AwaitSessionCompletionInput,
  deps: AwaitSessionCompletionDependencies,
): Promise<SessionCompletion> {
  const { session, timeoutMs, pollIntervalMs } = input;
  const { sessionGateway, completionBridge, now } = deps;

  return new Promise<SessionCompletion>((resolve) => {
    let settled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    const cleanup = (): void => {
      completionBridge.unsubscribe(session.jobId);
      if (pollTimer !== null) clearTimeout(pollTimer);
    };

    const settle = (completion: SessionCompletion): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(completion);
    };

    completionBridge.subscribe(session.jobId, (completion) => {
      settle({ ...completion, source: completion.source });
    });

    const tick = async (): Promise<void> => {
      if (settled) return;
      if (isExpired(session, now(), timeoutMs)) {
        settle({ source: 'timeout', outcome: 'failed', reason: 'timeout' });
        return;
      }
      try {
        const agents = await sessionGateway.listAgents();
        const entry = agents.find((item) => item.sessionId === session.sessionId);
        if (entry && TERMINAL_AGENT_STATUSES.has(entry.status)) {
          settle({
            source: 'polling',
            outcome: agentStatusToOutcome(entry.status),
            reason: null,
          });
          return;
        }
      } catch {
        // polling errors are non-fatal; retry on next tick
      }
      if (!settled) {
        pollTimer = setTimeout(() => {
          void tick();
        }, pollIntervalMs);
      }
    };

    pollTimer = setTimeout(() => {
      void tick();
    }, pollIntervalMs);
  });
}
