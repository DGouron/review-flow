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

Reply to an existing discussion thread.

| Parameter | Type | Description |
|-----------|------|-------------|
| `threadId` | string | Platform-specific thread/discussion ID |
| `message` | string | Reply content (markdown supported) |

**Examples**:

```
[THREAD_REPLY:abc123def:✅ **Fixed** - Added proper error handling]
[THREAD_REPLY:PRRT_kwDO123:Thanks for the feedback, addressed in commit abc123]
```

**Message with colons**: The message is everything after the second `:`, so colons in the message are preserved:

```
[THREAD_REPLY:abc123:Note: this is important]
→ threadId: "abc123"
→ message: "Note: this is important"
```

**Platform Execution**:

| Platform | Command |
|----------|---------|
| GitLab | `glab api --method POST "projects/{path}/merge_requests/{mr}/discussions/{threadId}/notes" --field body='{message}'` |
| GitHub | `gh api --method POST "repos/{owner}/{repo}/pulls/{pr}/comments/{threadId}/replies" --field body='{message}'` |

---

### `[THREAD_RESOLVE:threadId]`

Resolve/close a discussion thread.

| Parameter | Type | Description |
|-----------|------|-------------|
| `threadId` | string | Platform-specific thread/discussion ID |

**Examples**:

```
[THREAD_RESOLVE:abc123def456]
[THREAD_RESOLVE:PRRT_kwDOAbc123XYZ]
```

**Platform Execution**:

| Platform | Command |
|----------|---------|
| GitLab | `glab api --method PUT "projects/{path}/merge_requests/{mr}/discussions/{threadId}" --field resolved=true` |
| GitHub | `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{threadId}"}) { thread { id isResolved } } }'` |

---

### `[POST_COMMENT:message]`

Post a top-level comment on the MR/PR.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | string | Comment content (markdown supported) |

**Examples**:

```
[POST_COMMENT:## Review Complete\n\nAll issues have been addressed.]
[POST_COMMENT:🎉 Great work! Ready to merge.]
```

**Newlines**: Use `\n` for newlines in the message:

```
[POST_COMMENT:## Summary\n\n- Item 1\n- Item 2]
```

Becomes:

```markdown
## Summary

- Item 1
- Item 2
```

**Platform Execution**:

| Platform | Command |
|----------|---------|
| GitLab | `glab api --method POST "projects/{path}/merge_requests/{mr}/notes" --field body='{message}'` |
| GitHub | `gh api --method POST "repos/{owner}/{repo}/issues/{pr}/comments" --field body='{message}'` |

---

### `[FETCH_THREADS]`

Request a thread synchronization from the platform.

**Example**:

```
[FETCH_THREADS]
```

**Behavior**:
- Currently a no-op (placeholder for future implementation)
- Reserved for syncing thread state before processing

---

## Thread ID Formats

### GitLab Thread IDs

GitLab uses discussion IDs from the Discussions API:

```bash
glab api "projects/GROUP%2FPROJECT/merge_requests/123/discussions"
```

Response contains `id` field for each discussion:

```json
[
  {
    "id": "abc123def456789",
    "notes": [...]
  }
]
```

### GitHub Thread IDs

GitHub uses GraphQL node IDs for review threads:

```bash
gh api graphql -f query='
query {
  repository(owner: "owner", name: "repo") {
    pullRequest(number: 123) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body }
          }
        }
      }
    }
  }
}'
```

Response contains `id` field (starts with `PRRT_`):

```json
{
  "data": {
    "repository": {
      "pullRequest": {
        "reviewThreads": {
          "nodes": [
            { "id": "PRRT_kwDOAbc123XYZ", "isResolved": false }
          ]
        }
      }
    }
  }
}
```

---

## Execution Order

Thread action markers are executed **in order of appearance** in the output:

```
[THREAD_REPLY:abc:Message 1]    # Executed 1st
[THREAD_RESOLVE:abc]            # Executed 2nd
[THREAD_REPLY:def:Message 2]    # Executed 3rd
```

This allows patterns like "reply then resolve":

```
[THREAD_REPLY:abc123:✅ Fixed in commit def456]
[THREAD_RESOLVE:abc123]
```

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| Invalid thread ID | API returns 404, logged, continues to next action |
| Network timeout | Logged, continues to next action |
| Authentication failure | Logged, continues to next action |
| Malformed marker | Ignored (not parsed) |

**Important**: Errors do not stop subsequent actions. The review is not marked as failed due to thread action errors.

---

## Malformed Markers

These markers are **ignored** (not parsed):

```
[THREAD_REPLY]                    # Missing parameters
[THREAD_RESOLVE]                  # Missing threadId
[THREAD_REPLY:abc]                # Missing message
[UNKNOWN_ACTION:abc:message]      # Unknown marker type
```

---

## Best Practices

1. **Always include REVIEW_STATS**: Required for metrics tracking
2. **Use descriptive messages**: Thread replies should explain what was fixed
3. **Reply before resolving**: Post a summary before closing threads
4. **Handle special characters**: Use `\n` for newlines in messages
5. **Test markers locally**: Run your skill and grep for `\[` to verify markers
