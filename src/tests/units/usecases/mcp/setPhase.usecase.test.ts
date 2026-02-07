import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { setPhase } from "../../../../usecases/mcp/setPhase.usecase.js";

describe("setPhase usecase", () => {
	it("should set phase to agents-running and return success", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);

		const result = setPhase("job-1", "agents-running", { progressGateway: gateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.phase).toBe("agents-running");
		}
	});

	it("should set phase to completed", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);

		const result = setPhase("job-1", "completed", { progressGateway: gateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.phase).toBe("completed");
		}
	});

	it("should return error when job does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();

		const result = setPhase("unknown-job", "agents-running", { progressGateway: gateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("not found");
		}
	});

	it("should return updated overallProgress", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);

		const result = setPhase("job-1", "completed", { progressGateway: gateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.overallProgress).toBeDefined();
		}
	});
});
