import type { AgentCompletionStatus } from "../../../entities/progress/progress.gateway.js";
import type { McpToolResult } from "../../../mcp/types.js";
import {
	completeAgent,
	type CompleteAgentDependencies,
} from "../../../usecases/mcp/completeAgent.usecase.js";

function isValidStatus(status: unknown): status is AgentCompletionStatus {
	return status === "success" || status === "failed";
}

export function createCompleteAgentHandler(
	deps: CompleteAgentDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;
		const agentName = args.agentName;
		const status = args.status;
		const error = args.error;

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

		if (!status) {
			return {
				content: [{ type: "text", text: "Error: status is required" }],
				isError: true,
			};
		}

		if (!isValidStatus(status)) {
			return {
				content: [
					{ type: "text", text: "Error: status must be 'success' or 'failed'" },
				],
				isError: true,
			};
		}

		const errorMessage =
			typeof error === "string" && error ? error : undefined;

		const result = completeAgent(jobId, agentName, status, errorMessage, deps);

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
							status: result.status,
							completedAt: result.completedAt.toISOString(),
							overallProgress: result.overallProgress,
							...(result.error && { error: result.error }),
						},
						null,
						2,
					),
				},
			],
		};
	};
}
