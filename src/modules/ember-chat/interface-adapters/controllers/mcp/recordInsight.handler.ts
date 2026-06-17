import type { McpToolResult } from '@/mcp/types.js';
import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import { emberRecurringInsightGuard } from '@/modules/ember-chat/entities/emberMemory/emberMemory.guard.js';

export interface RecordInsightDependencies {
  memory: EmberMemoryGateway;
}

/**
 * MCP entry point letting Ember record a recurring finding it derived while
 * answering. It writes only to Ember's private per-project notebook — never to
 * project state. A blank insight is a no-op success (per spec, "nothing
 * recorded" is not an error to surface). The gateway write is fire-and-forget
 * best-effort: a rejection is swallowed so a failed write never breaks the
 * answer, honouring the "recording is best-effort" rule. Handlers are
 * synchronous (McpToolResult), so the async write cannot be awaited here.
 */
export function createRecordInsightHandler(
  dependencies: RecordInsightDependencies,
): (args: Record<string, unknown>) => McpToolResult {
  return (args: Record<string, unknown>): McpToolResult => {
    const projectPath = args.projectPath;
    if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: projectPath is required' }],
        isError: true,
      };
    }

    const insight = emberRecurringInsightGuard.safeParse(args.insight);
    if (!insight.success) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ recorded: false }) }],
      };
    }

    void recordBestEffort(dependencies.memory, projectPath, insight.data);

    return {
      content: [{ type: 'text', text: JSON.stringify({ recorded: true }) }],
    };
  };
}

async function recordBestEffort(
  memory: EmberMemoryGateway,
  projectPath: string,
  insight: string,
): Promise<void> {
  try {
    await memory.appendInsight(projectPath, insight);
  } catch {
    // Best-effort: a memory write failure must never break the answer.
  }
}
