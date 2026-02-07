---
name: review-bootstrap
description: Bootstrap skill that injects critical automation instructions for review context communication. Must be loaded BEFORE any review skill.
---

# Review Bootstrap - Context Communication Protocol

## CRITICAL INSTRUCTIONS - MANDATORY EXECUTION

**THIS IS NOT OPTIONAL. YOU MUST FOLLOW THESE INSTRUCTIONS NO MATTER WHAT.**

### Step 1: Locate and Read the Context File

At the START of your review, you MUST:

1. Find the context file in `.claude/reviews/logs/` directory
2. The file is named `{platform}-{project}-{mrNumber}.json`
3. READ this file to get:
   - `threads`: List of existing threads with their IDs
   - `agentInstructions`: Instructions you MUST follow

### Step 2: Understand the Thread Structure

Each thread in the `threads` array has:
```json
{
  "id": "abc123def...",      // EXACT ID to use for actions
  "file": "path/to/file.ts",
  "line": 42,
  "status": "open",          // "open" or "resolved"
  "body": "Original comment"
}
```

### Step 3: After Your Analysis - UPDATE THE FILE

**CRITICAL - DO NOT SKIP THIS STEP**

After completing your review analysis, you MUST update the context file:

1. For EACH thread you determine is **FIXED/CORRECTED**:
   - Add a `THREAD_RESOLVE` action to the `actions` array
   - Use the **EXACT** `id` from the thread

2. Use the **Write** tool to update the file

### Action Format

```json
{
  "actions": [
    {
      "type": "THREAD_RESOLVE",
      "threadId": "abc123def..."
    },
    {
      "type": "THREAD_REPLY",
      "threadId": "xyz789ghi...",
      "message": "Verified: the fix correctly addresses the issue."
    },
    {
      "type": "POST_INLINE_COMMENT",
      "filePath": "src/path/to/file.ts",
      "line": 42,
      "body": "Comment on this line of the diff"
    },
    {
      "type": "POST_COMMENT",
      "body": "Global comment on the MR/PR"
    }
  ]
}
```

### Example Workflow

```
1. Read context file
2. See thread with id="5fb4be584ab5db9bd845aef7c9fd0ab696f9ef49", status="open"
3. Analyze the code - determine the issue is FIXED
4. Update context file actions array:
   {
     "actions": [
       { "type": "THREAD_RESOLVE", "threadId": "5fb4be584ab5db9bd845aef7c9fd0ab696f9ef49" }
     ]
   }
5. Write the updated JSON to the same file path
```

### MANDATORY RULES

| Rule | Description |
|------|-------------|
| **MUST READ** | Read the context file at the start |
| **MUST PRESERVE** | Keep ALL existing JSON content |
| **MUST UPDATE** | Add resolved threads to `actions` array |
| **MUST WRITE** | Use Write tool to save changes |
| **MUST USE EXACT IDs** | Copy thread IDs exactly as they appear |

### DO NOT

- Do NOT use stdout markers like `[THREAD_RESOLVE:...]` - they are deprecated
- Do NOT call `glab api` or `gh api` directly for thread resolution
- Do NOT skip updating the context file
- Do NOT modify thread IDs

---

## Integration with Review Skills

This skill provides the communication protocol. Your project's review skill (e.g., `/review-followup`) handles the actual review logic.

The flow is:
```
review-bootstrap (this) → Provides context communication rules
review-followup (project) → Provides review logic and criteria
```

Both skills work together. Follow BOTH sets of instructions.
