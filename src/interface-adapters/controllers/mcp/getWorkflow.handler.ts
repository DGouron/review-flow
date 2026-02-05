import type { McpToolResult } from "../../../mcp/types.js";
import {
	getWorkflow,
	type GetWorkflowDependencies,
} from "../../../usecases/mcp/getWorkflow.usecase.js";

export function createGetWorkflowHandler(
	deps: GetWorkflowDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;

		if (typeof jobId !== "string" || !jobId) {
			return {
				content: [{ type: "text", text: "Error: jobId is required" }],
				isError: true,
			};
		}

		const result = getWorkflow(jobId, deps);

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
					text: JSON.stringify(result.workflow, null, 2),
				},
			],
		};
	};
}
