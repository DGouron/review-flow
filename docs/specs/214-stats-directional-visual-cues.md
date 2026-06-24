# Add directional visual cues to stats trends and key insights

## Context

Two small legibility gaps remain on the /stats page. Blocking has a trend arrow but Warnings — the larger finding set — has none, so its direction is invisible. And the Key Insight cards all look identical despite each carrying a known `key` and direction, so a worsening trend reads the same as an improving one. Both are directional-cue additions over data that already exists.

## Rules

- the Warnings KPI shows a trend arrow computed the same way as the Blocking trend (recent vs previous comparable window)
- a Warnings trend improving (fewer warnings) reads as positive, the same polarity convention as Blocking
- each Key Insight card carries a direction cue derived from its insight key and trend
- an improving trend cue is positive-colored, a worsening trend cue is negative-colored, a neutral/dominant-category cue is accent-colored
- the cues are decorative: each is paired with text so the meaning never depends on color alone
- computed deterministically from already-recorded stats; no AI, no new capture

## Scenarios

- warnings down: {recent warnings average below the previous window} → Warnings KPI shows a downward/positive trend arrow
- warnings flat: {warnings change within the stable threshold} → Warnings KPI shows the neutral arrow
- improving insight: {review-time-dropped insight} → its card carries a positive-colored cue plus text
- worsening insight: {review-volume-down insight treated as negative} → its card carries a negative-colored cue plus text
- category insight: {dominant-bug-category insight} → its card carries the neutral accent cue

## Out of Scope

- new insight types or new KPIs (only cues over existing trends/insights)
- changing the trend thresholds or the insight ranking
- color-only signaling (every cue must keep its paired text)

## Glossary

| Term | Definition |
|------|------------|
| Direction cue | A small colored marker (with text) showing whether a metric is improving, worsening, or neutral |
| Warnings trend | The recent-vs-previous comparison of average warnings, mirroring the Blocking trend |
| Insight key | The identifier already attached to each Key Insight (`codeVolume`, `reviewVolume`, `dominantCategory`, `reviewTime`) |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads existing trend computation and `KeyInsight.key`; no in-flight dependency |
| Negotiable | OK | Exact colors and arrow set left to the planner |
| Valuable | OK | Makes direction readable at a glance for warnings and insights |
| Estimable | OK | Trend extension in the presenter + a cue mapping threaded to the views |
| Small | OK | ~5-8 files including tests |
| Testable | OK | Each rule maps to a scenario |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | presenter trend + two humble views (KPI + insight card) |
| Impact | 0.5 | minor — legibility polish over existing data |
| Confidence | 80% | gap analyzed on code; value is perceptual |
| Effort | 2 pts | trend.warnings + key threading + cue mapping + tests |
| **Score** | **0.60** | |

Priority: Moderate

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
