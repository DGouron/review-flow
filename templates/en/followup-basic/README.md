# followup-basic

A follow-up review skill template for verifying fixes.

## Overview

This template is designed for second-pass reviews to verify that blocking issues from the initial review have been addressed. It uses standardized markers for thread management.

## Key Features

- Verify each blocking issue from the initial review
- Reply to threads with fix status
- Automatically resolve fixed threads
- Generate a concise follow-up report

## Installation

1. Copy this folder to your project:
   ```bash
   cp -r templates/en/followup-basic .claude/skills/my-followup
   ```

2. Rename the skill in `SKILL.md` frontmatter

3. Configure in `.claude/reviews/config.json`:
   ```json
   {
     "reviewSkill": "my-review",
     "reviewFollowupSkill": "my-followup"
   }
   ```

## Thread Management Markers

This template uses standardized markers instead of direct API calls:

| Marker | Action |
|--------|--------|
| `[THREAD_REPLY:id:message]` | Reply to a thread |
| `[THREAD_RESOLVE:id]` | Resolve/close a thread |

The server translates these to appropriate platform API calls.

## Workflow

1. **Context**: Fetch previous review comments
2. **Verify**: Check each blocking issue
3. **Scan**: Look for new issues
4. **Threads**: Reply and resolve fixed threads
5. **Report**: Generate summary
6. **Publish**: Post report

## Example Output

```
[THREAD_REPLY:abc123:✅ **Fixed** - Added proper error handling]
[THREAD_RESOLVE:abc123]
[THREAD_REPLY:def456:❌ **Not fixed** - SQL injection still present]
[POST_COMMENT:## Follow-up Review\n\nFixed: 1/2 blocking issues]
[REVIEW_STATS:blocking=1:warnings=0:suggestions=0:score=5]
```

## See Also

- [review-basic](../review-basic/) - Initial review template
- [MARKERS-REFERENCE.md](../../../docs/MARKERS-REFERENCE.md) - Thread markers
