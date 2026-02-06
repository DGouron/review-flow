import type { McpToolResult } from "../../../mcp/types.js";
import {
	addAction,
	type ActionInput,
	type AddActionDependencies,
} from "../../../usecases/mcp/addAction.usecase.js";

const VALID_ACTION_TYPES = ["THREAD_RESOLVE", "THREAD_REPLY", "POST_COMMENT"] as const;

function isValidActionType(type: unknown): type is ActionInput["type"] {
	return (
		typeof type === "string" &&
		VALID_ACTION_TYPES.includes(type as ActionInput["type"])
	);
}

export function createAddActionHandler(
	deps: AddActionDependencies,
): (args: Record<string, unknown>) => McpToolResult {
	return (args: Record<string, unknown>): McpToolResult => {
		const jobId = args.jobId;
		const type = args.type;
		const threadId = args.threadId;
		const message = args.message;
		const body = args.body;

		if (typeof jobId !== "string" || !jobId) {
			return {
				content: [{ type: "text", text: "Error: jobId is required" }],
				isError: true,
			};
		}

		if (!type) {
			return {
				content: [{ type: "text", text: "Error: type is required" }],
				isError: true,
			};
		}

		if (!isValidActionType(type)) {
			return {
				content: [
					{
						type: "text",
						text: `Error: Invalid action type '${type}'. Valid types: ${VALID_ACTION_TYPES.join(", ")}`,
					},
				],
				isError: true,
			};
		}

		let action: ActionInput;

		if (type === "THREAD_RESOLVE") {
			action = {
				type: "THREAD_RESOLVE",
				threadId: typeof threadId === "string" ? threadId : "",
				message: typeof message === "string" ? message : undefined,
			};
		} else if (type === "THREAD_REPLY") {
			action = {
				type: "THREAD_REPLY",
				threadId: typeof threadId === "string" ? threadId : "",
				message: typeof message === "string" ? message : "",
			};
		} else {
			action = {
				type: "POST_COMMENT",
				body: typeof body === "string" ? body : "",
			};
		}

		const result = addAction(jobId, action, deps);

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
							actionId: result.actionId,
							actionType: result.actionType,
						},
						null,
						2,
					),
				},
			],
		};
	};
}
