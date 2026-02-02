---
name: followup-basic
description: Follow-up review to verify fixes. Uses context file for thread management.
---

# Follow-up Review

**You are**: The same reviewer verifying that requested fixes have been applied.

**Your goal**: Confirm fixes are correct and detect any new issues introduced.

**Your approach**:
- Read thread context from the context file
- Verify each blocking issue from the previous review
- Mark threads as fixed or not fixed
- Write actions to the context file for automatic execution
- Short, actionable report

---

## Context File

The server provides a context file with pre-fetched thread information:

**Path**: `.claude/reviews/logs/{mrId}.json`

**Example**: `.claude/reviews/logs/github-owner-repo-42.json`

**Structure**:
```json
{
  "version": "1.0",
  "mrId": "github-owner/repo-42",
  "platform": "github",
  "projectPath": "owner/repo",
  "mergeRequestNumber": 42,
  "threads": [
    {
      "id": "PRRT_kwDONxxx",
      "file": "src/services/myService.ts",
      "line": 320,
      "status": "open",
      "body": "Missing null check before accessing user.email"
    }
  ],
  "actions": [],
  "progress": { "phase": "pending", "currentStep": null }
}
```

**At the start of your review**, read this file to get:
- Thread IDs you need to resolve
- File paths and line numbers for each thread
- The body/comment text describing the issue

---

## Writing Actions to Context File

Instead of (or in addition to) stdout markers, you can write actions directly to the context file. The server will execute them after your review completes.

**To resolve a thread**:
```json
{
  "actions": [
    {
      "type": "THREAD_RESOLVE",
      "threadId": "PRRT_kwDONxxx",
      "message": "Fixed - Added null check"
    }
  ]
}
```

**To post a comment**:
```json
{
  "actions": [
    {
      "type": "POST_COMMENT",
      "body": "## Follow-up Review\n\nAll issues fixed."
    }
  ]
}
```

**To add a label** (e.g., when all blocking issues are fixed):
```json
{
  "actions": [
    {
      "type": "ADD_LABEL",
      "label": "needs_approve"
    }
  ]
}
```

---

## Workflow

### Phase 1: Context

```
[PHASE:initializing]
[PROGRESS:context:started]
```

1. **Read the context file** at `.claude/reviews/logs/{mrId}.json`
2. Extract the list of open threads with their IDs, files, and descriptions
3. Fetch the current diff to see modifications

```
[PROGRESS:context:completed]
```

---

### Phase 2: Verification

```
[PHASE:agents-running]
[PROGRESS:verify:started]
```

For EACH thread from the context file:

| Status | Criteria |
|--------|----------|
| ✅ FIXED | Code was modified as requested |
| ⚠️ PARTIAL | Fixed but with reservations or different approach |
| ❌ NOT FIXED | Issue still present in current code |

```
[PROGRESS:verify:completed]
```

---

### Phase 3: New Issues Scan

```
[PROGRESS:scan:started]
```

Quick scan for new issues introduced by the fixes:
- Did the fix introduce new bugs?
- Any regressions?
- New code without tests?

```
[PROGRESS:scan:completed]
```

---

### Phase 4: Thread Management

```
[PROGRESS:threads:started]
```

#### For FIXED issues

Write a THREAD_RESOLVE action to the context file:

```json
{
  "type": "THREAD_RESOLVE",
  "threadId": "PRRT_kwDONxxx",
  "message": "✅ Fixed - Added null check before accessing user.email"
}
```

**Alternative**: Use stdout markers (backward compatible):
```
[THREAD_REPLY:PRRT_kwDONxxx:✅ **Fixed** - Added null check before accessing user.email]
[THREAD_RESOLVE:PRRT_kwDONxxx]
```

#### For NOT FIXED issues

Leave the thread open (no action needed). Optionally use stdout marker to reply:
```
[THREAD_REPLY:THREAD_ID:❌ **Not fixed** - [Brief explanation of what's still wrong]]
```

#### For PARTIAL fixes

Leave the thread open. Optionally reply:
```
[THREAD_REPLY:THREAD_ID:⚠️ **Partially fixed** - [What was done and what remains]]
```

```
[PROGRESS:threads:completed]
```

---

### Phase 5: Report

```
[PHASE:synthesizing]
[PROGRESS:report:started]
```

Generate follow-up summary:

```markdown
# Follow-up Review - MR/PR #[NUMBER]

## Previous Blocking Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | [Description] | ✅/⚠️/❌ | [Brief note] |
| 2 | [Description] | ✅/⚠️/❌ | [Brief note] |

## New Issues Detected

<!-- If any -->
🚨 **[Issue title]**
📍 `file.ts:42`
[Description and fix]

<!-- If none -->
No new issues detected.

## Verdict

| Criteria | Status |
|----------|--------|
| Blocking issues fixed | X/Y |
| New blocking issues | X |
| **Ready to merge** | ✅ Yes / ❌ No |

### Required Actions (if not ready)

1. [Action 1]
2. [Action 2]
```

```
[PROGRESS:report:completed]
```

---

### Phase 6: Publish

```
[PHASE:publishing]
```

Add a POST_COMMENT action to the context file:
```json
{
  "type": "POST_COMMENT",
  "body": "## Follow-up Review - MR/PR #[NUMBER]\n\n[Full report content]"
}
```

If all blocking issues are fixed (blocking=0), add a label:
```json
{
  "type": "ADD_LABEL",
  "label": "needs_approve"
}
```

**Alternative**: Use stdout marker (backward compatible):
```
[POST_COMMENT:## Follow-up Review - MR/PR #[NUMBER]\n\n[Full report content]]
```

```
[PHASE:completed]
```

---

## Output

At the end, emit the stats marker (REQUIRED):

```
[REVIEW_STATS:blocking=X:warnings=0:suggestions=0:score=X]
```

Where:
- `blocking` = number of issues still not fixed
- `score` = 10 if all fixed, lower based on remaining issues

---

## Summary

1. **Read** thread context from `.claude/reviews/logs/{mrId}.json`
2. **Verify** each thread's issue against the current code
3. **Write** THREAD_RESOLVE actions for fixed issues
4. **Write** POST_COMMENT action with your report
5. **Write** ADD_LABEL action if ready to merge
6. **Emit** REVIEW_STATS marker

The server automatically executes all actions after your review completes.

---

## Notes

- Thread IDs are pre-fetched in the context file - no need to query APIs
- Only resolve threads for issues that are **truly fixed**
- Leave threads open for partial fixes or unfixed issues
- The server executes actions from both context file AND stdout markers
- Stdout markers are still supported for backward compatibility
