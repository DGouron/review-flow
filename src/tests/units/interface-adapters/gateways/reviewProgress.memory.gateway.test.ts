import { describe, it, expect } from "vitest";
import { ReviewProgressMemoryGateway } from "../../../../interface-adapters/gateways/reviewProgress.memory.gateway.js";

describe("ReviewProgressMemoryGateway", () => {
	describe("createProgress", () => {
		it("should store a new progress with pending phase and all agents pending", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			const agents = ["clean-architecture", "ddd", "solid"];

			const progress = gateway.createProgress(jobId, agents);

			expect(progress.currentPhase).toBe("initializing");
			expect(progress.overallProgress).toBe(0);
			expect(progress.agents).toHaveLength(3);
			expect(
				progress.agents.every((agent) => agent.status === "pending"),
			).toBe(true);
		});
	});

	describe("getProgress", () => {
		it("should retrieve a stored progress by jobId", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";

			gateway.createProgress(jobId, ["clean-architecture"]);
			const progress = gateway.getProgress(jobId);

			expect(progress).toBeDefined();
			expect(progress?.currentPhase).toBe("initializing");
		});
	});

	describe("startAgent", () => {
		it("should set agent status to running and define startedAt when starting an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			gateway.createProgress(jobId, ["clean-architecture", "ddd"]);

			const progress = gateway.startAgent(jobId, "clean-architecture");

			const agent = progress?.agents.find(
				(a) => a.name === "clean-architecture",
			);
			expect(agent?.status).toBe("running");
			expect(agent?.startedAt).toBeDefined();
		});

		it("should return null when starting an unknown agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			gateway.createProgress(jobId, ["clean-architecture"]);

			const progress = gateway.startAgent(jobId, "unknown-agent");

			expect(progress).toBeNull();
		});
	});

	describe("completeAgent", () => {
		it("should set agent status to completed and define completedAt when completing an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			gateway.createProgress(jobId, ["ddd"]);
			gateway.startAgent(jobId, "ddd");

			const progress = gateway.completeAgent(jobId, "ddd", "success");

			const agent = progress?.agents.find((a) => a.name === "ddd");
			expect(agent?.status).toBe("completed");
			expect(agent?.completedAt).toBeDefined();
		});
	});

	describe("onProgressChange callback", () => {
		it("should call onProgressChange callback when starting an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			let callbackCalled = false;
			let receivedJobId: string | null = null;

			gateway.setOnProgressChange((id) => {
				callbackCalled = true;
				receivedJobId = id;
			});

			gateway.createProgress(jobId, ["clean-architecture"]);
			gateway.startAgent(jobId, "clean-architecture");

			expect(callbackCalled).toBe(true);
			expect(receivedJobId).toBe(jobId);
		});

		it("should call onProgressChange callback when completing an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			let callbackCount = 0;

			gateway.setOnProgressChange(() => {
				callbackCount++;
			});

			gateway.createProgress(jobId, ["ddd"]);
			gateway.startAgent(jobId, "ddd");
			gateway.completeAgent(jobId, "ddd", "success");

			expect(callbackCount).toBe(2);
		});

		it("should not call onProgressChange callback when agent does not exist", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			let callbackCalled = false;

			gateway.setOnProgressChange(() => {
				callbackCalled = true;
			});

			gateway.createProgress(jobId, ["clean-architecture"]);
			gateway.startAgent(jobId, "unknown-agent");

			expect(callbackCalled).toBe(false);
		});

		it("should not call onProgressChange callback when jobId does not exist", () => {
			const gateway = new ReviewProgressMemoryGateway();
			let callbackCalled = false;

			gateway.setOnProgressChange(() => {
				callbackCalled = true;
			});

			gateway.startAgent("unknown-job", "clean-architecture");

			expect(callbackCalled).toBe(false);
		});
	});

	describe("overallProgress calculation", () => {
		it("should increase overallProgress when starting an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			gateway.createProgress(jobId, ["clean-architecture", "ddd"]);

			const progressBefore = gateway.getProgress(jobId)!.overallProgress;
			gateway.startAgent(jobId, "clean-architecture");
			const progressAfter = gateway.getProgress(jobId)!.overallProgress;

			expect(progressAfter).toBeGreaterThan(progressBefore);
		});

		it("should increase overallProgress when completing an agent", () => {
			const gateway = new ReviewProgressMemoryGateway();
			const jobId = "gitlab:project:123";
			gateway.createProgress(jobId, ["clean-architecture"]);
			gateway.startAgent(jobId, "clean-architecture");

			const progressBefore = gateway.getProgress(jobId)!.overallProgress;
			gateway.completeAgent(jobId, "clean-architecture", "success");
			const progressAfter = gateway.getProgress(jobId)!.overallProgress;

			expect(progressAfter).toBeGreaterThan(progressBefore);
		});
	});
});
