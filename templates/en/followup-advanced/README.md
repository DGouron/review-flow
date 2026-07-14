# followup-advanced

A follow-up review skill that never trusts a commit message — it always re-reads the actual code before resolving a thread. Matching counterpart to `review-advanced`.

## Overview

This template provides:
- The same context-file protocol as `followup-basic`
- A hard rule: a commit message is a claim, never evidence — every thread is verified against the current code at its file:line
- New issues found during follow-up cite a real source, same format as `review-advanced`

## Installation

1. Copy this folder to your project:
   ```bash
   cp -r templates/en/followup-advanced .claude/skills/my-followup
   ```

2. Rename the skill in `SKILL.md` frontmatter

3. Configure it as the follow-up skill in `.claude/reviews/config.json`:
   ```json
   {
     "reviewSkill": "my-review",
     "reviewFollowupSkill": "my-followup"
   }
   ```

## Why It Never Trusts the Commit Message

A commit message ("fix: null check added") is an author's claim, not proof the code changed as described. Messages can be wrong, incomplete, or copy-pasted from an unrelated commit. This template mandates re-reading the current code at the exact file:line of every previous thread before marking it resolved. If the code can't be read for a thread, the thread stays open — resolving on assumption is never allowed.

## Matching review-advanced

Use this template alongside [review-advanced](../review-advanced/) if you want the initial review and its follow-up to share the same citation requirement for any new issue raised.

## Markers Used

| Marker | Purpose |
|--------|---------|
| `[PHASE:...]` | Track review phase |
| `[PROGRESS:...:started/completed]` | Track context, verification, scan, threads, report |
| `[THREAD_REPLY:...]` / `[THREAD_RESOLVE:...]` | Thread management (or via context-file actions) |
| `[POST_COMMENT:...]` | Post final report |
| `[REVIEW_STATS:...]` | Report statistics |

## See Also

- [review-advanced](../review-advanced/) — Matching initial review template with the same citation format
- [followup-basic](../followup-basic/) — Lighter follow-up template without the code-verification rule
- [Review Skills Guide](../../../docs/guide/review-skills.md)
