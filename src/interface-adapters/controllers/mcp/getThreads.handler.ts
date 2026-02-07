import type { McpToolResult } from "../../../mcp/types.js";
import {
	getThreads,
	type GetThreadsDependencies,
} from "../../../usecases/mcp/getThreads.usecase.js";

export function createGetThreadsHandler(
	deps: GetThreadsDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;

		if (typeof jobId !== "string" || !jobId) {
			return {
				content: [{ type: "text", text: "Error: jobId is required" }],
				isError: true,
			};
		}

		const result = getThreads(jobId, deps);

		if (!result.success) {
			return {
				content: [{ type: "text", text: `Error: ${result.error}` }],
				isError: true,
			};
		}

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							success: true,
							threads: result.threads,
							count: result.threads.length,
						},
						null,
						2,
					),
				},
			],
		};
	};
}
