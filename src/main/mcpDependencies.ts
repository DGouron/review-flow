import type { ReviewProgressGateway } from "../entities/progress/progress.gateway.js";
import type { ReviewProgress } from "../entities/progress/progress.type.js";
import type { JobContextGateway } from "../entities/job/jobContext.gateway.js";
import type { ReviewContextGateway } from "../entities/reviewContext/reviewContext.gateway.js";
import { ReviewProgressMemoryGateway } from "../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { JobContextMemoryGateway } from "../interface-adapters/gateways/jobContext.memory.gateway.js";

export type ProgressChangeCallback = (
	jobId: string,
	progress: ReviewProgress,
) => void;

export interface McpDependenciesInput {
	reviewContextGateway: ReviewContextGateway;
	onProgressChange?: ProgressChangeCallback;
}

export interface McpDependencies {
	progressGateway: ReviewProgressGateway;
	jobContextGateway: JobContextGateway;
	reviewContextGateway: ReviewContextGateway;
}

export function createMcpDependencies(input: McpDependenciesInput): McpDependencies {
	const { reviewContextGateway, onProgressChange } = input;

	const progressGateway = new ReviewProgressMemoryGateway();
	const jobContextGateway = new JobContextMemoryGateway();

	progressGateway.setOnProgressChange((jobId, progress) => {
		if (onProgressChange) {
			onProgressChange(jobId, progress);
		}

		syncProgressToReviewContext(
			jobId,
			progress,
			jobContextGateway,
			reviewContextGateway,
		);
	});

	return {
		progressGateway,
		jobContextGateway,
		reviewContextGateway,
	};
}

function syncProgressToReviewContext(
	jobId: string,
	progress: ReviewProgress,
	jobContextGateway: JobContextGateway,
	reviewContextGateway: ReviewContextGateway,
): void {
	const jobContext = jobContextGateway.get(jobId);
	if (!jobContext) {
		return;
	}

	const runningAgent = progress.agents.find((a) => a.status === "running");
	const completedAgents = progress.agents
		.filter((a) => a.status === "completed" || a.status === "failed")
		.map((a) => a.name);

	reviewContextGateway.updateProgress(jobContext.localPath, jobContext.mergeRequestId, {
		phase: progress.currentPhase,
		currentStep: runningAgent?.name ?? null,
		stepsCompleted: completedAgents,
		updatedAt: new Date().toISOString(),
	});
}
