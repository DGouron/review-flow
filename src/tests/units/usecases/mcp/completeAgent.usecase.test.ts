import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { completeAgent } from "../../../../usecases/mcp/completeAgent.usecase.js";

describe("completeAgent usecase", () => {
	it("should complete a running agent with success status", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);
		gateway.startAgent("job-1", "ddd");

		const result = completeAgent("job-1", "ddd", "success", undefined, {
			progressGateway: gateway,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.agentName).toBe("ddd");
			expect(result.status).toBe("completed");
			expect(result.completedAt).toBeInstanceOf(Date);
		}
	});

	it("should complete a running agent with failed status and error message", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["testing"]);
		gateway.startAgent("job-1", "testing");

		const result = completeAgent("job-1", "testing", "failed", "No test files found", {
			progressGateway: gateway,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.agentName).toBe("testing");
			expect(result.status).toBe("failed");
			expect(result.error).toBe("No test files found");
		}
	});

	it("should return error when agent does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);

		const result = completeAgent("job-1", "unknown", "success", undefined, {
			progressGateway: gateway,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("Agent not found: unknown");
		}
	});

	it("should return error when job does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();

		const result = completeAgent("unknown-job", "ddd", "success", undefined, {
			progressGateway: gateway,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("not found");
		}
	});

	it("should return updated overallProgress", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);
		gateway.startAgent("job-1", "ddd");

		const result = completeAgent("job-1", "ddd", "success", undefined, {
			progressGateway: gateway,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.overallProgress).toBeGreaterThan(0);
		}
	});
});
