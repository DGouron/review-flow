import type {
	AgentCompletionStatus,
	ReviewProgressGateway,
} from "../../entities/progress/progress.gateway.js";
import type { AgentStatus } from "../../entities/progress/progress.type.js";

export type CompleteAgentResult =
	| {
			success: true;
			agentName: string;
			status: AgentStatus;
			completedAt: Date;
			overallProgress: number;
			error?: string;
	  }
	| { success: false; error: string };

export interface CompleteAgentDependencies {
	progressGateway: ReviewProgressGateway;
}

export function completeAgent(
	jobId: string,
	agentName: string,
	status: AgentCompletionStatus,
	error: string | undefined,
	deps: CompleteAgentDependencies,
): CompleteAgentResult {
	const { progressGateway } = deps;

	const progress = progressGateway.completeAgent(jobId, agentName, status, error);

	if (!progress) {
		return {
			success: false,
			error: `Agent not found: ${agentName}`,
		};
	}

	const agent = progress.agents.find((a) => a.name === agentName);

	return {
		success: true,
		agentName,
		status: agent?.status ?? "completed",
		completedAt: agent?.completedAt ?? new Date(),
		overallProgress: progress.overallProgress,
		error: agent?.error,
	};
}
