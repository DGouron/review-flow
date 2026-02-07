import { describe, it, expect, beforeEach } from "vitest";
import { JobContextMemoryGateway } from "../../../../interface-adapters/gateways/jobContext.memory.gateway.js";
import { ReviewContextFileSystemGateway } from "../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import { getThreads } from "../../../../usecases/mcp/getThreads.usecase.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("getThreads usecase", () => {
	let tempDir: string;
	let jobContextGateway: JobContextMemoryGateway;
	let reviewContextGateway: ReviewContextFileSystemGateway;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "getThreads-test-"));
		jobContextGateway = new JobContextMemoryGateway();
		reviewContextGateway = new ReviewContextFileSystemGateway();
	});

	it("should return threads from review context", () => {
		const jobId = "gitlab:project/path:123";
		const mergeRequestId = "gitlab-project-path-123";

		jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId });

		reviewContextGateway.create({
			localPath: tempDir,
			mergeRequestId,
			platform: "gitlab",
			projectPath: "project/path",
			mergeRequestNumber: 123,
			threads: [
				{ id: "thread-1", file: "src/app.ts", line: 10, status: "open", body: "Fix this" },
				{ id: "thread-2", file: "src/util.ts", line: 5, status: "resolved", body: "Done" },
			],
		});

		const result = getThreads(jobId, { jobContextGateway, reviewContextGateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.threads).toHaveLength(2);
			expect(result.threads[0].id).toBe("thread-1");
			expect(result.threads[0].status).toBe("open");
			expect(result.threads[1].id).toBe("thread-2");
			expect(result.threads[1].status).toBe("resolved");
		}
	});

	it("should return error when job context not found", () => {
		const result = getThreads("unknown-job", { jobContextGateway, reviewContextGateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Job context not found");
		}
	});

	it("should return error when review context not found", () => {
		const jobId = "gitlab:project/path:123";
		jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId: "non-existent" });

		const result = getThreads(jobId, { jobContextGateway, reviewContextGateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Review context not found");
		}
	});

	it("should return empty array when no threads exist", () => {
		const jobId = "gitlab:project/path:123";
		const mergeRequestId = "gitlab-project-path-123";

		jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId });

		reviewContextGateway.create({
			localPath: tempDir,
			mergeRequestId,
			platform: "gitlab",
			projectPath: "project/path",
			mergeRequestNumber: 123,
			threads: [],
		});

		const result = getThreads(jobId, { jobContextGateway, reviewContextGateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.threads).toHaveLength(0);
		}
	});
});
