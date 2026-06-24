# Show scoring coverage and alert on silent scoring failures

## Context

The review-data analysis found that scoring breaks silently: one project ran 41.9% null scores (18/43), with 16 of them clustered in a single 7-day window — a parser/emitter regression that went undetected for a month. The displayed average then rests on a minority of reviews with no visible warning. A scoring-coverage indicator plus a null-rate alert makes the failure detectable instead of silent.

## Rules

- the stats page shows a scoring-coverage indicator: the share of reviews carrying a non-null score over total reviews
- coverage is computed over the retained reviews on the stats record
- the indicator is shown in a degraded/alert style when coverage drops below 85%
- a recent-failure alert is raised when more than 15% of reviews in any trailing 7-day window have a null score
- the alert names the window and the null count so the regression is locatable
- when there are no reviews, the indicator shows "-" and no alert
- computed deterministically from already-recorded stats; no AI, no new capture

## Scenarios

- healthy: {43 reviews, 41 scored} → coverage 95%, normal style, no alert
- degraded coverage: {43 reviews, 25 scored} → coverage 58%, alert style
- recent regression: {16 of 18 null scores fall within a 7-day window} → an alert naming the window and "16 unscored"
- no spike: {null scores spread evenly, no 7-day window above 15%} → coverage shown, no recent-failure alert
- empty: {no reviews} → coverage "-", no alert

## Out of Scope

- fixing the underlying score-parser regression (separate bug, tracked in the data report)
- writing a `parseFailure` flag onto records or changing the write path
- email/Slack/webhook notification delivery (in-dashboard indicator only)
- per-developer or per-category coverage breakdown

## Glossary

| Term | Definition |
|------|------------|
| Scoring coverage | Share of retained reviews with a non-null `score` |
| Null-rate window | A trailing 7-day window evaluated for its share of null-score reviews |
| Degraded style | The alert visual treatment applied when coverage or null-rate crosses its threshold |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads `ProjectStats.reviews` (`score`, `timestamp`); no in-flight dependency |
| Negotiable | OK | Exact thresholds (85%, 15%, 7 days) tunable by the planner |
| Valuable | OK | Restores trust in the headline score; surfaces silent regressions |
| Estimable | OK | A pure coverage/window calculator + presenter + indicator view |
| Small | OK | ~7-10 files including tests |
| Testable | OK | Each rule maps to a scenario |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 5 | entity calculator → presenter → dashboard indicator + i18n |
| Impact | 2 | high — protects data trust; catches silent scoring loss |
| Confidence | 100% | regression observed in real data (16 nulls / 7 days) |
| Effort | 3 pts | coverage + windowed null-rate + indicator + tests |
| **Score** | **3.33** | |

Priority: Critical

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
