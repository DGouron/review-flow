import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpDependencies } from "../main/mcpDependencies.js";
import { ReviewContextFileSystemGateway } from "../interface-adapters/gateways/reviewContext.fileSystem.gateway.js";
import { createGetWorkflowHandler } from "../interface-adapters/controllers/mcp/getWorkflow.handler.js";
import { createStartAgentHandler } from "../interface-adapters/controllers/mcp/startAgent.handler.js";
import { createCompleteAgentHandler } from "../interface-adapters/controllers/mcp/completeAgent.handler.js";
import { createSetPhaseHandler } from "../interface-adapters/controllers/mcp/setPhase.handler.js";
import { createGetThreadsHandler } from "../interface-adapters/controllers/mcp/getThreads.handler.js";
import { createAddActionHandler } from "../interface-adapters/controllers/mcp/addAction.handler.js";
import { getProjectAgents, getFollowupAgents } from "../config/projectConfig.js";

interface McpJobContext {
	jobId: string;
	localPath: string;
	mergeRequestId: string;
	jobType: "review" | "followup";
}

function getJobContextFromEnv(): McpJobContext | null {
	const jobId = process.env.MCP_JOB_ID;
	const localPath = process.env.MCP_LOCAL_PATH;
	const mergeRequestId = process.env.MCP_MERGE_REQUEST_ID;
	const jobType = (process.env.MCP_JOB_TYPE as "review" | "followup") || "review";

	if (!jobId || !localPath || !mergeRequestId) {
		return null;
	}

	return { jobId, localPath, mergeRequestId, jobType };
}

const TOOL_DEFINITIONS = [
	{
		name: "get_workflow",
		description: "Get the current workflow state including agents and their status",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
			},
			required: ["jobId"],
		},
	},
	{
		name: "start_agent",
		description: "Signal that an agent audit is starting",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
				agentName: { type: "string", description: "The name of the agent starting" },
			},
			required: ["jobId", "agentName"],
		},
	},
	{
		name: "complete_agent",
		description: "Signal that an agent audit is complete",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
				agentName: { type: "string", description: "The name of the agent completing" },
				status: { type: "string", enum: ["success", "failed"], description: "The completion status" },
				error: { type: "string", description: "Error message if status is failed" },
			},
			required: ["jobId", "agentName", "status"],
		},
	},
	{
		name: "set_phase",
		description: "Set the current review phase",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
				phase: {
					type: "string",
					enum: ["initializing", "agents-running", "synthesizing", "publishing", "completed"],
					description: "The phase to set",
				},
			},
			required: ["jobId", "phase"],
		},
	},
	{
		name: "get_threads",
		description: "Get all discussion threads from the MR/PR",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
			},
			required: ["jobId"],
		},
	},
	{
		name: "add_action",
		description: "Add an action to be executed (resolve thread, post comment, reply)",
		inputSchema: {
			type: "object" as const,
			properties: {
				jobId: { type: "string", description: "The job ID for the review" },
				type: {
					type: "string",
					enum: ["THREAD_RESOLVE", "THREAD_REPLY", "POST_COMMENT"],
					description: "The action type",
				},
				threadId: { type: "string", description: "Thread ID for resolve/reply actions" },
				message: { type: "string", description: "Message for reply action" },
				body: { type: "string", description: "Body for post comment action" },
			},
			required: ["jobId", "type"],
		},
	},
];

export async function startMcpServer(): Promise<void> {
	const reviewContextGateway = new ReviewContextFileSystemGateway();
	const mcpDeps = createMcpDependencies({ reviewContextGateway });

	const jobContext = getJobContextFromEnv();
	if (jobContext) {
		mcpDeps.jobContextGateway.register(jobContext.jobId, {
			localPath: jobContext.localPath,
			mergeRequestId: jobContext.mergeRequestId,
		});

		const agents = jobContext.jobType === "followup"
			? getFollowupAgents(jobContext.localPath)
			: getProjectAgents(jobContext.localPath);

		const agentNames = agents?.map((a) => a.name) ?? ["analysis"];
		mcpDeps.progressGateway.createProgress(jobContext.jobId, agentNames);
	}

	const getWorkflowHandler = createGetWorkflowHandler({ progressGateway: mcpDeps.progressGateway });
	const startAgentHandler = createStartAgentHandler({ progressGateway: mcpDeps.progressGateway });
	const completeAgentHandler = createCompleteAgentHandler({ progressGateway: mcpDeps.progressGateway });
	const setPhaseHandler = createSetPhaseHandler({ progressGateway: mcpDeps.progressGateway });
	const getThreadsHandler = createGetThreadsHandler({
		jobContextGateway: mcpDeps.jobContextGateway,
		reviewContextGateway: mcpDeps.reviewContextGateway,
	});
	const addActionHandler = createAddActionHandler({
		jobContextGateway: mcpDeps.jobContextGateway,
		reviewContextGateway: mcpDeps.reviewContextGateway,
	});

	const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
		get_workflow: getWorkflowHandler,
		start_agent: startAgentHandler,
		complete_agent: completeAgentHandler,
		set_phase: setPhaseHandler,
		get_threads: getThreadsHandler,
		add_action: addActionHandler,
	};

	const server = new Server(
		{
			name: "claude-review-progress",
			version: "1.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: TOOL_DEFINITIONS,
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		const handler = handlers[name];
		if (!handler) {
			return {
				content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
				isError: true,
			};
		}

		const result = handler(args ?? {}) as {
			content: Array<{ type: "text"; text: string }>;
			isError?: boolean;
		};
		return result;
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	startMcpServer().catch(console.error);
}
