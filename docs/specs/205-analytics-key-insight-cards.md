# Show key insight cards on the analytics overview

## Status: implemented

## Context

The analytics overview ends with a "Key Insights" row — short callouts that highlight the most notable trends in the recorded reviews (is review volume rising, which bug category dominates, is review time improving). A reviewer wants these standout signals surfaced as cards, computed deterministically from the stats already recorded — no AI, no manual generation, no new capture.

## Rules

- the overview shows up to three key insight cards, ranked most-notable first
- each card is a short title plus a one-line explanation — text only, no chart
- insights are computed deterministically from already-recorded stats (review counts, bug-category breakdown, review durations); no AI and no new data capture
- the candidate insights are: review-volume trend, dominant bug category, and average-review-time trend
- a candidate is shown only when it has enough data to be meaningful; otherwise it is omitted (never shown as a zero or flat card)
- a trend insight compares the recent period against the previous comparable period and states the direction and the magnitude
- the dominant-bug-category insight names the category with the most findings and its count; it is shown only when at least one categorized bug exists
- ranking is by signal strength: larger relative change (or larger category dominance) ranks higher
- when no candidate qualifies, the section shows an empty state instead of blank cards

## Scenarios

- volume rising: {12 reviews in the recent period vs 6 in the previous} → a review-volume card stating the increase
- dominant category: {category aggregate security 4, logic 12, style 2} → a card naming Logic as the most common finding with count 12
- review time improving: {recent average duration below the previous period} → a card stating review time dropped, with the magnitude
- ranking and truncation: {four candidates qualify} → only the top three are shown, strongest signal first
- not enough data: {fewer reviews than the minimum per period, flat trends, and no categorized bugs} → those candidates are omitted
- empty: {no candidate qualifies} → empty state "Aucun insight disponible pour le moment"

## Out of Scope

- AI-generated insights (no Claude call, no `/api/insights/generate` dependency)
- the KPI cards and review-volume chart (SPEC-204) and the category chart (SPEC-203)
- the per-developer and team insight sheets in the team tab (already shipped, separate pipeline)
- a configurable insight set or user-tunable thresholds
- a historical log of past insights or insight-over-time trends

## Glossary

| Term | Definition |
|------|------------|
| Key insight card | A short, ranked narrative callout derived deterministically from recorded stats |
| Candidate insight | One of the fixed set (review-volume trend, dominant bug category, review-time trend) evaluated each render |
| Notable | A candidate that passes its data/threshold test and is therefore eligible to be shown |
| Period | The recent window of reviews compared against the previous comparable window for a trend |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads `ProjectStats` (counts, `categoryBreakdown` from SPEC-203, durations); no in-flight dependency |
| Negotiable | OK | Exact period sizes, thresholds, and ranking weights left to the planner |
| Valuable | OK | The standout signals readable at a glance, matching the target design |
| Estimable | OK | Bounded: a pure insight-deriver + presenter + text cards |
| Small | OK | ~8–12 files including tests |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

## Implementation

### Artefacts
- **Deriver** — `entities/stats/keyInsights.ts`: pure `deriveKeyInsights(stats, now)` evaluating three candidates (review-volume trend, dominant bug category, review-time trend), gating each, ranking by `strength` desc. `now` injected (deterministic).
- **Presenter** — `keyInsights.presenter.ts`: wraps the deriver into `{ cards: {title, body}[0..3], isEmpty, emptyMessage }`, truncates to 3, FR empty message.
- **HTTP** — `GET /api/stats` extended with `keyInsights` (both branches; `/api/insights` untouched, no new route).
- **View** — `dashboard/modules/keyInsights.js` (humble, text cards) + i18n (`stats.keyInsights`, `stats.noKeyInsights`, EN/FR) + `index.html` wiring on the same `/api/stats` fetch.

### Decisions
- Card titles/bodies generated in English (matches the design); only the empty state is French. Review-volume and review-time deltas use a 10% relative floor; cards ranked by raw `strength`.
- **Load-bearing deviation**: review-volume uses a date-based 30-day window (recent vs previous 30 days, each ≥3 reviews), NOT a `slice(-5)` count window — a 5-vs-5 slice could never express "12 vs 6". Review-time keeps the `slice(-5)`/`slice(-10,-5)` sample windows (averaging is per-sample). Because the route calls the real `new Date()`, the HTTP acceptance test asserts via the `now`-independent dominant-category candidate.
- No AI, no new capture, no `/api/insights/generate` dependency (spec Out of Scope).

### Report
See `docs/reports/205-analytics-key-insight-cards.report.md`.
