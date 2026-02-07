import { describe, it, expect, beforeEach } from "vitest";
import { JobContextMemoryGateway } from "../../../../../interface-adapters/gateways/jobContext.memory.gateway.js";
import { ReviewContextFileSystemGateway } from "../../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import { createAddActionHandler } from "../../../../../interface-adapters/controllers/mcp/addAction.handler.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("addAction handler", () => {
	let tempDir: string;
	let jobContextGateway: JobContextMemoryGateway;
	let reviewContextGateway: ReviewContextFileSystemGateway;
	const jobId = "gitlab:project/path:123";
	const mergeRequestId = "gitlab-project-path-123";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "addAction-handler-"));
		jobContextGateway = new JobContextMemoryGateway();
		reviewContextGateway = new ReviewContextFileSystemGateway();

		jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId });
		reviewContextGateway.create({
			localPath: tempDir,
			mergeRequestId,
			platform: "gitlab",
			projectPath: "project/path",
			mergeRequestNumber: 123,
			threads: [{ id: "t1", file: "app.ts", line: 1, status: "open", body: "test" }],
		});
	});

	it("should add THREAD_RESOLVE action successfully", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId, type: "THREAD_RESOLVE", threadId: "t1" });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.actionType).toBe("THREAD_RESOLVE");
		expect(content.actionId).toBeDefined();
	});

	it("should add POST_COMMENT action successfully", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId, type: "POST_COMMENT", body: "Great job!" });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.actionType).toBe("POST_COMMENT");
	});

	it("should return error when jobId is missing", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ type: "POST_COMMENT", body: "test" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});

	it("should return error when type is missing", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("type is required");
	});

	it("should return error when type is invalid", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId, type: "INVALID" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Invalid action type");
	});

	it("should return error when THREAD_RESOLVE missing threadId", () => {
		const handler = createAddActionHandler({ jobContextGateway, reviewContextGateway });
		const result = handler({ jobId, type: "THREAD_RESOLVE" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("threadId required");
	});
});
