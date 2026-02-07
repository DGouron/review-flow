# Review Skills Guide

This guide explains how to create custom code review skills for claude-review-automation.

## Overview

### What are Review Skills?

Review skills are Claude Code skills (SKILL.md files) that define how automated code reviews should be performed. They contain:

- **Persona definition**: Who the reviewer is and their approach
- **Review criteria**: What to check for in the code
- **Output format**: How to structure the review report
- **Markers**: Special tags that trigger platform actions

### How Does claude-review-automation Work?

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ GitLab/GitHub   │───▶│ Review Automation │───▶│  Claude Code    │
│ Webhook         │    │ Server            │    │  + Your Skill   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                      │                       │
        │ 1. MR/PR event       │ 2. Queue job          │ 3. Run skill
        │    (review_requested)│    & invoke Claude    │    against MR
        │                      │                       │
        ▼                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                         4. Post-processing                       │
│  • Parse [REVIEW_STATS:...] for metrics                         │
│  • Parse [THREAD_RESOLVE:...] for platform actions              │
│  • Execute glab/gh commands                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Minimal Skill Example

Create a file at `.claude/skills/my-review/SKILL.md`:

```markdown
---
name: my-review
description: My project's code review skill
---

# Code Review

Review the merge request for code quality issues.

## Instructions

1. Read the changed files
2. Check for obvious bugs, security issues, and code smells
3. Output a summary with blocking issues and suggestions

## Output Format

# Review Report

## Summary
[One sentence assessment]

## Blocking Issues
- Issue 1
- Issue 2

## Suggestions
- Suggestion 1

[REVIEW_STATS:blocking=X:warnings=Y:suggestions=Z:score=N]
```

### Required config.json Fields

Create `.claude/reviews/config.json` in your project:

```json
{
  "github": true,
  "gitlab": false,
  "defaultModel": "sonnet",
  "reviewSkill": "my-review"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `github` | boolean | Enable GitHub integration |
| `gitlab` | boolean | Enable GitLab integration |
| `defaultModel` | `"sonnet"` \| `"opus"` | Claude model to use |
| `reviewSkill` | string | Skill name for initial reviews |
| `reviewFollowupSkill` | string | (Optional) Skill for follow-up reviews |

### Your First Review

1. Create the skill file as shown above
2. Create the config.json
3. Assign a reviewer to your MR/PR that matches your webhook configuration
4. The review will run automatically and post results

## Markers Reference

Skills communicate with the automation server through markers (`[MARKER_TYPE:params]`) in their output. The most important marker is `[REVIEW_STATS:blocking=N:warnings=N:suggestions=N:score=N]` which is required for metrics tracking.

For full marker syntax, parameters, and platform commands, see [MARKERS-REFERENCE.md](./MARKERS-REFERENCE.md). For the MCP tool equivalent, see [MCP-TOOLS-REFERENCE.md](./MCP-TOOLS-REFERENCE.md).

## Skill Structure

### SKILL.md Anatomy

```markdown
---
name: skill-name          # Unique identifier (kebab-case)
description: Brief desc   # Shown in Claude Code skill list
---

# Skill Title

## Context
Define the reviewer persona and approach.

## Instructions
Step-by-step review process.

## Output Format
Expected output structure with markers.

## Examples
Sample outputs for reference.
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique skill identifier (kebab-case) |
| `description` | Yes | Brief description for skill list |

### Best Practices

1. **Be specific**: Define clear review criteria for your project
2. **Use markers**: Always include `[REVIEW_STATS:...]` for metrics
3. **Structure output**: Use consistent markdown headings
4. **Provide examples**: Include sample outputs in your skill

## Platform-Specific Commands

The server automatically translates markers to platform API calls (GitLab `glab` / GitHub `gh`). See [MARKERS-REFERENCE.md](./MARKERS-REFERENCE.md) for the full command mapping and thread ID format per platform.

## Advanced Topics

### Custom Agents for Progress Tracking

Define custom agents in your config.json:

```json
{
  "agents": [
    { "name": "architecture", "displayName": "Architecture" },
    { "name": "security", "displayName": "Security" },
    { "name": "testing", "displayName": "Testing" }
  ]
}
```

Your skill should emit matching progress markers:

```
[PROGRESS:architecture:started]
... analysis ...
[PROGRESS:architecture:completed]
```

### Error Handling

- Thread action failures are logged but don't block subsequent actions
- Invalid thread IDs result in 404 errors (logged, not fatal)
- Always check server logs for action execution results

### Testing Your Skill Locally

1. Run Claude Code manually:
   ```bash
   cd /path/to/your/repo
   claude -p "/my-review 123"
   ```

2. Check the output for:
   - Correct markdown structure
   - Valid markers
   - Expected statistics

3. Verify markers are parsed:
   - `[REVIEW_STATS:...]` appears in output
   - Thread markers have valid IDs

## Troubleshooting

### Common Errors

| Issue | Cause | Solution |
|-------|-------|----------|
| Review not triggered | Webhook not received | Check webhook configuration |
| No stats recorded | Missing REVIEW_STATS marker | Add marker to skill output |
| Thread not resolved | Invalid thread ID | Fetch correct ID from platform API |
| Progress stuck | Missing PROGRESS markers | Add progress tracking to skill |

### Debugging Tips

1. **Check server logs**: Review automation logs show all parsed markers
2. **Verify skill invocation**: Check Claude Code output manually
3. **Test markers locally**: Run skill and grep for `[MARKER:]` patterns
4. **Dashboard monitoring**: Watch real-time progress on the web dashboard

### Log Locations

- Server logs: stdout (piped to your log system)
- Review stats: `.claude/reviews/stats.json`
- MR tracking: `.claude/reviews/tracking.json`

---

## See Also

- [MARKERS-REFERENCE.md](./MARKERS-REFERENCE.md) - Complete markers reference
- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Configuration options
- [examples/skills/](../examples/skills/) - Example skills
