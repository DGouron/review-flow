import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import { createCompleteAgentHandler } from "../../../../../interface-adapters/controllers/mcp/completeAgent.handler.js";

describe("completeAgent handler", () => {
	it("should return success when completing an agent with success status", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);
		gateway.startAgent("job-1", "ddd");
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "ddd", status: "success" });

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.agentName).toBe("ddd");
		expect(content.status).toBe("completed");
	});

	it("should return success when completing an agent with failed status and error", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["testing"]);
		gateway.startAgent("job-1", "testing");
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({
			jobId: "job-1",
			agentName: "testing",
			status: "failed",
			error: "No test files found",
		});

		expect(result.isError).toBeUndefined();
		const content = JSON.parse(result.content[0].text);
		expect(content.success).toBe(true);
		expect(content.status).toBe("failed");
		expect(content.error).toBe("No test files found");
	});

	it("should return error when jobId is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ agentName: "ddd", status: "success" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});

	it("should return error when agentName is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", status: "success" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("agentName is required");
	});

	it("should return error when status is missing", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "ddd" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("status is required");
	});

	it("should return error when status is invalid", () => {
		const gateway = new ReviewProgressMemoryGateway();
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "ddd", status: "invalid" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("status must be 'success' or 'failed'");
	});

	it("should return error when agent does not exist", () => {
		const gateway = new ReviewProgressMemoryGateway();
		gateway.createProgress("job-1", ["ddd"]);
		const handler = createCompleteAgentHandler({ progressGateway: gateway });

		const result = handler({ jobId: "job-1", agentName: "unknown", status: "success" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Agent not found");
	});
});
