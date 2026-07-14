# Implementation Report — SPEC-216 Add a review-advanced template with sequential audits, security block, and cited pedagogical lessons

> Spec: `docs/specs/216-review-advanced-template.md`
> Status: implemented · Date: 2026-07-14

## Status: Complete

## Summary

Added a new `review-advanced` template (EN + FR) alongside the existing `review-basic` / `review-with-agents` family. Content generalizes the sequential-audit, dedicated-security-block, and cited-pedagogical-lesson pattern already proven in this repo's own dogfooding skills (`.claude/skills/review-fullstack/SKILL.md`, `.claude/skills/review-front/SKILL.md`), stripped of stack-specific content (React/TypeScript-only audits) and generalized with a "Stack Best Practices" placeholder plus a new Naming Audit (excluded from the score) and a Pareto Bug Prevention audit.

## Files created

| File | Description |
|------|--------------|
| `templates/en/review-advanced/SKILL.md` | 9 sequential audits (8 scored + Naming unscored), citation format, marker protocol |
| `templates/en/review-advanced/README.md` | Installation, customization points, rationale for Naming exclusion and Security blocking |
| `templates/fr/review-advanced/SKILL.md` | French variant, identical structure |
| `templates/fr/review-advanced/README.md` | French variant |

No production code, no tests — pure template markdown content, as scoped.

## Spec coverage

| Scenario | Verification |
|----------|--------------|
| audit sequence present, in order | `grep -n "^#### Audit" templates/en/review-advanced/SKILL.md` → Clean Architecture, DDD, Stack Best Practices, SOLID, Testing, Code Quality, Pareto Bug Prevention, Naming Audit, Security — in that order |
| naming excluded from score | "Naming (audit 8) is excluded" in the synthesis section + "Do not score this audit" in Audit 8 + separate "Naming" report section |
| security dedicated and blocking | "**This audit is blocking**: an unresolved Security finding blocks merge regardless of the overall score" |
| citation format enforced | `Pedagogical lesson` / `Practical application` blocks present, matching `review-front/SKILL.md`'s existing format |
| sources table editable | "Authorized sources (default table — edit freely for your project's stack)" |
| no stack hardcoded | No literal `React`/`Vue`/`Angular`/`Django` in either file (the one `Vue` hit in the FR README is the French word "vue" in "Vue d'ensemble", not the framework) |
| fr matches en | Same 9-audit sequence, same marker count (24 `[PROGRESS:...]` occurrences in both EN and FR) |

## Notes

- Kept the existing stdout-marker protocol (`[PHASE:...]`, `[PROGRESS:...]`, `[REVIEW_STATS:...]`) rather than MCP tool calls, matching the current `review-basic`/`review-with-agents` family — the MCP variant from SPEC-56 was superseded and never became the shipped default.
- The "Stack Best Practices" and "Pareto Bug Prevention" audits ship as explicit placeholders (per Out of Scope: framework-specific rule content is left to the consumer).
- `yarn verify` run to confirm the markdown-only change doesn't break the build/lint/tests.
