import { describe, it, expect, beforeEach } from "vitest";
import { JobContextMemoryGateway } from "../../../../../interface-adapters/gateways/jobContext.memory.gateway.js";
import { ReviewContextFileSystemGateway } from "../../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import { createGetThreadsHandler } from "../../../../../interface-adapters/controllers/mcp/getThreads.handler.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("getThreads handler", () => {
	let tempDir: string;
	let jobContextGateway: JobContextMemoryGateway;
	let reviewContextGateway: ReviewContextFileSystemGateway;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "getThreads-handler-"));
		jobContextGateway = new JobContextMemoryGateway();
		reviewContextGateway = new ReviewContextFileSystemGateway();
	});

	it("should return threads successfully", () => {
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
				{ id: "t1", file: "app.ts", line: 1, status: "open", body: "test" },
			],
		});

		const handler = createGetThreadsHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.threads).toHaveLength(1);
		expect(content.count).toBe(1);
	});

	it("should return error when jobId is missing", () => {
		const handler = createGetThreadsHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});

	it("should return error when job context not found", () => {
		const handler = createGetThreadsHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId: "unknown" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Job context not found");
	});
});
