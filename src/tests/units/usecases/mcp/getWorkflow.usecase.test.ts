import { describe, it, expect, beforeEach } from "vitest";
import { getWorkflow } from "../../../../usecases/mcp/getWorkflow.usecase.js";
import { ReviewProgressMemoryGateway } from "../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";

describe("getWorkflow usecase", () => {
	let progressGateway: ReviewProgressMemoryGateway;

	beforeEach(() => {
		progressGateway = new ReviewProgressMemoryGateway();
	});

	it("should return workflow with agents when job exists", () => {
		const jobId = "gitlab:mentor-goal/app:4748";
		const agents = [
			"clean-architecture",
			"ddd",
			"react",
			"solid",
			"testing",
			"code-quality",
		];
		progressGateway.createProgress(jobId, agents);

		const result = getWorkflow(jobId, { progressGateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.workflow.agents).toHaveLength(6);
			expect(result.workflow.agents.map((a) => a.name)).toEqual(agents);
		}
	});

	it("should return current phase in currentState", () => {
		const jobId = "gitlab:project:123";
		progressGateway.createProgress(jobId, ["agent1"]);

		const result = getWorkflow(jobId, { progressGateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.workflow.currentState.phase).toBe("initializing");
			expect(result.workflow.currentState.overallProgress).toBe(0);
		}
	});

	it("should return error when job does not exist", () => {
		const result = getWorkflow("gitlab:unknown:999", { progressGateway });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("Workflow not found: gitlab:unknown:999");
		}
	});

	it("should include instructions in workflow", () => {
		const jobId = "gitlab:project:123";
		progressGateway.createProgress(jobId, ["agent1"]);

		const result = getWorkflow(jobId, { progressGateway });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.workflow.instructions).toBeDefined();
			expect(result.workflow.instructions.length).toBeGreaterThan(0);
		}
	});
});
