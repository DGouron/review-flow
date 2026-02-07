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

## Reused Entities

**`entities/progress/progress.type.ts`** — `AgentStatus` (`pending`|`running`|`completed`|`failed`), `ReviewPhase` (5 phases), `AgentProgress`, `ReviewProgress`. Do not modify.

---

## ReviewProgressMemoryGateway

**Interface**: `entities/progress/progress.gateway.ts` — CRUD for `ReviewProgress` per jobId, plus `setPhase`, `startAgent`, `completeAgent`, and `onProgressChange` callback.

**Implementation**: `interface-adapters/gateways/reviewProgress.memory.gateway.ts` — In-memory `Map<jobId, ReviewProgress>` with per-job metadata and event callbacks.

---

## Use Cases

**`usecases/mcp/getWorkflow.usecase.ts`** — Returns `{ jobId, workflow (phases, agents, instructions), context (MR number, project, platform, threads), currentState (phase, agents, overallProgress) }`. Includes embedded `WORKFLOW_INSTRUCTIONS` string that guides Claude through the mandatory tool call sequence.

Other use cases in `usecases/mcp/`: `startAgent`, `completeAgent`, `setPhase`, `addAction`, `getThreads`.

---

## MCP Server

**`mcp/server.ts`** — `ReviewProgressMcpServer` wraps `@modelcontextprotocol/sdk`. Registers tools via `registerTool(McpToolDefinition)` and handles `tools/list` and `tools/call` requests. Connects via `StdioServerTransport`.

---

## WebSocket Integration (bridge)

**`main/mcpDependencies.ts`** — `createMcpDependencies()` wires the bridge: `progressGateway.onProgressChange` broadcasts updates to the dashboard via WebSocket and syncs to JSON file for backward compatibility.

---

## Sequence

`Claude → MCP Server → Use Case → Gateway → WebSocket (broadcast to dashboard)`. Each tool call follows this chain. Progress updates trigger both WebSocket broadcast and JSON file sync.

---

## Required NPM Dependency

```bash
yarn add @modelcontextprotocol/sdk
```

---

## Next Steps

See tickets in `.claude/backlog/tickets/`
