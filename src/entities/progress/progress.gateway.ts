import type { ReviewPhase, ReviewProgress } from "./progress.type.js";

export type ProgressChangeCallback = (
	jobId: string,
	progress: ReviewProgress,
) => void;

export type AgentCompletionStatus = "success" | "failed";

export interface ReviewProgressGateway {
	createProgress(jobId: string, agentNames: string[]): ReviewProgress;
	getProgress(jobId: string): ReviewProgress | undefined;
	startAgent(jobId: string, agentName: string): ReviewProgress | null;
	completeAgent(
		jobId: string,
		agentName: string,
		status: AgentCompletionStatus,
		error?: string,
	): ReviewProgress | null;
	setPhase(jobId: string, phase: ReviewPhase): ReviewProgress | null;
	setOnProgressChange(callback: ProgressChangeCallback): void;
}
