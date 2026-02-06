import { describe, it, expect, beforeEach } from "vitest";
import { JobContextMemoryGateway } from "../../../../interface-adapters/gateways/jobContext.memory.gateway.js";
import { ReviewContextFileSystemGateway } from "../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import { addAction } from "../../../../usecases/mcp/addAction.usecase.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("addAction usecase", () => {
	let tempDir: string;
	let jobContextGateway: JobContextMemoryGateway;
	let reviewContextGateway: ReviewContextFileSystemGateway;
	const jobId = "gitlab:project/path:123";
	const mergeRequestId = "gitlab-project-path-123";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "addAction-test-"));
		jobContextGateway = new JobContextMemoryGateway();
		reviewContextGateway = new ReviewContextFileSystemGateway();

		jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId });
		reviewContextGateway.create({
			localPath: tempDir,
			mergeRequestId,
			platform: "gitlab",
			projectPath: "project/path",
			mergeRequestNumber: 123,
			threads: [{ id: "thread-1", file: "src/app.ts", line: 10, status: "open", body: "Fix this" }],
		});
	});

	it("should add THREAD_RESOLVE action successfully", () => {
		const result = addAction(
			jobId,
			{ type: "THREAD_RESOLVE", threadId: "thread-1" },
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.actionId).toBeDefined();
			expect(result.actionType).toBe("THREAD_RESOLVE");
		}

		const context = reviewContextGateway.read(tempDir, mergeRequestId);
		expect(context?.actions).toHaveLength(1);
		expect(context?.actions[0].type).toBe("THREAD_RESOLVE");
	});

	it("should add POST_COMMENT action successfully", () => {
		const result = addAction(
			jobId,
			{ type: "POST_COMMENT", body: "Great work!" },
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.actionId).toBeDefined();
			expect(result.actionType).toBe("POST_COMMENT");
		}
	});

	it("should add THREAD_REPLY action successfully", () => {
		const result = addAction(
			jobId,
			{ type: "THREAD_REPLY", threadId: "thread-1", message: "I will fix it" },
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.actionType).toBe("THREAD_REPLY");
		}
	});

	it("should return error when THREAD_RESOLVE missing threadId", () => {
		const result = addAction(
			jobId,
			{ type: "THREAD_RESOLVE" } as never,
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("threadId required for THREAD_RESOLVE");
		}
	});

	it("should return error when THREAD_REPLY missing threadId", () => {
		const result = addAction(
			jobId,
			{ type: "THREAD_REPLY", message: "test" } as never,
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("threadId required for THREAD_REPLY");
		}
	});

	it("should return error when POST_COMMENT missing body", () => {
		const result = addAction(
			jobId,
			{ type: "POST_COMMENT" } as never,
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("body required for POST_COMMENT");
		}
	});

	it("should return error when job context not found", () => {
		const result = addAction(
			"unknown-job",
			{ type: "POST_COMMENT", body: "test" },
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Job context not found");
		}
	});

	it("should generate unique actionId for each action", () => {
		const result1 = addAction(
			jobId,
			{ type: "POST_COMMENT", body: "First" },
			{ jobContextGateway, reviewContextGateway },
		);
		const result2 = addAction(
			jobId,
			{ type: "POST_COMMENT", body: "Second" },
			{ jobContextGateway, reviewContextGateway },
		);

		expect(result1.success && result2.success).toBe(true);
		if (result1.success && result2.success) {
			expect(result1.actionId).not.toBe(result2.actionId);
		}
	});
});
