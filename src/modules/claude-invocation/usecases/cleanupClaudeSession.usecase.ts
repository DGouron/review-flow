import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export interface CleanupClaudeSessionInput {
  sessionId: SessionId;
}

export interface CleanupClaudeSessionDependencies {
  sessionGateway: ClaudeSessionGateway;
}

export interface CleanupClaudeSessionResult {
  stopped: boolean;
  removed: boolean;
  warnings: string[];
}

export async function cleanupClaudeSession(
  input: CleanupClaudeSessionInput,
  deps: CleanupClaudeSessionDependencies,
): Promise<CleanupClaudeSessionResult> {
  const warnings: string[] = [];

  const stopResult = await deps.sessionGateway.stop(input.sessionId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`stop failed: ${message}`);
    return { success: false, warning: message };
  });
  if (!stopResult.success && stopResult.warning) {
    warnings.push(`stop: ${stopResult.warning}`);
  }

  const removeResult = await deps.sessionGateway.remove(input.sessionId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`remove failed: ${message}`);
    return { success: false, warning: message };
  });
  if (!removeResult.success && removeResult.warning) {
    warnings.push(`remove: ${removeResult.warning}`);
  }

  return {
    stopped: stopResult.success,
    removed: removeResult.success,
    warnings,
  };
}
