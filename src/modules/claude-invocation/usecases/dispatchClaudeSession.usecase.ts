import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type {
  ClaudeDispatchFlags,
  ClaudeSessionGateway,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import { createClaudeSession } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.js';
import type {
  ClaudeSession,
  ClaudeSessionJobType,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export interface DispatchClaudeSessionInput {
  jobId: string;
  jobType: ClaudeSessionJobType;
  prompt: string;
  flags: ClaudeDispatchFlags;
  localPath: string;
  mergeRequestId: string;
}

export interface DispatchClaudeSessionDependencies {
  sessionGateway: ClaudeSessionGateway;
  environment: EnvironmentGateway;
  billingState: BillingStateGateway;
  now: () => Date;
}

export type DispatchClaudeSessionResult =
  | { status: 'dispatched'; session: ClaudeSession }
  | { status: 'rate-limited'; rawStderr: string }
  | { status: 'billing-regression-prevented' }
  | { status: 'paused' }
  | { status: 'failed'; rawStderr: string };

export async function dispatchClaudeSession(
  input: DispatchClaudeSessionInput,
  deps: DispatchClaudeSessionDependencies,
): Promise<DispatchClaudeSessionResult> {
  if (deps.environment.hasAnthropicApiKey()) {
    return { status: 'billing-regression-prevented' };
  }

  if (deps.billingState.read().dispatchPaused) {
    return { status: 'paused' };
  }

  const result = await deps.sessionGateway.dispatch({
    prompt: input.prompt,
    flags: input.flags,
    localPath: input.localPath,
    jobId: input.jobId,
    jobType: input.jobType,
  });

  if (result.status === 'rate-limited') {
    return { status: 'rate-limited', rawStderr: result.rawStderr };
  }

  if (result.status === 'failed') {
    return { status: 'failed', rawStderr: result.rawStderr };
  }

  const session = createClaudeSession({
    sessionId: result.sessionId,
    jobId: input.jobId,
    jobType: input.jobType,
    localPath: input.localPath,
    mergeRequestId: input.mergeRequestId,
    dispatchedAt: deps.now(),
  });

  return { status: 'dispatched', session };
}
