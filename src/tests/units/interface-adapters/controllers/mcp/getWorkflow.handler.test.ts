import { describe, it, expect, beforeEach } from "vitest";
import { createGetWorkflowHandler } from "../../../../../interface-adapters/controllers/mcp/getWorkflow.handler.js";
import { ReviewProgressMemoryGateway } from "../../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";
import type { McpToolResult } from "../../../../../mcp/types.js";

describe("getWorkflow handler", () => {
	let progressGateway: ReviewProgressMemoryGateway;
	let handler: (args: Record<string, unknown>) => McpToolResult;

	beforeEach(() => {
		progressGateway = new ReviewProgressMemoryGateway();
		handler = createGetWorkflowHandler({ progressGateway });
	});

	it("should return workflow as MCP text content when job exists", () => {
		const jobId = "gitlab:project:123";
		progressGateway.createProgress(jobId, ["agent1", "agent2"]);

		const result = handler({ jobId });

		expect(result.isError).toBeUndefined();
		expect(result.content[0].type).toBe("text");

		const workflow = JSON.parse(result.content[0].text);
		expect(workflow.agents).toHaveLength(2);
		expect(workflow.currentState.phase).toBe("initializing");
	});

	it("should return error when job does not exist", () => {
		const result = handler({ jobId: "unknown:job:id" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Workflow not found");
	});

	it("should return error when jobId is missing", () => {
		const result = handler({});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("jobId is required");
	});
});
