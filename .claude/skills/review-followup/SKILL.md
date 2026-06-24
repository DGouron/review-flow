---
name: review-followup
description: Follow-up review to verify corrections on a MR. Sequential execution to avoid memory spikes. Checks blocking issues, detects new problems, and posts a concise report on GitLab.
---

# Follow-up Review

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Context

**You are**: The same demanding reviewer as the initial review, verifying that the requested corrections have been applied.

**Your approach**:
- **Correction verification**: Every blocking issue from the previous review must be verified
- **Regression detection**: Did the corrections introduce new problems?
- **Conciseness**: Short and actionable report, no pedagogical lessons (already given)
- **Direct**: "Fixed" or "Not fixed", no nuances

## Activation

This skill activates when the user asks for:
- "Verify the corrections", "Follow-up review", "/review-followup"
- "Are the blocking issues fixed?"
- "Second review", "Re-review"

---

## ⚡ Sequential Architecture (Anti Memory-Leak)

**CRITICAL**: To avoid memory explosion, steps are executed **ONE AT A TIME**.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEQUENTIAL EXECUTION                         │
│                                                                 │
│  [1] Context  →  [2] Verify  →  [3] Scan  →  [4] Threads  →... │
│                                                                 │
│  Each step:                                                     │
│  1. Calls start_agent(jobId, stepName)                          │
│  2. Executes the step                                           │
│  3. Calls complete_agent(jobId, stepName, status)               │
│  4. WAITS before launching the next one                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Available MCP Tools

The MCP server exposes these tools for progress tracking:

| Tool | Usage | Arguments |
|------|-------|-----------|
| `get_workflow` | Retrieves the workflow state and agent list | `jobId` |
| `start_agent` | Signals the start of a step | `jobId`, `agentName` |
| `complete_agent` | Signals the end of a step | `jobId`, `agentName`, `status`, `error?` |
| `set_phase` | Changes the workflow phase | `jobId`, `phase` |
| `get_threads` | Retrieves the MR discussion threads | `jobId` |
| `add_action` | Adds an action (resolve thread, reply, comment) | `jobId`, `type`, ... |

**The `jobId` is available via the `MCP_JOB_ID` environment variable.**

---

## ⚡ Progress via MCP (MANDATORY)

**To enable real-time tracking in the dashboard**, use MCP tools at each step:

**Phases** (only one active at a time):
```
set_phase(jobId, "initializing")   # At startup
set_phase(jobId, "agents-running") # During verifications
set_phase(jobId, "synthesizing")   # During synthesis
set_phase(jobId, "publishing")     # During GitLab publication
set_phase(jobId, "completed")      # At the end
```

**Steps** (one per step):
```
start_agent(jobId, "context")     # Context retrieval
complete_agent(jobId, "context", "success")
start_agent(jobId, "verify")      # Blocking issues verification
complete_agent(jobId, "verify", "success")
start_agent(jobId, "scan")        # Scan for new problems
complete_agent(jobId, "scan", "success")
start_agent(jobId, "threads")     # GitLab thread management
complete_agent(jobId, "threads", "success")
start_agent(jobId, "report")      # Report generation
complete_agent(jobId, "report", "success")
```

---

## Workflow

### Phase 1: Context Retrieval

**Call:**
- `set_phase(jobId, "initializing")`
- `start_agent(jobId, "context")`

1. **Identify the MR** from the provided URL or number
2. **Use `get_threads(jobId)`** to retrieve discussion threads
3. **Read previous comments** to identify:
   - Blocking issues (🚨)
   - Important issues (⚠️)
4. **Retrieve the current diff** to see the modifications

**Call:** `complete_agent(jobId, "context", "success")`

---

### Phase 2: Blocking Issues Verification

**Call:**
- `set_phase(jobId, "agents-running")`
- `start_agent(jobId, "verify")`

For EACH blocking issue identified:

| Status | Criterion |
|--------|-----------|
| ✅ FIXED | The code has been modified according to the requested correction |
| ⚠️ PARTIALLY | Fixed but with reservations or a different approach |
| ❌ NOT FIXED | The problem persists in the current code |

**Call:** `complete_agent(jobId, "verify", "success")`

---

### Phase 3: Quick Scan for New Problems

**Call:** `start_agent(jobId, "scan")`

Check only the **critical rules** from CLAUDE.md and **Clean Code red flags** (see `/.claude/skills/clean-code/SKILL.md`):

| Rule | What to check |
|------|---------------|
| Type `any` | No new `any` introduced |
| Type assertions | No new `as Type` or `as any` |
| Law of Demeter | No chaining `a.b.c.d` |
| Imports | `@/` aliases used |
| Tests | New business logic = new test |
| Function size (Clean Code) | No new function > 20 lines or with 4+ arguments |
| Flag arguments (Clean Code) | No new boolean parameter switching behavior |
| Naming (Clean Code) | No new abbreviation (`ctx`, `idx`, `gw`), intention-revealing identifiers |
| Comments (Clean Code) | No new comment rephrasing the code, no commented-out code |
| Magic numbers (Clean Code) | New literals (`> 7`, `* 86400`) extracted to named constants |

**Do not check** (out of scope for follow-up):
- Global architecture
- Strategic DDD
- Framework-specific performance
- Full SOLID
- Full Clean Code audit (only red flags above; for a complete pass, see `review-front`)

**Call:** `complete_agent(jobId, "scan", "success")`

---

### Phase 4: Thread Management via MCP

**Call:** `start_agent(jobId, "threads")`

#### ⚠️ CRITICAL - USE MCP TOOLS

**Threads are managed via MCP tools, no longer via JSON file.**

#### Step 1: Retrieve threads

Use the MCP tool to get the discussion threads:

```
get_threads(jobId)
```

Returns a list of threads with:
- `id`: Thread identifier
- `file`: Related file
- `line`: Comment line
- `status`: "open" or "resolved"
- `body`: Comment content

#### Step 2: Add actions for each fixed thread

For each **FIXED** issue, add actions via MCP:

**Resolve a thread:**
```
add_action(jobId, "THREAD_RESOLVE", threadId="xxx", message="✅ Fixed")
```

**Reply to a thread:**
```
add_action(jobId, "THREAD_REPLY", threadId="xxx", message="✅ Fixed - Short description")
```

**Post a general comment:**
```
add_action({ jobId: JOB_ID, type: "POST_COMMENT", body: "Report content" })
```

**Post an inline comment (new problem):**
```
add_action({ jobId: JOB_ID, type: "POST_INLINE_COMMENT", filePath: "path/file.ts", line: 42, body: "..." })
```

#### Usage Rules

| Action | When to use |
|--------|-------------|
| `THREAD_RESOLVE` | Blocking issue fixed → Resolve the thread |
| `THREAD_REPLY` | Need to clarify the fix before resolving |
| `POST_COMMENT` | Post the global follow-up report |
| `POST_INLINE_COMMENT` | New blocking problem detected → Inline comment on the diff |

**IMPORTANT**:
- ✅ Use MCP tools `get_threads` and `add_action`
- ✅ Actions are queued and executed after the review
- ❌ Do NOT use JSON files (deprecated legacy system)
- ❌ Do NOT call `glab api` or `gh api` directly

**Call:** `complete_agent(jobId, "threads", "success")`

---

### Phase 5: Report Generation

**Call:**
- `set_phase(jobId, "synthesizing")`
- `start_agent(jobId, "report")`

Follow-up report structure:

```markdown
# Follow-up Review - MR [Number]

**Date**: [YYYY-MM-DD]
**Previous review**: [Date of the first review]

---

## Blocking Issues Verification

| # | Issue | Status | Comment |
|---|-------|--------|---------|
| 1 | [Short description] | ✅/⚠️/❌ | [Note if needed] |
| 2 | ... | ... | ... |

---

## New Problems Detected

### [If problems found]

🚨 **[Title]**
📍 `file.ts:line`
[Short description + correction]

### [If no problems]

No new problems detected in the modifications.

---

## Final Verdict

| Criterion | Status |
|-----------|--------|
| Blocking issues fixed | X/Y |
| New blockers | X |
| **Ready to merge** | ✅ Yes / ❌ No |

### Required Actions (if not ready)

1. [Action 1]
2. [Action 2]
```

**Call:** `complete_agent(jobId, "report", "success")`

---

## Publication

**Call:** `set_phase(jobId, "publishing")`

### Order of Operations (STRICT)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Retrieve threads via get_threads(jobId)                     │
│  2. Verify each issue (fixed/not fixed)                         │
│  3. Add actions via add_action(jobId, ...)                      │
│  4. Post the global report on the MR                            │
│  5. Post inline comments for NEW problems only                  │
└─────────────────────────────────────────────────────────────────┘
```

1. **Manage existing threads** via MCP tools (see Phase 4 section)

2. **Save the MD** in `/.claude/reviews/[YYYY-MM-DD]-MR-[ID]-followup.md`

   Use the `Write` tool to persist the full follow-up report locally. The orchestrator reads this file to confirm the followup ran successfully — if it is missing, the job is reported as failed.

3. **Post the report on the MR**:
   ```
   add_action({ jobId: JOB_ID, type: "POST_COMMENT", body: "<report content>" })
   ```

4. **Inline comments** for new problems only (via `POST_INLINE_COMMENT`)

---

## Inline Comments for New Problems

**Post inline comments via MCP ONLY if**:
- A NEW blocking problem is detected → `POST_INLINE_COMMENT`

```
add_action({
  jobId: JOB_ID,
  type: "POST_INLINE_COMMENT",
  filePath: "path/to/file.ts",
  line: 42,
  body: "🚨 **[NEW] Problem title**\n\n📍 `file.ts:42`\n\n[Short description + correction]"
})
```

---

## Exit Commands

**Call:** `set_phase(jobId, "completed")`

At the end of the followup:

```
🔄 Follow-up Review - MR [ID]

📊 Blocking issues: X/Y fixed
✅ Threads resolved: X (via add_action MCP)
🆕 New problems: X

[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X:categories=security=N,logic=N,performance=N,typeSafety=N,style=N,dependencies=N]

✅ READY TO MERGE
or
❌ CORRECTIONS REQUIRED:
   - [Action 1]
   - [Action 2]
```

**⚠️ IMPORTANT**:
- The `[REVIEW_STATS:...]` line is **MANDATORY** for automated tracking.
- The "Threads resolved" count corresponds to the number of `add_action(jobId, "THREAD_RESOLVE", ...)` calls.
- **YOU MUST** use MCP tools to manage threads.

### Category breakdown (`categories=` segment)

Classify every finding still open or newly raised (blocking + important + suggestion) into exactly one of the six dashboard categories, then emit the count per category in the marker. The six counts must sum to `blocking + warnings + suggestions`. Map by the nature of the finding:

| Finding nature | Category |
|----------------|----------|
| Security / credential / auth issue | `security` |
| Business rule, architecture or SOLID violation | `logic` |
| Performance / inefficiency | `performance` |
| Type safety (`any`, unsafe assertion, weak typing) | `typeSafety` |
| Readability, naming, testing, code quality | `style` |
| Outdated / vulnerable / misused dependency | `dependencies` |

Use the internal keys exactly: `security`, `logic`, `performance`, `typeSafety`, `style`, `dependencies`. Set any unused key to `0`. Unknown keys are ignored by the tracker.

---

## Limited Read/Write Mode

This skill can:
- ✅ Read, analyze, compare code
- ✅ Post reports and comments on GitLab
- ✅ **Use MCP tools** for tracking and thread management
- ❌ Modify the project source code
