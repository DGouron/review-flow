import type { JobContextGateway } from "../../entities/job/jobContext.gateway.js";
import type { ReviewContextGateway } from "../../entities/reviewContext/reviewContext.gateway.js";
import type { ReviewContextThread } from "../../entities/reviewContext/reviewContext.js";

export type GetThreadsResult =
	| { success: true; threads: ReviewContextThread[] }
	| { success: false; error: string };

export interface GetThreadsDependencies {
	jobContextGateway: JobContextGateway;
	reviewContextGateway: ReviewContextGateway;
}

export function getThreads(
	jobId: string,
	deps: GetThreadsDependencies,
): GetThreadsResult {
	const { jobContextGateway, reviewContextGateway } = deps;

	const jobContext = jobContextGateway.get(jobId);
	if (!jobContext) {
		return {
			success: false,
			error: `Job context not found: ${jobId}`,
		};
	}

	const reviewContext = reviewContextGateway.read(
		jobContext.localPath,
		jobContext.mergeRequestId,
	);

	if (!reviewContext) {
		return {
			success: false,
			error: `Review context not found for job: ${jobId}`,
		};
	}

	return {
		success: true,
		threads: reviewContext.threads,
	};
}
