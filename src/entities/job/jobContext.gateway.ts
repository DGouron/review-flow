export interface JobContext {
	localPath: string;
	mergeRequestId: string;
}

export interface JobContextGateway {
	register(jobId: string, context: JobContext): void;
	get(jobId: string): JobContext | undefined;
	unregister(jobId: string): void;
}
