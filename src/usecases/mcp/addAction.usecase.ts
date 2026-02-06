import type { JobContextGateway } from "../../entities/job/jobContext.gateway.js";
import type { ReviewContextGateway } from "../../entities/reviewContext/reviewContext.gateway.js";
import type { ReviewContextAction } from "../../entities/reviewContext/reviewContextAction.schema.js";

export type ActionInput =
	| { type: "THREAD_RESOLVE"; threadId: string; message?: string }
	| { type: "THREAD_REPLY"; threadId: string; message: string }
	| { type: "POST_COMMENT"; body: string };

export type AddActionResult =
	| { success: true; actionId: string; actionType: string }
	| { success: false; error: string };

export interface AddActionDependencies {
	jobContextGateway: JobContextGateway;
	reviewContextGateway: ReviewContextGateway;
}

function generateActionId(): string {
	return `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function validateAction(action: ActionInput): string | null {
	if (action.type === "THREAD_RESOLVE") {
		if (!action.threadId) {
			return "threadId required for THREAD_RESOLVE";
		}
	} else if (action.type === "THREAD_REPLY") {
		if (!action.threadId) {
			return "threadId required for THREAD_REPLY";
		}
		if (!action.message) {
			return "message required for THREAD_REPLY";
		}
	} else if (action.type === "POST_COMMENT") {
		if (!action.body) {
			return "body required for POST_COMMENT";
		}
	}
	return null;
}

function toReviewContextAction(action: ActionInput): ReviewContextAction {
	if (action.type === "THREAD_RESOLVE") {
		return {
			type: "THREAD_RESOLVE",
			threadId: action.threadId,
			message: action.message,
		};
	}
	if (action.type === "THREAD_REPLY") {
		return {
			type: "THREAD_REPLY",
			threadId: action.threadId,
			message: action.message,
		};
	}
	return {
		type: "POST_COMMENT",
		body: action.body,
	};
}

export function addAction(
	jobId: string,
	action: ActionInput,
	deps: AddActionDependencies,
): AddActionResult {
	const { jobContextGateway, reviewContextGateway } = deps;

	const validationError = validateAction(action);
	if (validationError) {
		return {
			success: false,
			error: validationError,
		};
	}

	const jobContext = jobContextGateway.get(jobId);
	if (!jobContext) {
		return {
			success: false,
			error: `Job context not found: ${jobId}`,
		};
	}

	const reviewContextAction = toReviewContextAction(action);
	const result = reviewContextGateway.appendAction(
		jobContext.localPath,
		jobContext.mergeRequestId,
		reviewContextAction,
	);

	if (!result.success) {
		return {
			success: false,
			error: "Failed to append action to review context",
		};
	}

	return {
		success: true,
		actionId: generateActionId(),
		actionType: action.type,
	};
}
