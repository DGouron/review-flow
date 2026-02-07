---
title: MCP Review Progress Architecture
scope: architecture
related:
  - src/mcp/
  - src/main/mcpDependencies.ts
  - docs/mcp/MCP-REVIEW-PROGRESS.md
last-updated: 2026-02-07
---

# MCP Review Progress - Clean Architecture

## Overview

The MCP Server is a **new input channel** for the existing `reviewProgress` Bounded Context. It reuses existing entities and types without duplication.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP Protocol (stdio)                                │
│                   Claude CLI ←→ MCP Server                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↑↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTERFACE ADAPTERS                                       │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │ MCP Tool Handlers  │  │ Progress Memory    │  │ Context FileSystem │    │
│  │ (Controllers)      │  │ Gateway (new)      │  │ Gateway (existing) │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↑↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USE CASES                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ GetWorkflow  │ │ StartAgent   │ │CompleteAgent │ │ SetPhase     │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↑↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENTITIES (existing - reused)                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ progress/progress.type.ts     → ReviewProgress, AgentProgress        │   │
│  │ reviewContext/reviewContext.ts → ReviewContext, ReviewContextProgress│   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## DDD Decision: No New Bounded Context

MCP reuses the existing `reviewProgress` BC because:
- Same vocabulary (Agent, Phase, Progress)
- Same purpose (tracking progress)
- MCP = new channel, not a new domain

---

## File Structure

```
src/
├── entities/
│   ├── progress/                      # Existing - reused as-is
│   │   ├── progress.type.ts           # ReviewProgress, AgentProgress, ReviewPhase
│   │   ├── progress.factory.ts        # createInitialProgress()
│   │   ├── progress.calculator.ts     # calculateOverallProgress()
│   │   └── agentDefinition.type.ts    # AgentDefinition
│   │
│   └── reviewContext/                 # Existing - reused as-is
│       ├── reviewContext.ts           # ReviewContext, ReviewContextProgress
│       ├── reviewContext.schema.ts    # Zod schemas
│       └── reviewContext.gateway.ts   # Interface gateway
│
├── usecases/
│   └── mcp/                           # MCP use cases
│       ├── getWorkflow.usecase.ts
│       ├── startAgent.usecase.ts
│       ├── completeAgent.usecase.ts
│       ├── setPhase.usecase.ts
│       ├── addAction.usecase.ts
│       └── getThreads.usecase.ts
│
├── interface-adapters/
│   ├── gateways/
│   │   ├── reviewContext.fileSystem.gateway.ts  # Existing
│   │   └── reviewProgress.memory.gateway.ts     # Runtime state + events
│   │
│   └── controllers/
│       └── mcp/                                  # MCP handlers
│           ├── getWorkflow.handler.ts
│           ├── startAgent.handler.ts
│           ├── completeAgent.handler.ts
│           ├── setPhase.handler.ts
│           ├── addAction.handler.ts
│           └── getThreads.handler.ts
│
├── mcp/                               # MCP infrastructure
│   ├── server.ts                      # MCP Server setup
│   ├── mcpServerStdio.ts              # Stdio transport
│   └── types.ts                       # MCP protocol types
│
├── main/
│   └── mcpDependencies.ts             # DI container for MCP
│
└── tests/
    └── units/
        ├── usecases/mcp/
        └── interface-adapters/
            ├── gateways/reviewProgress.memory.gateway.test.ts
            └── controllers/mcp/
```

---

## Reused Entities (existing)

### `entities/progress/progress.type.ts`

```typescript
// Existing - do not modify
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ReviewPhase = 'initializing' | 'agents-running' | 'synthesizing' | 'publishing' | 'completed'

export interface AgentProgress {
  name: string
  displayName: string
  status: AgentStatus
  startedAt?: Date
  completedAt?: Date
  error?: string
}

export interface ReviewProgress {
  agents: AgentProgress[]
  currentPhase: ReviewPhase
  overallProgress: number
  lastUpdate: Date
}
```

---

## ReviewProgressMemoryGateway

### Interface (in entities/progress/)

```typescript
// entities/progress/progress.gateway.ts
export interface ReviewProgressGateway {
  create(jobId: string, agents: AgentDefinition[]): ReviewProgress
  get(jobId: string): ReviewProgress | null
  delete(jobId: string): boolean

  setPhase(jobId: string, phase: ReviewPhase): ReviewProgress | null
  startAgent(jobId: string, agentName: string): ReviewProgress | null
  completeAgent(jobId: string, agentName: string, status: 'success' | 'failed', error?: string): ReviewProgress | null

  onProgressChange(callback: (jobId: string, progress: ReviewProgress) => void): void
}
```

### Implementation

```typescript
// interface-adapters/gateways/reviewProgress.memory.gateway.ts
export class ReviewProgressMemoryGateway implements ReviewProgressGateway {
  private progressMap = new Map<string, ReviewProgress>()
  private jobMetadata = new Map<string, { localPath: string; mergeRequestId: string }>()
  private callbacks: Array<(jobId: string, progress: ReviewProgress) => void> = []

  create(jobId: string, agents: AgentDefinition[]): ReviewProgress {
    const progress = createInitialProgress(agents)
    this.progressMap.set(jobId, progress)
    this.notify(jobId, progress)
    return progress
  }

  // ... other methods
}
```

---

## Use Cases

### `usecases/mcp/getWorkflow.usecase.ts`

```typescript
export interface GetWorkflowInput {
  jobId: string
}

export interface GetWorkflowOutput {
  jobId: string
  workflow: {
    phases: ReviewPhase[]
    agents: Array<{ name: string; displayName: string; order: number }>
    instructions: string
  }
  context: {
    mergeRequestNumber: number
    projectPath: string
    platform: 'gitlab' | 'github'
    threads: ReviewContextThread[]
  }
  currentState: {
    phase: ReviewPhase
    agents: AgentProgress[]
    overallProgress: number
  }
}

const WORKFLOW_INSTRUCTIONS = `
MANDATORY WORKFLOW - Call these MCP tools in order:

1. get_workflow (this tool) - Get context and agent list
2. set_phase("initializing") - Mark review as starting
3. set_phase("agents-running") - Before running audits
4. For EACH agent in workflow.agents (in order):
   a. start_agent(agentName) - BEFORE starting audit
   b. [Perform the audit]
   c. complete_agent(agentName) - AFTER completing audit
5. set_phase("synthesizing") - When compiling report
6. set_phase("publishing") - When posting to GitLab/GitHub
7. set_phase("completed") - When done

Use add_action() for thread resolutions or comments.
Use get_threads() to check current thread state.
`
```

---

## MCP Server

### `mcp/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: object
  handler: (params: unknown) => Promise<McpToolResult>
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export class ReviewProgressMcpServer {
  private server: Server
  private tools = new Map<string, McpToolDefinition>()

  constructor() {
    this.server = new Server(
      { name: 'review-progress', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )
  }

  registerTool(tool: McpToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  async start(): Promise<void> {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: Array.from(this.tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }))

    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params
      const tool = this.tools.get(name)
      if (!tool) throw new Error(`Unknown tool: ${name}`)
      return tool.handler(args)
    })

    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }
}
```

---

## WebSocket Integration (bridge)

```typescript
// In main/mcpDependencies.ts
export function createMcpDependencies(existingDeps: Dependencies) {
  const progressGateway = new ReviewProgressMemoryGateway()

  // Bridge: MCP → WebSocket broadcast
  progressGateway.onProgressChange((jobId, progress) => {
    // Broadcast to dashboard via existing WebSocket
    broadcastProgress(jobId, progress)

    // Sync to JSON file for backward compatibility
    const metadata = progressGateway.getMetadata(jobId)
    if (metadata) {
      existingDeps.reviewContextGateway.updateProgress(
        metadata.localPath,
        metadata.mergeRequestId,
        {
          phase: progress.currentPhase,
          currentStep: progress.agents.find(a => a.status === 'running')?.name ?? null,
          stepsCompleted: progress.agents.filter(a => a.status === 'completed').map(a => a.name),
        }
      )
    }
  })

  return {
    progressGateway,
    contextGateway: existingDeps.reviewContextGateway,
    // ... use cases
  }
}
```

---

## Sequence Diagram

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────┐
│ Claude   │     │ MCP Server│     │ Use Cases    │     │ Gateways    │     │ WebSocket │
└────┬─────┘     └─────┬─────┘     └──────┬───────┘     └──────┬──────┘     └─────┬─────┘
     │                 │                  │                    │                  │
     │ get_workflow    │                  │                    │                  │
     │────────────────>│ getWorkflow()    │                    │                  │
     │                 │─────────────────>│ get(jobId)         │                  │
     │                 │                  │───────────────────>│                  │
     │<────────────────│<─────────────────│<───────────────────│                  │
     │ {workflow,      │                  │                    │                  │
     │  context,       │                  │                    │                  │
     │  instructions}  │                  │                    │                  │
     │                 │                  │                    │                  │
     │ start_agent     │                  │                    │                  │
     │("clean-arch")   │                  │                    │                  │
     │────────────────>│ startAgent()     │                    │                  │
     │                 │─────────────────>│ startAgent()       │                  │
     │                 │                  │───────────────────>│ notify()         │
     │                 │                  │                    │─────────────────>│
     │                 │                  │                    │                  │ broadcast
     │<────────────────│<─────────────────│<───────────────────│                  │ to dashboard
     │ {success,       │                  │                    │                  │
     │  startedAt,     │                  │                    │                  │
     │  progress: 8%}  │                  │                    │                  │
```

---

## Required NPM Dependency

```bash
yarn add @modelcontextprotocol/sdk
```

---

## Next Steps

See tickets in `.claude/backlog/tickets/`
