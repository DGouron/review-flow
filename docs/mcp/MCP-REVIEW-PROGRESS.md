---
title: MCP Review Progress Specification
scope: spec
related:
  - docs/MCP-TOOLS-REFERENCE.md
  - docs/mcp/MCP-ARCHITECTURE.md
  - src/mcpServer.ts
last-updated: 2026-02-07
---

# MCP Review Progress - Specification

## Problem

The current system parses `[PROGRESS:agent:status]` markers from Claude's stdout, but:
- stdout is buffered and unreliable at runtime
- Markers are custom and non-standardized
- Project skills must know which markers to emit
- No validation, fragile regex parsing

## Solution

Create a local **MCP Server** that exposes standardized tools for progress tracking.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Server (Fastify + MCP Server)                                  │
│  ┌─────────────────────┐     ┌────────────────────────────────┐ │
│  │ MCP Server (stdio)  │────►│ WebSocket broadcast            │ │
│  │                     │     │ + JSON file update             │ │
│  └──────────┬──────────┘     └────────────────────────────────┘ │
└─────────────┼───────────────────────────────────────────────────┘
              │ MCP Protocol
              │
┌─────────────▼───────────────────────────────────────────────────┐
│  Claude CLI                                                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Skill calls:                                                ││
│  │   mcp__review_progress__get_workflow()  → list of steps     ││
│  │   mcp__review_progress__start_agent("clean-architecture")   ││
│  │   mcp__review_progress__complete_agent("clean-architecture")││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Tools

For full tool parameters and examples, see [MCP-TOOLS-REFERENCE.md](../MCP-TOOLS-REFERENCE.md).

### Tool Summary

| Tool | Purpose |
|------|---------|
| `get_workflow` | Get workflow definition, agent list, and MR context (call first) |
| `set_phase` | Update global review phase |
| `start_agent` | Signal the start of an agent/audit |
| `complete_agent` | Signal the end of an agent/audit |
| `add_action` | Queue an action (resolve thread, post comment) |
| `get_threads` | Retrieve open threads on the MR |

## Claude CLI Integration

### Option A: MCP Config in project (recommended)

Add to `.claude/settings.json` of the analyzed project:
```json
{
  "mcpServers": {
    "review-progress": {
      "command": "node",
      "args": ["/path/to/claude-review-automation/dist/mcpServer.js"],
      "env": {
        "REVIEW_JOB_ID": "${JOB_ID}",
        "REVIEW_LOCAL_PATH": "${LOCAL_PATH}"
      }
    }
  }
}
```

### Option B: MCP via CLI argument

```bash
claude --print \
  --mcp '{"review-progress":{"command":"node","args":["mcpServer.js"]}}' \
  -p "/review-front 4748"
```

## Typical Workflow in a Skill

```markdown
## Review Instructions

1. **MANDATORY**: Call `mcp__review_progress__get_workflow()` to get:
   - The list of agents to execute in order
   - Existing threads on the MR
   - The review context

2. Call `mcp__review_progress__set_phase("agents-running")`

3. For each agent in order:
   - `mcp__review_progress__start_agent("agent-name")`
   - Perform the audit
   - `mcp__review_progress__complete_agent("agent-name")`

4. `mcp__review_progress__set_phase("synthesizing")`
   - Compile the final report

5. `mcp__review_progress__set_phase("publishing")`
   - Post to GitLab

6. `mcp__review_progress__set_phase("completed")`
```

## Key Files

1. `src/mcp/server.ts` - MCP Server setup
2. `src/mcp/mcpServerStdio.ts` - Stdio transport
3. `src/mcp/types.ts` - Types and validation
4. `src/mcpServer.ts` - Entry point (builds to `dist/mcpServer.js`)
5. `src/interface-adapters/controllers/mcp/` - Tool handlers
6. `src/usecases/mcp/` - Use cases

## Migration

1. Create the MCP Server
2. Update `claudeInvoker.ts` to pass env vars
3. Create a skill template with MCP instructions
4. Deprecate stdout parsing (keep as fallback)

## Tests

- Unit tests for each tool
- Integration test: spawn MCP server + simulate calls
- E2E test: full review with MCP

## Status

- [x] Spec validated
- [x] MCP Server implemented
- [x] Tools implemented
- [x] claudeInvoker integration
- [x] Skill template created
- [ ] Tests
- [ ] Migrate existing skills
