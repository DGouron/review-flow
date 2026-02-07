import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpDependencies } from "../../../main/mcpDependencies.js";
import { ReviewContextFileSystemGateway } from "../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("createMcpDependencies", () => {
	let tempDir: string;
	let reviewContextGateway: ReviewContextFileSystemGateway;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-deps-test-"));
		reviewContextGateway = new ReviewContextFileSystemGateway();
	});

	it("should create all required MCP dependencies", () => {
		const deps = createMcpDependencies({ reviewContextGateway });

		expect(deps.progressGateway).toBeDefined();
		expect(deps.jobContextGateway).toBeDefined();
		expect(deps.reviewContextGateway).toBe(reviewContextGateway);
	});

	it("should configure progressGateway with onProgressChange callback", () => {
		const onProgressChange = vi.fn();
		const deps = createMcpDependencies({
			reviewContextGateway,
			onProgressChange,
		});

		deps.progressGateway.createProgress("job-1", ["ddd"]);
		deps.progressGateway.startAgent("job-1", "ddd");

		expect(onProgressChange).toHaveBeenCalledWith("job-1", expect.any(Object));
	});

	it("should sync progress to reviewContext when onProgressChange and job context exists", () => {
		const deps = createMcpDependencies({ reviewContextGateway });
		const jobId = "gitlab:project:123";
		const mergeRequestId = "gitlab-project-123";

		reviewContextGateway.create({
			localPath: tempDir,
			mergeRequestId,
			platform: "gitlab",
			projectPath: "project",
			mergeRequestNumber: 123,
			threads: [],
		});

		deps.jobContextGateway.register(jobId, { localPath: tempDir, mergeRequestId });
		deps.progressGateway.createProgress(jobId, ["ddd"]);
		deps.progressGateway.startAgent(jobId, "ddd");

		const context = reviewContextGateway.read(tempDir, mergeRequestId);
		expect(context?.progress.currentStep).toBe("ddd");
	});

	it("should return handler factories that work with the dependencies", () => {
		const deps = createMcpDependencies({ reviewContextGateway });

		deps.progressGateway.createProgress("job-1", ["agent-1"]);
		const progress = deps.progressGateway.getProgress("job-1");

		expect(progress).toBeDefined();
		expect(progress?.agents).toHaveLength(1);
	});
});
