# Show a per-developer quality panel on the stats page

## Context

The review-data analysis found a 4-20x spread in blocking rate and a wide score spread between developers, all hidden under team-wide totals (e.g. zero-blocking rate 85% vs 20%; blocking/review 0.06 vs 1.29). A per-developer panel surfaces who needs coaching and who sets the bar, using the `assignedBy` already recorded on 242/243 reviews. No new capture.

## Rules

- the stats page shows a table with one row per developer that appears as `assignedBy` on at least one review
- each row shows: review count, average score (null-safe, ignoring null-score reviews), blocking per review, zero-blocking percentage
- the average score ignores reviews whose score is null; a developer with only null scores shows "-" for score
- developers are ranked by review count descending
- a coaching flag marks any developer whose blocking-per-review exceeds 1.0
- reviews with no `assignedBy` are grouped under a single "unattributed" row, never dropped silently
- when no review carries an `assignedBy`, the panel shows an empty state

## Scenarios

- nominal: {alice 20 reviews avg 8.5 blocking/review 0.1, bob 5 reviews avg 6.0 blocking/review 1.4} → two rows, alice first, bob flagged for coaching
- null-safe score: {dev with 3 reviews, 2 null scores, 1 score 8} → score shows 8.0 over the 1 scored review
- all null: {dev whose every review has null score} → score shows "-"
- unattributed: {2 reviews without assignedBy} → an "unattributed" row with count 2
- empty: {no review has assignedBy} → empty state "Aucune donnée par développeur"

## Out of Scope

- the per-developer score growth line chart over time (separate follow-up candidate)
- cross-project aggregation of a developer across repositories
- author identity resolution / merging aliases of the same person
- any write to per-developer records (read-only over existing stats)

## Glossary

| Term | Definition |
|------|------------|
| Developer | The `assignedBy` value recorded on a review (the MR author/assignee tracked at review time) |
| Blocking per review | Total blocking findings divided by the developer's review count |
| Zero-blocking percentage | Share of the developer's reviews with zero blocking findings |
| Coaching flag | A visual marker when blocking-per-review exceeds 1.0 |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads `ProjectStats.reviews` (`assignedBy`, `score`, `blocking`); no in-flight dependency |
| Negotiable | OK | Coaching threshold and column set tunable by the planner |
| Valuable | OK | Turns hidden per-dev spread into a coaching/accountability view |
| Estimable | OK | A pure per-developer aggregator + presenter + table view |
| Small | WARN | ~8-11 files; growth-line explicitly deferred to stay small |
| Testable | OK | Each rule maps to a scenario |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 5 | entity aggregator → presenter → dashboard table + i18n |
| Impact | 2 | high — drives coaching and accountability decisions |
| Confidence | 80% | spread analyzed on real data; exact UX value to validate |
| Effort | 5 pts | grouping + null-safe stats + table + tests |
| **Score** | **1.60** | |

Priority: Important

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
