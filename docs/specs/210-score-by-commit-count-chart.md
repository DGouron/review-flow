# Show score by commit count on the stats page

## Context

The review-data analysis found a replicated negative correlation between a merge request's commit count and its review score (`r = -0.41`, n=89 and n=25, surviving control for diff size). This is the single strongest quality predictor in the data and it is known *before* a review runs, yet it is never visualized. A bar chart of average score grouped by commit-count band makes the "more commits → lower score" signal legible and coaches authors to split work.

## Rules

- the stats page shows a bar chart of average review score grouped by commit-count band
- the bands are: 1 commit, 2-3, 4-6, 7+
- a band is plotted only when at least one scored review with diff data falls in it
- each bar shows the band's average score over reviews that have both a non-null score and diff data
- reviews without diff data (legacy records) are excluded from the chart, not counted as zero
- when no review has both a score and a commit count, the chart shows the standard no-data empty state
- the chart is computed deterministically from already-recorded stats; no AI, no new capture

## Scenarios

- nominal: {reviews: 1-commit avg 8.8, 2-3 avg 8.3, 4-6 avg 8.0, 7+ avg 7.7} → four bars, descending left to right
- sparse band: {no review with exactly 1 commit} → the "1 commit" band is omitted, the rest shown
- legacy excluded: {40 reviews with score but no diffStats, 10 with both} → bars computed over the 10 only
- empty: {no review has both score and diffStats} → empty state "Aucune donnée disponible"

## Out of Scope

- the pre-review oversized-MR warning (already shipped as SPEC-209 mr-size-guard)
- a scatter of duration vs score (separate candidate)
- per-developer breakdown of this chart
- configurable band thresholds

## Glossary

| Term | Definition |
|------|------------|
| Commit-count band | A bucket of merge requests by number of commits (1 / 2-3 / 4-6 / 7+) |
| Scored review with diff data | A recorded review carrying both a non-null `score` and a non-null `diffStats` |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads `ProjectStats.reviews` (`score`, `diffStats.commitsCount`); no in-flight dependency |
| Negotiable | OK | Exact band edges and bar styling left to the planner |
| Valuable | OK | Surfaces the strongest measured quality predictor; coaches MR splitting |
| Estimable | OK | A pure band-aggregator + presenter + one canvas chart |
| Small | OK | ~6-9 files including tests |
| Testable | OK | Each rule maps to a scenario |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 5 | entity aggregator → presenter → dashboard chart + i18n |
| Impact | 1 | medium — actionable coaching signal, not blocking |
| Confidence | 100% | correlation measured on real data (r=-0.41, replicated) |
| Effort | 3 pts | aggregator + presenter + canvas draw + tests |
| **Score** | **1.67** | |

Priority: Important

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
