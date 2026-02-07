import type { ReviewProgressGateway } from "../../entities/progress/progress.gateway.js";

export type StartAgentResult =
	| { success: true; agentName: string; startedAt: Date; overallProgress: number }
	| { success: false; error: string };

export interface StartAgentDependencies {
	progressGateway: ReviewProgressGateway;
}

export function startAgent(
	jobId: string,
	agentName: string,
	deps: StartAgentDependencies,
): StartAgentResult {
	const { progressGateway } = deps;

	const progress = progressGateway.startAgent(jobId, agentName);

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
		startedAt: agent?.startedAt ?? new Date(),
		overallProgress: progress.overallProgress,
	};
}
