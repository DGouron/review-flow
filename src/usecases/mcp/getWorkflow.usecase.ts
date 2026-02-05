import type { ReviewProgressGateway } from "../../entities/progress/progress.gateway.js";
import type { ReviewPhase } from "../../entities/progress/progress.type.js";

export interface WorkflowAgent {
	name: string;
	displayName: string;
	status: string;
}

export interface WorkflowCurrentState {
	phase: ReviewPhase;
	overallProgress: number;
}

export interface Workflow {
	agents: WorkflowAgent[];
	instructions: string;
	currentState: WorkflowCurrentState;
}

export type GetWorkflowResult =
	| { success: true; workflow: Workflow }
	| { success: false; error: string };

export interface GetWorkflowDependencies {
	progressGateway: ReviewProgressGateway;
}

const MCP_INSTRUCTIONS = `## MCP Review Workflow Instructions

1. Call report_agent_start(agentName) before starting each agent
2. Execute your analysis for the agent
3. Call report_agent_complete(agentName, status) when done
4. Use post_comment(body) to post review comments
5. Use resolve_thread(threadId) to mark threads as resolved

Always process agents in the order provided.`;

export function getWorkflow(
	jobId: string,
	deps: GetWorkflowDependencies,
): GetWorkflowResult {
	const { progressGateway } = deps;

	const progress = progressGateway.getProgress(jobId);

	if (!progress) {
		return {
			success: false,
			error: `Workflow not found: ${jobId}`,
		};
	}

	const workflow: Workflow = {
		agents: progress.agents.map((agent) => ({
			name: agent.name,
			displayName: agent.displayName,
			status: agent.status,
		})),
		instructions: MCP_INSTRUCTIONS,
		currentState: {
			phase: progress.currentPhase,
			overallProgress: progress.overallProgress,
		},
	};

	return {
		success: true,
		workflow,
	};
}
