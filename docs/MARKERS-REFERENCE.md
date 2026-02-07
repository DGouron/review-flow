---
title: Markers Reference
scope: reference
related:
  - src/interface-adapters/presenters/
  - docs/MCP-TOOLS-REFERENCE.md
last-updated: 2026-02-07
---

# Markers Reference

Complete reference for all markers recognized by claude-review-automation.

## Overview

Markers are special tags in skill output that communicate with the automation server. They are parsed after Claude CLI completion and trigger various actions.

**General Format**: `[MARKER_TYPE:param1:param2:...]`

## Progress Markers

### `[PROGRESS:agent:status]`

Track individual agent progress for real-time dashboard updates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent` | string | Agent name (kebab-case, e.g., `clean-architecture`) |
| `status` | enum | One of: `started`, `completed`, `failed` |
| `error` | string | (Optional) Error message when status is `failed` |

**Examples**:

```
[PROGRESS:security:started]
[PROGRESS:security:completed]
[PROGRESS:security:failed:Connection timeout]
```

**Behavior**:
- Unknown agents are dynamically added to the dashboard
- Agent names are converted to Title Case for display
- Progress percentage is calculated based on completed/total agents

**Dashboard Display**:

```
┌────────────────────────────────────┐
│ Security        [████████░░] 80%   │
│ Architecture    [██████████] 100%  │
│ Testing         [░░░░░░░░░░] 0%    │
└────────────────────────────────────┘
```

---

## Phase Markers

### `[PHASE:phase-name]`

Indicate the current review phase.

| Parameter | Type | Description |
|-----------|------|-------------|
| `phase-name` | enum | Current phase identifier |

**Valid Phases**:

| Phase | Description |
|-------|-------------|
| `initializing` | Review setup (loading config, fetching MR data) |
| `agents-running` | Individual agents analyzing code |
| `synthesizing` | Combining agent results into final report |
| `publishing` | Posting results to platform |
| `completed` | Review finished |

**Examples**:

```
[PHASE:initializing]
[PHASE:agents-running]
[PHASE:synthesizing]
[PHASE:publishing]
[PHASE:completed]
```

**Behavior**:
- Phase changes are broadcast via WebSocket to connected dashboards
- Duplicate phase markers are ignored (no event emitted)

---

## Statistics Markers

### `[REVIEW_STATS:blocking=N:warnings=N:suggestions=N:score=N]`

Report review statistics for metrics and tracking.

| Parameter | Type | Description |
|-----------|------|-------------|
| `blocking` | integer | Number of blocking issues (must fix) |
| `warnings` | integer | Number of warnings (should fix) |
| `suggestions` | integer | Number of suggestions (nice to have) |
| `score` | float | Overall score out of 10 (e.g., `7.5`) |

**Example**:

```
[REVIEW_STATS:blocking=2:warnings=5:suggestions=3:score=7.5]
```

**Behavior**:
- Stats are saved to `.claude/reviews/stats.json`
- Used for project-level metrics and trends
- Only one REVIEW_STATS marker is processed per review

**Alternative Format (Fallback)**:

If no `[REVIEW_STATS:...]` marker is found, the parser falls back to French summary format:

```
📊 Score global : 7.5/10
🚨 Bloquants : 2
⚠️ Importants : 5
📝 Améliorations : 3
```

Or inline emoji markers (counted):

```
🚨 [BLOQUANT] Issue description
⚠️ [IMPORTANT] Warning description
💡 [SUGGESTION] Suggestion description
```

---

## Thread Action Markers

These markers trigger platform API calls after review completion.

> **MCP equivalent**: These actions can also be performed via MCP tools using `add_action`. See [MCP-TOOLS-REFERENCE.md](./MCP-TOOLS-REFERENCE.md) for the structured alternative.

### `[THREAD_REPLY:threadId:message]`

Reply to an existing discussion thread. The message is everything after the second `:`, so colons in the message are preserved.

```
[THREAD_REPLY:abc123:Fixed - Added proper error handling]
```

### `[THREAD_RESOLVE:threadId]`

Resolve/close a discussion thread.

```
[THREAD_RESOLVE:abc123def456]
```

### `[POST_COMMENT:message]`

Post a top-level comment on the MR/PR. Use `\n` for newlines.

```
[POST_COMMENT:## Review Complete\n\nAll issues addressed.]
```

### `[FETCH_THREADS]`

Reserved for syncing thread state (currently a no-op).

### Platform Execution

| Marker | GitLab | GitHub |
|--------|--------|--------|
| `THREAD_REPLY` | `glab api POST .../discussions/{id}/notes` | `gh api POST .../comments/{id}/replies` |
| `THREAD_RESOLVE` | `glab api PUT .../discussions/{id} resolved=true` | `gh api graphql resolveReviewThread` |
| `POST_COMMENT` | `glab api POST .../notes` | `gh api POST .../issues/{pr}/comments` |

**Behavior**:
- Currently a no-op (placeholder for future implementation)
- Reserved for syncing thread state before processing

---

## Thread ID Formats

| Platform | Source | ID Format | CLI to fetch |
|----------|--------|-----------|-------------|
| GitLab | Discussions API | `abc123def456789` | `glab api "projects/GROUP%2FPROJECT/merge_requests/123/discussions"` |
| GitHub | GraphQL node IDs | `PRRT_kwDOAbc123XYZ` | `gh api graphql` with `reviewThreads` query |

---

## Execution Order

Thread action markers are executed **in order of appearance**. Common pattern: reply then resolve.

```
[THREAD_REPLY:abc123:Fixed in commit def456]
[THREAD_RESOLVE:abc123]
```

## Error Handling

Errors (invalid thread ID, network timeout, auth failure) are logged but do not stop subsequent actions. Malformed markers (missing parameters, unknown types) are silently ignored.

---

## Best Practices

1. **Always include REVIEW_STATS**: Required for metrics tracking
2. **Use descriptive messages**: Thread replies should explain what was fixed
3. **Reply before resolving**: Post a summary before closing threads
4. **Handle special characters**: Use `\n` for newlines in messages
5. **Test markers locally**: Run your skill and grep for `\[` to verify markers
