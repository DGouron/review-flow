import type { ReviewProgressGateway } from "../../entities/progress/progress.gateway.js";
import type { ReviewPhase } from "../../entities/progress/progress.type.js";

export type SetPhaseResult =
	| { success: true; phase: ReviewPhase; overallProgress: number }
	| { success: false; error: string };

export interface SetPhaseDependencies {
	progressGateway: ReviewProgressGateway;
}

export function setPhase(
	jobId: string,
	phase: ReviewPhase,
	deps: SetPhaseDependencies,
): SetPhaseResult {
	const { progressGateway } = deps;

	const progress = progressGateway.setPhase(jobId, phase);

	if (!progress) {
		return {
			success: false,
			error: `Job not found: ${jobId}`,
		};
	}

	return {
		success: true,
		phase: progress.currentPhase,
		overallProgress: progress.overallProgress,
	};
}
