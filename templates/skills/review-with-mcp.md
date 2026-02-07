# Review Skill Template with MCP Progress Tracking

This template shows how to build a review skill that reports progress via MCP tools.

## How It Works

The MCP server automatically receives the job context via environment variables set by the review system:
- `MCP_JOB_ID` - The unique job identifier (e.g., `gitlab:owner/repo:123`)
- `MCP_LOCAL_PATH` - Path to the local repository
- `MCP_MERGE_REQUEST_ID` - The MR/PR identifier
- `MCP_JOB_TYPE` - Either `review` or `followup`

**Your skill just needs to use the jobId in all MCP tool calls.** The system handles the rest.

## MCP Tools Available

When the MCP server is configured, you have access to these tools:

| Tool | Purpose | Required Args |
|------|---------|---------------|
| `get_workflow` | Get workflow state and agent list | jobId |
| `start_agent` | Signal agent start | jobId, agentName |
| `complete_agent` | Signal agent completion | jobId, agentName, status |
| `set_phase` | Update review phase | jobId, phase |
| `get_threads` | Get MR/PR discussion threads | jobId |
| `add_action` | Queue an action (resolve, comment) | jobId, type, ... |

## Workflow Pattern

```
1. Call get_workflow(jobId) to get the list of agents
2. Call set_phase(jobId, "agents-running")
3. For each agent in order:
   a. Call start_agent(jobId, agentName)
   b. Execute your analysis
   c. Call complete_agent(jobId, agentName, "success" or "failed")
4. Call set_phase(jobId, "synthesizing")
5. Compile your report
6. Call get_threads(jobId) to see existing discussions
7. Call add_action() for each thread to resolve or comment
8. Call set_phase(jobId, "completed")
```

## Example Skill Implementation

```markdown
# My Review Skill

## Activation
Triggered by: `/my-review <MR_NUMBER>`

## Workflow

### Step 1: Initialize
First, get the workflow to know which agents to run:
- Call `get_workflow` with the jobId
- Note the list of agents and their order

### Step 2: Run Agents Sequentially
For EACH agent in the workflow:

1. Call `start_agent(jobId, agentName)` BEFORE starting
2. Perform your analysis for that agent
3. Call `complete_agent(jobId, agentName, "success")` when done
   - Use "failed" with error message if analysis fails

### Step 3: Handle Threads
After all agents complete:
1. Call `get_threads(jobId)` to see open discussions
2. For each thread that should be resolved:
   - Call `add_action(jobId, "THREAD_RESOLVE", threadId)`
3. To add a review comment:
   - Call `add_action(jobId, "POST_COMMENT", body="Your comment")`

### Step 4: Finalize
Call `set_phase(jobId, "completed")` when done.
```

## Phases

| Phase | When to use |
|-------|-------------|
| `initializing` | Before starting agents |
| `agents-running` | During agent execution |
| `synthesizing` | Compiling final report |
| `publishing` | Posting to GitLab/GitHub |
| `completed` | All done |

## Action Types

### THREAD_RESOLVE
Marks a discussion thread as resolved.
```json
{
  "type": "THREAD_RESOLVE",
  "threadId": "abc123",
  "message": "Optional resolution message"
}
```

### THREAD_REPLY
Replies to a discussion thread.
```json
{
  "type": "THREAD_REPLY",
  "threadId": "abc123",
  "message": "Your reply message"
}
```

### POST_COMMENT
Posts a general comment on the MR/PR.
```json
{
  "type": "POST_COMMENT",
  "body": "Your review comment"
}
```

## Error Handling

If an agent fails:
1. Call `complete_agent(jobId, agentName, "failed", "Error description")`
2. Continue with the next agent (don't stop the whole review)
3. Include failed agents in your final report

## Best Practices

1. **Always call start_agent before analysis** - The dashboard shows real-time progress
2. **Complete agents even on failure** - Use status="failed" with error message
3. **Process agents sequentially** - Parallel execution can cause memory issues
4. **Use get_threads to check context** - Understand existing discussions before acting
5. **Batch actions at the end** - Add all actions, they execute after review completes
