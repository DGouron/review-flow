import { calculateOverallProgress } from "../../entities/progress/progress.calculator.js";
import type {
	ProgressChangeCallback,
	ReviewProgressGateway,
} from "../../entities/progress/progress.gateway.js";
import type { ReviewProgress } from "../../entities/progress/progress.type.js";

export class ReviewProgressMemoryGateway implements ReviewProgressGateway {
	private progressStore = new Map<string, ReviewProgress>();
	private onProgressChange: ProgressChangeCallback | null = null;

	setOnProgressChange(callback: ProgressChangeCallback): void {
		this.onProgressChange = callback;
	}

	createProgress(jobId: string, agentNames: string[]): ReviewProgress {
		const progress: ReviewProgress = {
			agents: agentNames.map((name) => ({
				name,
				displayName: name,
				status: "pending" as const,
			})),
			currentPhase: "initializing",
			overallProgress: 0,
			lastUpdate: new Date(),
		};
		this.progressStore.set(jobId, progress);
		return progress;
	}

	getProgress(jobId: string): ReviewProgress | undefined {
		return this.progressStore.get(jobId);
	}

	startAgent(jobId: string, agentName: string): ReviewProgress | null {
		const progress = this.progressStore.get(jobId);
		if (!progress) return null;

		const agent = progress.agents.find((a) => a.name === agentName);
		if (!agent) return null;

		agent.status = "running";
		agent.startedAt = new Date();
		progress.lastUpdate = new Date();
		progress.overallProgress = calculateOverallProgress(progress);

		if (this.onProgressChange) {
			this.onProgressChange(jobId, progress);
		}

		return progress;
	}

	completeAgent(
		jobId: string,
		agentName: string,
		_result: string,
	): ReviewProgress | null {
		const progress = this.progressStore.get(jobId);
		if (!progress) return null;

		const agent = progress.agents.find((a) => a.name === agentName);
		if (!agent) return null;

		agent.status = "completed";
		agent.completedAt = new Date();
		progress.lastUpdate = new Date();
		progress.overallProgress = calculateOverallProgress(progress);

		if (this.onProgressChange) {
			this.onProgressChange(jobId, progress);
		}

		return progress;
	}
}
