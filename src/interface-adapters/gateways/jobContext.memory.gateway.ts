import type {
	JobContext,
	JobContextGateway,
} from "../../entities/job/jobContext.gateway.js";

export class JobContextMemoryGateway implements JobContextGateway {
	private contexts = new Map<string, JobContext>();

	register(jobId: string, context: JobContext): void {
		this.contexts.set(jobId, context);
	}

	get(jobId: string): JobContext | undefined {
		return this.contexts.get(jobId);
	}

	unregister(jobId: string): void {
		this.contexts.delete(jobId);
	}
}
