# Show a loading skeleton while the stats page fetches

## Context

The dedicated /stats page fetches language, projects and stats sequentially and shows a literal "…" placeholder until everything resolves, so the page looks broken on slow loads. A skeleton that mirrors the real layout (period banner, hero tiles, KPI grid, charts) communicates "loading" and reduces perceived latency.

## Rules

- while the stats data is loading, the page shows a skeleton in place of the content
- the skeleton mirrors the real layout: a banner line, the volume hero tiles, the quality KPI grid, and the chart cards
- the skeleton is replaced by the real content once the stats fetch resolves
- on fetch failure the skeleton is replaced by the existing error/empty state, never left in place
- the skeleton respects reduced-motion: no shimmer animation when the user prefers reduced motion

## Scenarios

- loading: {stats fetch pending} → skeleton with banner, hero tiles, KPI grid and chart placeholders
- resolved: {stats fetch returns data} → skeleton replaced by the rendered stats
- failed: {stats fetch errors} → skeleton replaced by the error/empty state
- reduced motion: {prefers-reduced-motion is set} → skeleton shown without shimmer animation

## Out of Scope

- changing the sequential fetch order into parallel requests
- skeletons for any page other than /stats
- progress percentages or per-section staggered reveal

## Glossary

| Term | Definition |
|------|------------|
| Skeleton | Placeholder markup mirroring the final layout shown during loading |
| Shimmer | The animated highlight sweep on a skeleton, suppressed under reduced-motion |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Pure dashboard view/glue; no backend or data dependency |
| Negotiable | OK | Exact skeleton fidelity left to the planner |
| Valuable | OK | Removes the broken-looking "…" state, lowers perceived latency |
| Estimable | OK | Skeleton markup + show/hide wiring in the load sequence |
| Small | OK | ~3-5 files including tests |
| Testable | OK | Each rule maps to a scenario |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | dashboard view + glue only |
| Impact | 0.5 | minor — perceived-performance polish |
| Confidence | 80% | clear gap, value is UX-perceptual |
| Effort | 2 pts | skeleton markup + load-sequence wiring + tests |
| **Score** | **0.60** | |

Priority: Moderate

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
