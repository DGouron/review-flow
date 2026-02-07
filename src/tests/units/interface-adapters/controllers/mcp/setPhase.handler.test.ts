import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { createSetPhaseHandler } from "../../../../../interface-adapters/controllers/mcp/setPhase.handler.js";

describe("setPhase handler", () => {
	it("should return success when setting a valid phase", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);
		const handler = createSetPhaseHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", phase: "agents-running" });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.phase).toBe("agents-running");
	});

	it("should return error when jobId is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createSetPhaseHandler({ progressGateway: gateway });

		const result = handler({ phase: "agents-running" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});

	it("should return error when phase is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createSetPhaseHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("phase is required");
	});

	it("should return error when phase is invalid", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createSetPhaseHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", phase: "invalid-phase" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Invalid phase");
	});

	it("should return error when job does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createSetPhaseHandler({ progressGateway: gateway });

		const result = handler({ jobId: "unknown", phase: "agents-running" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("not found");
	});
});
