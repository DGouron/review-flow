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

Complete reference for all MCP tools exposed by claude-review-automation.

## Overview

MCP (Model Context Protocol) tools allow Claude to communicate progress and actions in real-time during reviews. Unlike text markers (see `MARKERS-REFERENCE.md`), MCP tools provide structured communication with immediate feedback.

**Server**: `dist/mcpServer.js`
**Config**: `~/.claude/settings.json` → `mcpServers.review-progress`
**Logs**: `~/.claude-review/logs/mcp-server.log`

## Environment Variables

The server reads job context from environment variables passed by `claudeInvoker.ts`:

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

**Example Call**:

```
get_workflow({ jobId: "gitlab:mentor-goal/main-app-v3:4746" })
```

**Response**:

```json
{
  "jobId": "gitlab:mentor-goal/main-app-v3:4746",
  "phase": "agents-running",
  "overallProgress": 50,
  "agents": [
    { "name": "clean-architecture", "status": "completed", "progress": 100 },
    { "name": "ddd", "status": "completed", "progress": 100 },
    { "name": "react-best-practices", "status": "running", "progress": 50 },
    { "name": "solid", "status": "pending", "progress": 0 },
    { "name": "testing", "status": "pending", "progress": 0 },
    { "name": "code-quality", "status": "pending", "progress": 0 }
  ]
}
```

**Use Case**: Check current state before starting or resuming work.

---

### `start_agent`

Signal that an agent audit is starting.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |
| `agentName` | string | Yes | Name of the agent starting (kebab-case) |

**Example Call**:

```
start_agent({ jobId: "gitlab:...", agentName: "clean-architecture" })
```

**Response**:

```json
{
  "success": true,
  "agent": "clean-architecture",
  "status": "running"
}
```

**Behavior**:
- Sets agent status to `running`
- Broadcasts update via WebSocket to dashboard
- Unknown agents are dynamically added

**Equivalent Text Marker**: `[PROGRESS:clean-architecture:started]`

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

**Example Calls**:

```
// Success
complete_agent({ jobId: "gitlab:...", agentName: "clean-architecture", status: "success" })

// Failure
complete_agent({ jobId: "gitlab:...", agentName: "testing", status: "failed", error: "Timeout" })
```

**Response**:

```json
{
  "success": true,
  "agent": "clean-architecture",
  "status": "completed",
  "overallProgress": 33
}
```

**Behavior**:
- Sets agent status to `completed` or `failed`
- Recalculates overall progress percentage
- Broadcasts update via WebSocket

**Equivalent Text Markers**:
- `[PROGRESS:clean-architecture:completed]`
- `[PROGRESS:testing:failed:Timeout]`

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

**Example Call**:

```
set_phase({ jobId: "gitlab:...", phase: "synthesizing" })
```

**Response**:

```json
{
  "success": true,
  "phase": "synthesizing"
}
```

**Behavior**:
- Updates workflow phase
- Broadcasts update via WebSocket
- Duplicate phase changes are accepted (idempotent)

**Equivalent Text Marker**: `[PHASE:synthesizing]`

---

## Thread Tools

### `get_threads`

Get all discussion threads from the MR/PR.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | The job ID for the review |

**Example Call**:

```
get_threads({ jobId: "gitlab:mentor-goal/main-app-v3:4746" })
```

**Response**:

```json
{
  "threads": [
    {
      "id": "abc123def456",
      "resolved": false,
      "author": "john.doe",
      "body": "This function is too complex",
      "file": "src/components/Form.tsx",
      "line": 42,
      "createdAt": "2024-02-06T08:30:00Z"
    },
    {
      "id": "xyz789ghi012",
      "resolved": true,
      "author": "jane.smith",
      "body": "Missing error handling",
      "file": "src/api/client.ts",
      "line": 15,
      "createdAt": "2024-02-05T14:20:00Z"
    }
  ]
}
```

**Use Case**: Fetch existing threads for followup reviews to check what needs attention.

**Note**: Threads are loaded from the review context file created by `claudeInvoker.ts` at job start.

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

**Example Calls**:

```
// Resolve a thread
add_action({ jobId: "gitlab:...", type: "THREAD_RESOLVE", threadId: "abc123" })

// Reply to a thread
add_action({
  jobId: "gitlab:...",
  type: "THREAD_REPLY",
  threadId: "abc123",
  message: "Fixed in commit def456"
})

// Post a comment
add_action({
  jobId: "gitlab:...",
  type: "POST_COMMENT",
  body: "## Review Complete\n\nAll issues addressed."
})
```

**Response**:

```json
{
  "success": true,
  "action": {
    "type": "THREAD_REPLY",
    "threadId": "abc123",
    "message": "Fixed in commit def456"
  },
  "queuePosition": 3
}
```

**Behavior**:
- Actions are queued in the review context file
- Executed after review completion by `claudeInvoker.ts`
- Order is preserved

**Equivalent Text Markers**:
- `[THREAD_RESOLVE:abc123]`
- `[THREAD_REPLY:abc123:Fixed in commit def456]`
- `[POST_COMMENT:## Review Complete\n\nAll issues addressed.]`

---

## Comparison: MCP Tools vs Text Markers

| Aspect | MCP Tools | Text Markers |
|--------|-----------|--------------|
| **Communication** | Structured JSON | Text parsing |
| **Feedback** | Immediate response | After CLI completion |
| **Error handling** | Explicit errors | Silent failures |
| **Dashboard updates** | Real-time via WebSocket | Polled from output |
| **Complexity** | Requires MCP setup | Works out of the box |

**When to use MCP Tools**:
- Need real-time progress updates
- Want structured error feedback
- Building advanced workflows

**When to use Text Markers**:
- Simpler setup
- Works with any Claude invocation mode
- Backward compatibility

---

## Debugging

### View MCP Logs

```bash
tail -f ~/.claude-review/logs/mcp-server.log
```

### Test MCP Tools Manually

```bash
# Clear logs
> ~/.claude-review/logs/mcp-server.log

# Test via Claude
claude --print --dangerously-skip-permissions -p "Call get_workflow with jobId 'test-123'"

# Check logs
cat ~/.claude-review/logs/mcp-server.log
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No logs created | Server not started | Ensure `--print` mode actually calls a tool |
| "Workflow not found" | Missing job context | Check `MCP_JOB_ID` env var |
| Tools listed but not callable | MCP server not launched | Call a tool, not just list them |

---

## Integration with Skills

To use MCP tools in a skill, call them like any other tool:

```markdown
## Workflow Example

1. Get current state:
   Call `get_workflow` with the job ID

2. Start each audit:
   Call `start_agent` before analyzing

3. Complete each audit:
   Call `complete_agent` with success/failed status

4. Set phase transitions:
   Call `set_phase` at each major step

5. Queue thread actions:
   Call `add_action` for replies/resolves
```

**Note**: The skill must be running in a context where MCP servers are loaded. This requires Claude to actually invoke the tools, not just reference them.
