# MCP Review Progress - Architecture Clean

## Vue d'ensemble

Le MCP Server est un **nouveau canal d'entrée** pour le Bounded Context existant `reviewProgress`. Il réutilise les entités et types existants sans duplication.

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
│  │ (Controllers)      │  │ Gateway (NOUVEAU)  │  │ Gateway (existant) │    │
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
│                    ENTITIES (EXISTANTS - réutilisés)                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ progress/progress.type.ts     → ReviewProgress, AgentProgress        │   │
│  │ reviewContext/reviewContext.ts → ReviewContext, ReviewContextProgress│   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Décision DDD : Pas de nouveau Bounded Context

Le MCP réutilise le BC existant `reviewProgress` car :
- Même vocabulaire (Agent, Phase, Progress)
- Même raison d'être (tracker la progression)
- MCP = nouveau canal, pas nouveau domaine

---

## Structure des fichiers

```
src/
├── entities/
│   ├── progress/                      # EXISTANT - réutilisé tel quel
│   │   ├── progress.type.ts           # ReviewProgress, AgentProgress, ReviewPhase
│   │   ├── progress.factory.ts        # createInitialProgress()
│   │   ├── progress.calculator.ts     # calculateOverallProgress()
│   │   └── agentDefinition.type.ts    # AgentDefinition
│   │
│   └── reviewContext/                 # EXISTANT - réutilisé tel quel
│       ├── reviewContext.ts           # ReviewContext, ReviewContextProgress
│       ├── reviewContext.schema.ts    # Zod schemas
│       └── reviewContext.gateway.ts   # Interface gateway
│
├── usecases/
│   └── mcp/                           # NOUVEAU - Use cases MCP
│       ├── getWorkflow.usecase.ts
│       ├── startAgent.usecase.ts
│       ├── completeAgent.usecase.ts
│       ├── setPhase.usecase.ts
│       ├── addAction.usecase.ts
│       └── getThreads.usecase.ts
│
├── interface-adapters/
│   ├── gateways/
│   │   ├── reviewContext.fileSystem.gateway.ts  # EXISTANT
│   │   └── reviewProgress.memory.gateway.ts     # NOUVEAU - état runtime + events
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
│   └── mcpDependencies.ts             # NOUVEAU - DI container MCP
│
└── tests/
    └── units/
        ├── usecases/mcp/
        └── interface-adapters/
            ├── gateways/reviewProgress.memory.gateway.test.ts
            └── controllers/mcp/
```

---

## Entités réutilisées (existantes)

### `entities/progress/progress.type.ts`

```typescript
// Déjà existant - ne pas modifier
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

## Nouveau Gateway : ReviewProgressMemoryGateway

### Interface (à ajouter dans entities/progress/)

```typescript
// entities/progress/progress.gateway.ts (NOUVEAU)
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

### Implémentation

```typescript
// interface-adapters/gateways/reviewProgress.memory.gateway.ts (NOUVEAU)
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

  // ... autres méthodes
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

## Intégration WebSocket (bridge)

```typescript
// Dans main/mcpDependencies.ts
export function createMcpDependencies(existingDeps: Dependencies) {
  const progressGateway = new ReviewProgressMemoryGateway()

  // Bridge: MCP → WebSocket broadcast
  progressGateway.onProgressChange((jobId, progress) => {
    // Broadcast au dashboard via WebSocket existant
    broadcastProgress(jobId, progress)

    // Sync vers fichier JSON pour backward compat
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

## Diagramme de séquence

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

## Dépendance NPM requise

```bash
yarn add @modelcontextprotocol/sdk
```

---

## Prochaines étapes

Voir tickets dans `.claude/backlog/tickets/`
