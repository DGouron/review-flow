---
title: MCP Tools Reference
scope: reference
related:
  - src/mcp/
  - src/interface-adapters/controllers/mcp/
  - src/usecases/mcp/
last-updated: 2026-02-07
---

# MCP Tools Reference

Reference for all MCP tools. Unlike text markers (see `MARKERS-REFERENCE.md`), MCP tools provide structured communication with immediate feedback.

**Server**: `dist/mcpServer.js` | **Config**: `~/.claude/settings.json` → `mcpServers.review-progress` | **Logs**: `~/.claude-review/logs/mcp-server.log`

## Environment Variables

Passed by `claudeInvoker.ts`:

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_JOB_ID` | Unique job identifier | `gitlab:mentor-goal/main-app-v3:4746` |
| `MCP_LOCAL_PATH` | Local repository path | `/home/user/projects/frontend` |
| `MCP_MERGE_REQUEST_ID` | Platform-specific MR/PR ID | `gitlab-mentor-goal/main-app-v3-4746` |
| `MCP_JOB_TYPE` | Job type | `review` or `followup` |

---

## Progress Tools

### `get_workflow`

Get the current workflow state including all agents and their status.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |

**Example**: `get_workflow({ jobId: "gitlab:mentor-goal/main-app-v3:4746" })`

**Response**: `{ jobId, phase, overallProgress, agents: [{ name, status, progress }] }`

---

### `start_agent`

Signal that an agent audit is starting.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |
| `agentName` | string | Yes | Name of the agent starting (kebab-case) |

**Example**: `start_agent({ jobId: "gitlab:...", agentName: "clean-architecture" })`

**Response**: `{ success, agent, status: "running" }`. Sets agent to `running`, broadcasts via WebSocket. Unknown agents are dynamically added.

**Equivalent Marker**: `[PROGRESS:clean-architecture:started]`

---

### `complete_agent`

Signal that an agent audit is complete.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |
| `agentName` | string | Yes | Name of the agent completing |
| `status` | enum | Yes | `success` or `failed` |
| `error` | string | No | Error message if status is `failed` |

**Example**: `complete_agent({ jobId: "gitlab:...", agentName: "clean-architecture", status: "success" })`

**Response**: `{ success, agent, status, overallProgress }`. Recalculates overall progress and broadcasts via WebSocket.

---

### `set_phase`

Set the current review phase.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |
| `phase` | enum | Yes | Phase to set |

**Valid Phases**:

| Phase | Description |
|-------|-------------|
| `initializing` | Review setup (loading config, fetching MR data) |
| `agents-running` | Individual agents analyzing code |
| `synthesizing` | Combining agent results into final report |
| `publishing` | Posting results to platform |
| `completed` | Review finished |

**Example**: `set_phase({ jobId: "gitlab:...", phase: "synthesizing" })`

**Response**: `{ success, phase }`. Broadcasts via WebSocket. Idempotent (duplicate phase changes accepted).

**Equivalent Marker**: `[PHASE:synthesizing]`

---

## Thread Tools

### `get_threads`

Get all discussion threads from the MR/PR.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |

**Example**: `get_threads({ jobId: "gitlab:mentor-goal/main-app-v3:4746" })`

**Response**: `{ threads: [{ id, resolved, author, body, file, line, createdAt }] }`. Loaded from review context file created by `claudeInvoker.ts` at job start.

---

### `add_action`

Queue an action to be executed (resolve thread, post comment, reply).

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |
| `type` | enum | Yes | Action type |
| `threadId` | string | Conditional | Thread ID (required for `THREAD_RESOLVE`, `THREAD_REPLY`) |
| `message` | string | Conditional | Reply message (required for `THREAD_REPLY`) |
| `body` | string | Conditional | Comment body (required for `POST_COMMENT`) |

**Action Types**:

| Type | Description | Required Params |
|------|-------------|-----------------|
| `THREAD_RESOLVE` | Resolve/close a thread | `threadId` |
| `THREAD_REPLY` | Reply to a thread | `threadId`, `message` |
| `POST_COMMENT` | Post top-level comment | `body` |

**Example**: `add_action({ jobId: "gitlab:...", type: "THREAD_RESOLVE", threadId: "abc123" })`

**Response**: `{ success, action, queuePosition }`. Actions are queued and executed in order after review completion by `claudeInvoker.ts`.

---

## MCP Tools vs Text Markers

MCP tools provide structured JSON with immediate feedback, real-time WebSocket dashboard updates, and explicit error handling. Text markers are simpler (no setup) but parsed after CLI completion with silent failures. Use MCP for real-time progress; markers for backward compatibility.

---

## Debugging

Logs: `tail -f ~/.claude-review/logs/mcp-server.log`

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common MCP issues.

## Integration with Skills

In a skill, call tools in order: `get_workflow` → `start_agent` → `complete_agent` → `set_phase` → `add_action`. The skill must run in a context where MCP servers are loaded (Claude must invoke the tools, not just reference them).
