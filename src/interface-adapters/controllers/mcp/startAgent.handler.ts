import type { McpToolResult } from "../../../mcp/types.js";
import {
	startAgent,
	type StartAgentDependencies,
} from "../../../usecases/mcp/startAgent.usecase.js";

export function createStartAgentHandler(
	deps: StartAgentDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;
		const agentName = args.agentName;

		if (typeof jobId !== "string" || !jobId) {
			return {
				content: [{ type: "text", text: "Error: jobId is required" }],
				isError: true,
			};
		}

		if (typeof agentName !== "string" || !agentName) {
			return {
				content: [{ type: "text", text: "Error: agentName is required" }],
				isError: true,
			};
		}

		const result = startAgent(jobId, agentName, deps);

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
							agentName: result.agentName,
							startedAt: result.startedAt.toISOString(),
							overallProgress: result.overallProgress,
						},
						null,
						2,
					),
				},
			],
		};
	};
}
