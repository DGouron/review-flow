import type { McpToolResult } from '@/mcp/types.js';
import {
  recordVerdict,
  verdictRecordInputSchema,
} from '@/modules/review-execution/entities/verdict/verdictRecord.js';

/** Counts the arbiter's rulings into a verdict. Stateless: the session prints the marker. */
export function createRecordVerdictHandler(): (args: Record<string, unknown>) => McpToolResult {
  return (args: Record<string, unknown>): McpToolResult => {
    const parsed = verdictRecordInputSchema.safeParse(args);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return {
        content: [{ type: 'text', text: `Error: invalid findings (${problems})` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(recordVerdict(parsed.data)) }],
    };
  };
}
