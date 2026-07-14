# review-advanced

A rigorous, sequential-audit code review skill with a dedicated security block and mandatory cited pedagogical lessons.

## Overview

This template provides:
- 8 sequential audits ending in a Naming audit that is **never counted** in the overall score
- A dedicated Security audit that is scored **and blocking**
- Every point raised must cite a real, recognized author (quote + explanation + practical application) — no unsourced opinions
- Sequential execution to prevent memory issues, same protocol as `review-with-agents`

## Installation

1. Copy this folder to your project:
   ```bash
   cp -r templates/en/review-advanced .claude/skills/my-review
   ```

2. Rename the skill in `SKILL.md` frontmatter

3. Fill in the **Stack Best Practices** audit (Audit 3) with the idiomatic rules for your own framework/language — it ships as a placeholder on purpose

4. Fill in the **Pareto Bug Prevention** audit (Audit 7) with the defect categories that actually recur in your codebase

5. Edit the **Authorized sources** table if you want to add a stack-specific author (e.g. your framework's official docs team)

6. Configure agents in `.claude/reviews/config.json`:
   ```json
   {
     "reviewSkill": "my-review",
     "agents": [
       { "name": "clean-architecture", "displayName": "Clean Architecture" },
       { "name": "ddd", "displayName": "DDD" },
       { "name": "stack-best-practices", "displayName": "Stack Best Practices" },
       { "name": "solid", "displayName": "SOLID" },
       { "name": "testing", "displayName": "Testing" },
       { "name": "code-quality", "displayName": "Code Quality" },
       { "name": "pareto-bug-prevention", "displayName": "Pareto Bug Prevention" },
       { "name": "naming-audit", "displayName": "Naming" },
       { "name": "security", "displayName": "Security" }
     ]
   }
   ```

## Why Naming Is Excluded From the Score

Naming feedback is judged useful but subjective and non-blocking. Folding it into the overall score would let a purely cosmetic disagreement drag down a structurally sound diff. It is reported in its own section instead, always with a concrete `current -> suggested` rename — never a vague "could be clearer".

## Why Security Is Blocking

Unlike the other audits, an unresolved Security finding blocks merge regardless of the overall score. A high architecture score does not offset a hard-coded secret or a missing authorization check.

## The Citation Requirement

Every blocking issue, warning, or suggestion must include a **Pedagogical Lesson**: a real quote from a recognized author, an explanation of how it applies, and a practical fix. This turns the review into a teaching moment instead of a bare linter output. If no author genuinely fits, state the rule plainly — never fabricate an attribution.

## Markers Used

| Marker | Purpose |
|--------|---------|
| `[PHASE:...]` | Track review phase |
| `[PROGRESS:audit:started/completed]` | Track each of the 9 audits |
| `[POST_COMMENT:...]` | Post final report |
| `[REVIEW_STATS:...]` | Report statistics (score excludes the Naming audit) |

## See Also

- [review-with-agents](../review-with-agents/) — Lighter multi-agent template without the citation format or dedicated security block
- [followup-advanced](../followup-advanced/) — Matching follow-up template that never trusts a commit message
- [Review Skills Guide](../../../docs/guide/review-skills.md)
