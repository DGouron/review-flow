# Add a followup-advanced template that never trusts commit messages

## Context

`templates/{en,fr}/followup-basic` verifies fixes via a context file but doesn't encode the stricter rule already proven in `.claude/skills/review-followup`: never treat a commit message as evidence a point is fixed — always re-read the actual diff. Consumers who adopt `review-advanced` (216) have no matching follow-up template with the same rigor and citation format.

## Rules

- template ships as `templates/{en,fr}/followup-advanced/{SKILL.md,README.md}`
- the skill never treats a commit message as evidence a point is fixed; it always re-reads the current diff/code at that file:line
- a thread is resolved only after the current code confirms the point is addressed
- unresolved points are reported again, unchanged, with no assumption of progress
- new points found on the new commits follow the same citation format as `review-advanced` (216): quote + explanation + practical application
- template reuses the context-file protocol already used by `followup-basic`, not a new protocol
- EN and FR variants have the identical rule set and section structure

## Scenarios

- fixed by code, not message: {commitMessage: "fix: security issue", diff: "vulnerable line unchanged"} → thread stays unresolved
- fixed by code: {diff: "line corrected"} → thread marked resolved
- unresolved unchanged: {previousPoint: "still present", diff: "no related change"} → reported again unchanged
- new point cited: {newViolation: "found in new commit"} → pedagogical lesson block with quote and author present
- fr matches en: {file: "templates/fr/followup-advanced/SKILL.md"} → same rule set and same protocol as EN, headers in French

## Out of Scope

- changes to `followup-basic`
- automatic "fixed" detection via static analysis beyond re-reading the diff
- the main `review-advanced` template (216)
- a CLI command that scaffolds or copies the template automatically

## Glossary

| Term | Definition |
|------|------------|
| Context file | Server-provided file with pre-fetched thread information the skill reads |
| Thread resolution | Marking a review comment thread as addressed, gated on code re-verification, never on commit text |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Depends on 216 only for the shared citation format convention, not on its files |
| Negotiable | OK | Exact wording left to the implementer |
| Valuable | OK | Prevents false-positive thread resolution from a misleading commit message |
| Estimable | OK | Generalization of an existing internal skill (`review-followup`) |
| Small | OK | 4 files: SKILL.md + README.md, EN + FR |
| Testable | OK | Each rule maps to a scenario checkable by reading file content |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Static template content only |
| Impact | 1 | Medium — closes a real false-positive risk (trusting commit messages) |
| Confidence | 80% | Content generalized from a proven internal skill already in this repo |
| Effort | 2 pts | 4 files, smaller than 216 (no audit chain to build) |
| **Score** | **1.20** | |

Priority: Moderate

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
