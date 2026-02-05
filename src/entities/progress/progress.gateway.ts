import type { ReviewProgress } from "./progress.type.js";

export type ProgressChangeCallback = (
	jobId: string,
	progress: ReviewProgress,
) => void;

export interface ReviewProgressGateway {
	createProgress(jobId: string, agentNames: string[]): ReviewProgress;
	getProgress(jobId: string): ReviewProgress | undefined;
	startAgent(jobId: string, agentName: string): ReviewProgress | null;
	completeAgent(
		jobId: string,
		agentName: string,
		result: string,
	): ReviewProgress | null;
	setOnProgressChange(callback: ProgressChangeCallback): void;
}
