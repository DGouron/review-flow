# Track bugs found by category

## Status: implemented

## Context

Reviewers see total issue counts (blocking/warnings/suggestions) but never *what kind* of issues reviews catch most. A reviewer wants to know whether reviews mostly flag security, logic, performance, type-safety, style, or dependency problems, so they can target the weakest area. This feature records the category of each flagged finding per review and shows a "Bugs Found by Category" bar chart on the dashboard.

## Rules

- categories are a fixed closed set: Security, Logic, Performance, Type Safety, Style, Dependencies
- each review records, per category, how many findings it flagged (a category breakdown)
- every flagged finding belongs to exactly one category — never counted twice, never split
- a review that reports no category data contributes zero to every category and must not break aggregation
- only known categories are stored — an unrecognized category label is ignored
- the dashboard shows the project-wide breakdown: the sum of each category across all the project's reviews
- the bars are ordered from the highest count to the lowest
- all six categories always appear, even when their count is zero
- a project with no category data shows an empty-state message instead of an empty chart

## Scenarios

- nominal capture: {review flags Security:3, Logic:5, Performance:1} → breakdown stored {security:3, logic:5, performance:1, typeSafety:0, style:0, dependencies:0}
- partial breakdown: {review flags Style:2 only} → breakdown stored {style:2, all other categories:0}
- unknown category ignored: {review flags Security:2, Cosmic:9} → breakdown stored {security:2, ...}, "Cosmic" dropped
- aggregation across reviews: {review A: Security:3} + {review B: Security:2, Logic:4} → project breakdown {security:5, logic:4, performance:0, typeSafety:0, style:0, dependencies:0}
- sorted output: {project breakdown logic:5, security:3, style:1} → bars ordered Logic, Security, Style, then the zero categories
- legacy review without breakdown: {review recorded before this feature} → contributes {0,0,0,0,0,0}, aggregation unaffected
- empty project: {no review has any category count} → chart shows "Aucune donnée de catégorie disponible"

## Out of Scope

- the other Analytics Overview pieces — KPI cards, "PRs Reviewed" line chart, "Key Insights" cards (separate future specs)
- per-developer, per-file, or per-MR category breakdown
- category trend over time (months) — totals only
- backfilling category data for reviews recorded before this feature (they count as zero)
- configurable or custom categories — the six-category set is closed
- how a finding is mapped to a category during review (audit-to-category mapping is an implementation decision)

## Glossary

| Term | Definition |
|------|------------|
| Finding | Any issue a review flags — blocking, warning, or suggestion |
| Category | One of the six fixed themes a finding is attributed to (Security, Logic, Performance, Type Safety, Style, Dependencies) |
| Category breakdown | The per-review map of category → number of findings flagged in that category |
| Aggregate breakdown | The project-wide sum of category counts across all of the project's reviews |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Extends the existing stats pipeline; depends on no in-flight spec |
| Negotiable | OK | Capture mechanism (review marker vs MCP vs report parse) left open to the planner |
| Valuable | OK | Reviewers see which issue types dominate and target the weakest area |
| Estimable | OK | Bounded: one new field on the review stats, aggregation, route, presenter, one chart |
| Small | OK | ~10–13 files including tests; one TDD feature, under the 15-file threshold |
| Testable | OK | Every rule maps to at least one scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

## Implementation

### Artefacts

- **Entity** — `bugCategory.ts` (closed 6-key union + ordered list + `emptyBreakdown()`), `categoryBreakdown.schema.ts` (Zod: record of the 6 keys → non-negative integers), `categoryBreakdown.guard.ts` (`createGuard` + normalize: drop unknown keys, fill missing with 0).
- **Stats model** — `ReviewStats.categoryBreakdown?: CategoryBreakdown | null`; `ProjectStats.categoryBreakdown?: CategoryBreakdown` (project-wide aggregate).
- **Capture / aggregation** — `statsService.ts`: `parseReviewOutput` reads a `categories=` segment appended to the existing `[REVIEW_STATS:...]` marker; `addReviewStats` stores the per-review breakdown; init/update maintain the project aggregate (legacy reviews without the segment contribute zero).
- **Presenter** — `bugsByCategory.presenter.ts`: six categories always present, sorted descending by count, `isEmpty` flag, FR empty message.
- **HTTP** — `GET /api/stats` payload extended with `bugsByCategory` (no new route).
- **View** — `drawBugsByCategoryChart` in `statsCharts.js` (vertical Canvas bars, HiDPI, gradient, FR empty state) + i18n labels (EN/FR) + canvas card wired in `index.html`.

### Architectural decisions

- Capture reuses the existing marker pipeline (`parseReviewOutput` → `addReviewStats` → `stats.json`) instead of a new MCP tool — `record_insight`/`add_action` do not persist to `stats.json`.
- Zod guard introduced only at the marker boundary (where untrusted input enters); `ReviewStats`/`ProjectStats` remain plain interfaces, consistent with the existing module.
- No new entity class, value object, use case, gateway, or route (YAGNI) — a flat `Record` carries the breakdown.

### Humble glue (wired — pending one manual validation run)

The review skills `review-back`, `review-front`, and `review-fullstack` now emit the `categories=...` segment in their `[REVIEW_STATS:...]` marker, with an audit→category mapping table per skill (Security→`security`; Clean Architecture/DDD/SOLID/React→`logic`; Performance→`performance`; TypeScript→`typeSafety`; Testing/Code Quality→`style`; dependency findings→`dependencies`). The chart labels were also localized via i18n keys (`stats.category.*`) instead of the hardcoded English entity labels. The TS parser was already unit-tested against sample markers; prompt-level emission cannot be unit-tested, so one real review run is still required to confirm a non-empty chart end-to-end.

### Report

See `docs/reports/203-bugs-found-by-category.report.md`.
