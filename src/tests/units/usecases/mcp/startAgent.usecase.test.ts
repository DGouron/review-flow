import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { startAgent } from "../../../../usecases/mcp/startAgent.usecase.js";

describe("startAgent usecase", () => {
	it("should start a pending agent and return success with startedAt", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);

		const result = startAgent("job-1", "ddd", { progressGateway: gateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.agentName).toBe("ddd");
			expect(result.startedAt).toBeInstanceOf(Date);
		}
	});

	it("should return error when agent does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);

		const result = startAgent("job-1", "unknown", { progressGateway: gateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("Agent not found: unknown");
		}
	});

	it("should return error when job does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();

		const result = startAgent("unknown-job", "ddd", { progressGateway: gateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("not found");
		}
	});

	it("should return updated overallProgress", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);

		const result = startAgent("job-1", "ddd", { progressGateway: gateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.overallProgress).toBeGreaterThan(0);
		}
	});
});
