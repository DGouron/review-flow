import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { createStartAgentHandler } from "../../../../../interface-adapters/controllers/mcp/startAgent.handler.js";

describe("startAgent handler", () => {
	it("should return success when starting a pending agent", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd", "solid"]);
		const handler = createStartAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "ddd" });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.agentName).toBe("ddd");
	});

	it("should return error when jobId is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createStartAgentHandler({ progressGateway: gateway });

		const result = handler({ agentName: "ddd" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});

	it("should return error when agentName is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createStartAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("agentName is required");
	});

	it("should return error when agent does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);
		const handler = createStartAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "unknown" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Agent not found");
	});
});
