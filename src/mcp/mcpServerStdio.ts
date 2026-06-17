import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { McpToolResult } from '@/mcp/types.js';
import { FileSystemMcpCompletionBridge } from '@/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.fileSystem.gateway.js';
import { createRecordInsightHandler } from '@/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.js';
import { EmberMemoryFileSystemGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.js';
import { createAddActionHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/addAction.handler.js';
import { createCompleteAgentHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/completeAgent.handler.js';
import { createGetThreadsHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/getThreads.handler.js';
import { createGetWorkflowHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/getWorkflow.handler.js';
import { createSetPhaseHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/setPhase.handler.js';
import { createStartAgentHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/startAgent.handler.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';

import { getProjectAgents, getFollowupAgents } from '../config/projectConfig.js';
import { createMcpDependencies } from '../main/mcpDependencies.js';
import type { McpDependencies } from '../main/mcpDependencies.js';
import { getJobContextFilePath } from '../shared/services/mcpJobContext.js';
import { mcpLogger } from './mcpLogger.js';

interface McpJobContext {
  jobId: string;
  localPath: string;
  mergeRequestId: string;
  jobType: 'review' | 'followup';
}

export function loadJobContextFromFile(jobId: string): McpJobContext | null {
  try {
    const filePath = getJobContextFilePath(jobId);
    if (!existsSync(filePath)) {
      mcpLogger.debug('No per-job context file found', { jobId, path: filePath });
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    mcpLogger.info('Loaded job context from per-job file', { jobId, path: filePath });
    return {
      jobId: data.jobId,
      localPath: data.localPath,
      mergeRequestId: data.mergeRequestId,
      jobType: data.jobType || 'review',
    };
  } catch (error) {
    mcpLogger.error('Failed to read per-job context file', { jobId, error: String(error) });
    return null;
  }
}

export function getJobContextFromEnv(): McpJobContext | null {
  const jobId = process.env.MCP_JOB_ID;
  const localPath = process.env.MCP_LOCAL_PATH;
  const mergeRequestId = process.env.MCP_MERGE_REQUEST_ID;
  const jobType: 'review' | 'followup' =
    process.env.MCP_JOB_TYPE === 'followup' ? 'followup' : 'review';

  if (!jobId || !localPath || !mergeRequestId) {
    return null;
  }

  return { jobId, localPath, mergeRequestId, jobType };
}

export function ensureJobContextLoaded(jobId: string, mcpDeps: McpDependencies): void {
  if (mcpDeps.jobContextGateway.get(jobId)) {
    return;
  }

  const jobContext = getJobContextFromEnv() ?? loadJobContextFromFile(jobId);
  if (!jobContext) {
    mcpLogger.warn('No job context found for lazy loading', { jobId });
    return;
  }

  mcpDeps.jobContextGateway.register(jobContext.jobId, {
    localPath: jobContext.localPath,
    mergeRequestId: jobContext.mergeRequestId,
  });
  mcpLogger.info('Job context lazy-loaded and registered', { jobId });

  const agents =
    jobContext.jobType === 'followup'
      ? getFollowupAgents(jobContext.localPath)
      : getProjectAgents(jobContext.localPath);

  const agentNames = agents?.map((a) => a.name) ?? ['analysis'];
  mcpDeps.progressGateway.createProgress(jobContext.jobId, agentNames);
  mcpLogger.info('Progress created via lazy loading', { jobId, agentNames });
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_workflow',
    description: 'Get the current workflow state including agents and their status',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'start_agent',
    description: 'Signal that an agent audit is starting',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
        agentName: { type: 'string', description: 'The name of the agent starting' },
      },
      required: ['jobId', 'agentName'],
    },
  },
  {
    name: 'complete_agent',
    description: 'Signal that an agent audit is complete',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
        agentName: { type: 'string', description: 'The name of the agent completing' },
        status: {
          type: 'string',
          enum: ['success', 'failed'],
          description: 'The completion status',
        },
        error: { type: 'string', description: 'Error message if status is failed' },
      },
      required: ['jobId', 'agentName', 'status'],
    },
  },
  {
    name: 'set_phase',
    description: 'Set the current review phase',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
        phase: {
          type: 'string',
          enum: ['initializing', 'agents-running', 'synthesizing', 'publishing', 'completed'],
          description: 'The phase to set',
        },
      },
      required: ['jobId', 'phase'],
    },
  },
  {
    name: 'get_threads',
    description: 'Get all discussion threads from the MR/PR',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'add_action',
    description:
      'Add an action to be executed (resolve thread, post comment, reply, inline comment)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jobId: { type: 'string', description: 'The job ID for the review' },
        type: {
          type: 'string',
          enum: ['THREAD_RESOLVE', 'THREAD_REPLY', 'POST_COMMENT', 'POST_INLINE_COMMENT'],
          description: 'The action type',
        },
        threadId: { type: 'string', description: 'Thread ID for resolve/reply actions' },
        message: { type: 'string', description: 'Message for reply action' },
        body: { type: 'string', description: 'Body for post comment action or inline comment' },
        filePath: {
          type: 'string',
          description: 'File path for inline comment (POST_INLINE_COMMENT)',
        },
        line: {
          type: 'number',
          description: 'Line number for inline comment (POST_INLINE_COMMENT)',
        },
      },
      required: ['jobId', 'type'],
    },
  },
  {
    name: 'record_insight',
    description:
      "Record a recurring review finding Ember derived for the answered project into Ember's private per-project memory, so a later answer reuses it without recomputing. Use only for genuine recurring review findings, never arbitrary facts.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'The answered project path' },
        insight: { type: 'string', description: 'The recurring finding to record' },
      },
      required: ['projectPath', 'insight'],
    },
  },
];

export async function startMcpServer(): Promise<void> {
  mcpLogger.info('=== MCP Server Starting ===', {
    logFile: mcpLogger.getLogPath(),
    pid: process.pid,
  });

  const reviewContextGateway = new ReviewContextFileSystemGateway();
  const mcpDeps = createMcpDependencies({ reviewContextGateway });

  mcpLogger.info('MCP server initialized - context will be lazy-loaded on first tool call');

  const getWorkflowHandler = createGetWorkflowHandler({ progressGateway: mcpDeps.progressGateway });
  const startAgentHandler = createStartAgentHandler({ progressGateway: mcpDeps.progressGateway });
  const completeAgentHandler = createCompleteAgentHandler({
    progressGateway: mcpDeps.progressGateway,
  });
  // FileSystem-backed bridge: publishes a completion event to ~/.claude-review/
  // completions/<jobId>.json so the Fastify host's awaitSessionCompletion can
  // observe it cross-process. The MCP server lives in a sub-process spawned
  // by `claude --bg`; an in-memory bridge cannot cross that boundary.
  const completionBridge = new FileSystemMcpCompletionBridge();
  const setPhaseHandler = createSetPhaseHandler({
    progressGateway: mcpDeps.progressGateway,
    completionBridge,
  });
  const getThreadsHandler = createGetThreadsHandler({
    jobContextGateway: mcpDeps.jobContextGateway,
    reviewContextGateway: mcpDeps.reviewContextGateway,
  });
  const addActionHandler = createAddActionHandler({
    jobContextGateway: mcpDeps.jobContextGateway,
    reviewContextGateway: mcpDeps.reviewContextGateway,
  });
  // Own EmberMemoryFileSystemGateway: the MCP server is a separate subprocess
  // spawned by `claude --bg` and cannot share the Fastify host's instance. Both
  // write the same ~/.claude-review/ember-memory/<slug>.json — the filesystem is
  // the shared store, exactly as SPEC-192 designed it.
  const emberMemoryGateway = new EmberMemoryFileSystemGateway({ homeDir: homedir() });
  const recordInsightHandler = createRecordInsightHandler({ memory: emberMemoryGateway });

  const handlers: Record<string, (args: Record<string, unknown>) => McpToolResult> = {
    get_workflow: getWorkflowHandler,
    start_agent: startAgentHandler,
    complete_agent: completeAgentHandler,
    set_phase: setPhaseHandler,
    get_threads: getThreadsHandler,
    add_action: addActionHandler,
    record_insight: recordInsightHandler,
  };

  const server = new Server(
    {
      name: 'claude-review-progress',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    mcpLogger.debug('ListTools called', { toolCount: TOOL_DEFINITIONS.length });
    return { tools: TOOL_DEFINITIONS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    mcpLogger.info(`Tool called: ${name}`, { args });

    const jobId = args?.jobId;
    if (typeof jobId === 'string') {
      ensureJobContextLoaded(jobId, mcpDeps);
    }

    const handler = handlers[name];
    if (!handler) {
      mcpLogger.error(`Unknown tool: ${name}`);
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = handler(args ?? {});

      const durationMs = Date.now() - startTime;
      mcpLogger.info(`Tool completed: ${name}`, {
        durationMs,
        isError: result.isError ?? false,
        responsePreview: result.content?.[0]?.text?.substring(0, 200),
      });

      return { ...result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mcpLogger.error(`Tool error: ${name}`, { error: errorMessage });
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  mcpLogger.info('Connecting to stdio transport...');
  await server.connect(transport);
  mcpLogger.info('MCP Server connected and ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await startMcpServer();
  } catch (error) {
    console.error(error);
  }
}
