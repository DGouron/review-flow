# Implementation Report — SPEC-217 Add a followup-advanced template that never trusts commit messages

> Spec: `docs/specs/217-followup-advanced-template.md`
> Status: implemented · Date: 2026-07-14

## Status: Complete

## Summary

Added a new `followup-advanced` template (EN + FR) alongside the existing `followup-basic`. Built on the same context-file protocol as `followup-basic`, with the explicit hard rule already proven in `.claude/skills/review-followup/SKILL.md`: a commit message is never evidence a thread is fixed — only re-reading the current code at the thread's file:line is. New issues found during follow-up cite a real source, matching `review-advanced` (SPEC-216).

## Files created

| File | Description |
|------|--------------|
| `templates/en/followup-advanced/SKILL.md` | Context-file protocol + "Never Trust the Commit Message" hard rule + citation format for new issues |
| `templates/en/followup-advanced/README.md` | Installation, rationale for the code-verification rule |
| `templates/fr/followup-advanced/SKILL.md` | French variant, identical structure |
| `templates/fr/followup-advanced/README.md` | French variant |

No production code, no tests — pure template markdown content, as scoped.

## Spec coverage

| Scenario | Verification |
|----------|--------------|
| fixed by code, not message | "## The Hard Rule: Never Trust the Commit Message" + "a message claiming 'fixed' is a hint to look, not evidence" |
| fixed by code | THREAD_RESOLVE action gated on "only after re-reading the code confirms the fix" |
| unresolved unchanged | "Leave the thread open ... including when the commit message claims otherwise" |
| new point cited | "Pedagogical Lessons for New Issues (MANDATORY)" section, same quote/explanation/practical-application format as SPEC-216 |
| fr matches en | Same rule set, same section structure, French headers ("La Règle Dure : Jamais Confiance au Message de Commit") |

## Notes

- Reused the existing context-file protocol (`.claude/reviews/logs/{mrId}.json`, `THREAD_RESOLVE`/`THREAD_REPLY`/`POST_COMMENT` actions) from `followup-basic` rather than introducing a new one, per the spec's rule to match the existing convention.
- `yarn verify` run to confirm the markdown-only change doesn't break the build/lint/tests.
