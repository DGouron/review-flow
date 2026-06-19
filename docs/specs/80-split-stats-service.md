# Spec #80 — Split statsService into Clean Architecture Layers

**Issue**: [#80](https://github.com/DGouron/review-flow/issues/80)
**Labels**: refactor, P2-important, architecture
**Milestone**: Architecture Cleanup
**Date**: 2026-03-14

## Status: implemented

Implemented 2026-06-19. Plan: [80-split-stats-service.plan.md](../plans/80-split-stats-service.plan.md) · Report: [80-split-stats-service.report.md](../reports/80-split-stats-service.report.md).

## Implementation

> Note: this spec was written (2026-03-14) against `src/services/statsService.ts` and `@/entities/reviewStats/`. The repo since migrated to a modular monolith, so the real paths are under `src/modules/statistics-insights/`. Scenarios 1–3 (types + `StatsGateway` already in entities) were already satisfied before this work; the dependency-rule violation no longer existed. This refactoring extracted the remaining responsibilities still bundled in the service.

**Artefacts created** (under `src/modules/statistics-insights/`):

| Layer | File | Responsibility |
|-------|------|----------------|
| Entity | `entities/stats/projectStats.schema.ts` + `projectStats.guard.ts` | Zod `reviewStatsSchema`/`projectStatsSchema` (byte-identical shape) + `createGuard` boundary validation |
| Entity | `entities/stats/reviewOutput.parser.ts` | `parseReviewOutput` (pure, moved verbatim) |
| Entity | `entities/stats/reviewDuration.format.ts` | `formatReviewDuration` (placed inward so the `keyInsights` entity can consume it) |
| Entity | `entities/stats/projectStats.ts` | types repointed to `z.infer`; `createEmptyStats()` promoted here |
| Use case | `usecases/stats/addReviewStats.usecase.ts` | `AddReviewStatsUseCase` — aggregation + 100-review cap + `?? createEmptyStats()` write path, `StatsGateway` injected |
| Use case | `usecases/stats/getProjectStats.usecase.ts` | `GetProjectStatsUseCase` — returns `ProjectStats \| null` (no empty fallback, preserves route null-on-miss) |
| Presenter | `interface-adapters/presenters/statsSummary.presenter.ts` | `StatsSummaryPresenter` — duration formatting + score/blocking trend |

**Wiring**: `FileSystemStatsGateway.loadProjectStats` validates via `safeParseProjectStats` with a lenient fallback (never throws — old `stats.json` still loads). `stats.routes.ts` loads via `GetProjectStatsUseCase` and formats via `StatsSummaryPresenter` (`GET /api/stats` shape unchanged). `claudeInvoker.ts` records stats via `AddReviewStatsUseCase` with `statsGateway` threaded through `ClaudeInvokerDependencies`. The old `services/statsService.ts` and the `gateways/stats.gateway.ts` re-export shim were deleted; all 14 consumer import sites migrated.

**Architectural decisions** (per user override, DoD-literal): the Zod schema/guard (D6) and `GetProjectStatsUseCase` (D7) were implemented rather than declined, satisfying the literal Definition of Done.

---

## Problem Statement

`src/services/statsService.ts` is a 328-line God Object that violates Clean Architecture by mixing four distinct responsibilities in a single file:

1. **Entity definitions** — `ReviewStats` and `ProjectStats` types (domain data shapes)
2. **Persistence** — `loadProjectStats()` / `saveProjectStats()` with direct `fs` calls
3. **Domain logic** — `parseReviewOutput()` (extracts metrics from raw review output), `addReviewStats()` (creates a review record, enforces the 100-review cap, recalculates aggregates)
4. **Presentation** — `getStatsSummary()` (formats durations, computes trends, produces display-ready strings)

This creates three concrete problems:

- **Dependency Rule violation**: the `StatsGateway` interface (in `interface-adapters/`) and `FileSystemStatsGateway` (infra) both import `ProjectStats` from `services/statsService.ts` — an inner layer depends on an outer layer.
- **Untestable domain logic**: `addReviewStats()` is tightly coupled to file system I/O. Testing the aggregation logic (average score, 100-review cap) requires either real files or mocking Node.js `fs`.
- **Swapping persistence is impossible in practice**: despite `StatsGateway` existing, the `addReviewStats()` function bypasses it entirely by calling `loadProjectStats()` / `saveProjectStats()` directly — the gateway is dead code for writes.

A partial migration was already started: `StatsGateway` interface, `FileSystemStatsGateway`, and `InMemoryStatsGateway` exist but remain unused for the write path. This refactoring completes that migration.

---

## User Story

**As** a developer maintaining ReviewFlow,
**I want** `statsService` responsibilities split across proper Clean Architecture layers,
**So that** domain logic is testable without I/O, persistence is swappable through the gateway, and the codebase follows the same patterns used everywhere else.

---

## Scope Challenge & Decisions

### Why not just delete the old file and move code?

Naive file moves break all 9 import sites simultaneously. The spec prescribes a strangler approach: new modules are created and consumers are migrated one by one. The old `statsService.ts` is deleted only when zero imports remain.

### Why not also refactor `ProjectStats` into a class with Zod validation?

`ProjectStats` is a computed aggregate (sums, averages) — not a domain entity with invariants to enforce. Making it a class adds boilerplate with no business rule to protect. The type stays a plain `type` derived from a Zod schema, consistent with `MrTrackingData` in `entities/tracking/`.

### Why not merge with the tracking-system `ProjectStats`?

Two distinct `ProjectStats` types exist: one in `entities/tracking/mrTrackingData.ts` (MR-level stats: totalMrs, averageTimeToApproval, topAssigners) and one in `services/statsService.ts` (review-level stats: totalReviews, averageScore, totalBlocking). They serve different bounded contexts. Merging them would create a second God Object. They stay separate.

### What about `parseReviewOutput`?

This function extracts structured metrics (score, blocking, warnings, suggestions) from raw Claude CLI output text. It is pure domain logic — no I/O, no side effects, deterministic input/output. It belongs in the entity layer as a parser/factory function for `ReviewStats`.

---

## Acceptance Criteria (Gherkin)

### Scenario 1: ReviewStats type lives in entities layer (nominal)

```gherkin
Given the codebase has been refactored
When I check imports of ReviewStats across the project
Then all imports resolve from @/entities/reviewStats/reviewStats.schema.js
And no import references @/services/statsService.js for ReviewStats
```

### Scenario 2: ProjectStats type lives in entities layer (nominal)

```gherkin
Given the codebase has been refactored
When I check imports of ProjectStats across the project
Then all imports resolve from @/entities/reviewStats/reviewStats.schema.js
And the StatsGateway contract in entities/ imports from the same module
```

### Scenario 3: StatsGateway contract moves to entities layer (nominal)

```gherkin
Given the StatsGateway interface currently lives in interface-adapters/gateways/
When the refactoring is complete
Then the StatsGateway interface lives in @/entities/reviewStats/reviewStats.gateway.ts
And FileSystemStatsGateway imports the contract from entities/
And InMemoryStatsGateway imports the contract from entities/
And the dependency rule is satisfied (entities <- interface-adapters)
```

### Scenario 4: parseReviewOutput extracts structured stats line (nominal)

```gherkin
Given a review output containing "[REVIEW_STATS:blocking=2:warnings=3:suggestions=1:score=7.5]"
When parseReviewOutput is called
Then it returns { score: 7.5, blocking: 2, warnings: 3, suggestions: 1 }
```

### Scenario 5: parseReviewOutput extracts summary format (nominal)

```gherkin
Given a review output containing summary lines with Score global, Bloquants, Importants counts
When parseReviewOutput is called
Then it returns the correct score, blocking, warnings, and suggestions counts
```

### Scenario 6: parseReviewOutput falls back to inline markers (edge case)

```gherkin
Given a review output with no structured line and no summary section
But containing inline markers (BLOQUANT, IMPORTANT, SUGGESTION)
When parseReviewOutput is called
Then it counts the markers and returns the totals
```

### Scenario 7: parseReviewOutput handles empty output (edge case)

```gherkin
Given a review output that is empty or contains no recognizable patterns
When parseReviewOutput is called
Then it returns { score: null, blocking: 0, warnings: 0, suggestions: 0 }
```

### Scenario 8: AddReviewStats use case records a new review (nominal)

```gherkin
Given a project with 0 existing reviews
When AddReviewStats is executed with mrNumber 42, duration 60000, and parsed output { score: 8, blocking: 1, warnings: 2, suggestions: 3 }
Then the gateway contains 1 review with the correct fields
And totalReviews is 1
And averageScore is 8
And totalBlocking is 1
And totalWarnings is 2
```

### Scenario 9: AddReviewStats use case enforces 100-review cap (edge case)

```gherkin
Given a project with 100 existing reviews
When AddReviewStats is executed with a new review
Then the gateway contains exactly 100 reviews
And the oldest review has been removed
And aggregates are recalculated from the remaining 100 reviews
```

### Scenario 10: AddReviewStats use case calculates average score correctly (nominal)

```gherkin
Given a project with 2 existing reviews with scores 6 and 8
When AddReviewStats is executed with a review with score null
Then averageScore remains 7 (null scores are excluded from average)
And totalReviews is 3
```

### Scenario 11: GetStatsSummary presenter formats duration (nominal)

```gherkin
Given ProjectStats with totalDuration 7500000 (2h 5m) and averageDuration 150000 (2m 30s)
When the StatsSummaryPresenter presents the stats
Then totalTime is "2h 5m"
And averageTime is "2m"
```

### Scenario 12: GetStatsSummary presenter computes score trend (nominal)

```gherkin
Given ProjectStats with 10 reviews
And the last 5 reviews have average score 8
And the previous 5 reviews have average score 6
When the StatsSummaryPresenter presents the stats
Then the score trend is "up"
```

### Scenario 13: GetStatsSummary presenter handles insufficient data for trends (edge case)

```gherkin
Given ProjectStats with only 2 reviews
When the StatsSummaryPresenter presents the stats
Then the score trend is "stable"
And the blocking trend is "stable"
```

### Scenario 14: Existing stats files remain compatible (regression)

```gherkin
Given a stats.json file written by the current statsService
When the refactored code loads this file via StatsGateway
Then all fields are correctly parsed
And the data is usable by the AddReviewStats use case and StatsSummaryPresenter
```

### Scenario 15: stats.routes.ts uses presenter instead of direct function call (nominal)

```gherkin
Given the dashboard requests GET /api/stats?path=/some/project
When the route handler processes the request
Then it uses StatsGateway to load stats
And it uses StatsSummaryPresenter to format the summary
And the response shape is unchanged from the current API
```

### Scenario 16: claudeInvoker uses AddReviewStats use case (nominal)

```gherkin
Given a review job completes successfully
When claudeInvoker records the stats
Then it calls AddReviewStats use case with the gateway dependency
And no longer calls the standalone addReviewStats function directly
```

---

## Out of Scope

| Item | Reason |
|------|--------|
| Renaming `ProjectStats` (tracking) vs `ProjectStats` (review-stats) | Different bounded contexts; tracked separately. A future issue can introduce naming disambiguation if confusion arises |
| Replacing regex parsing with structured output from Claude | `parseReviewOutput` stays regex-based; structured output is a separate feature |
| Dashboard UI changes | This is a backend refactoring; the API response shape stays identical |
| Migrating `statsService` tests (none exist) | Tests are created from scratch for the new modules via TDD |
| Changing the stats.json file format | Backward compatibility is a hard constraint |
| Adding new stats fields (e.g., suggestions total) | Feature, not refactoring |
| Performance optimization of file reads | Not a problem at current scale |

---

## Technical Notes

### Current state (what exists)

| Component | Location | Status |
|-----------|----------|--------|
| `ReviewStats` type | `services/statsService.ts:7` | Needs to move to entities |
| `ProjectStats` type | `services/statsService.ts:22` | Needs to move to entities |
| `parseReviewOutput()` | `services/statsService.ts:112` | Pure logic, needs to move to entities |
| `addReviewStats()` | `services/statsService.ts:223` | Mixed logic + I/O, needs to become a use case |
| `getStatsSummary()` | `services/statsService.ts:278` | Presentation logic, needs to become a presenter |
| `loadProjectStats()` | `services/statsService.ts:43` | Duplicated in `FileSystemStatsGateway` |
| `saveProjectStats()` | `services/statsService.ts:68` | Duplicated in `FileSystemStatsGateway` |
| `createEmptyStats()` | `services/statsService.ts:84` | Factory, belongs with the entity schema |
| `StatsGateway` interface | `interface-adapters/gateways/stats.gateway.ts` | Needs to move to entities (dependency rule) |
| `FileSystemStatsGateway` | `interface-adapters/gateways/fileSystem/stats.fileSystem.ts` | Stays, but updates imports |
| `InMemoryStatsGateway` | `tests/stubs/stats.stub.ts` | Stays, but updates imports |
| `ReviewStatsFactory` | `tests/factories/projectStats.factory.ts` | Updates imports |
| `ProjectStatsFactory` | `tests/factories/projectStats.factory.ts` | Updates imports |

### Target structure

```
src/entities/reviewStats/
  reviewStats.schema.ts      # ReviewStats + ProjectStats types, Zod schemas, createEmptyStats()
  reviewStats.parser.ts      # parseReviewOutput() — pure function
  reviewStats.gateway.ts     # StatsGateway interface (contract)

src/usecases/
  addReviewStats.usecase.ts  # AddReviewStats use case (UseCase<Input, ReviewStats>)
  getProjectStats.usecase.ts # GetProjectStats use case (UseCase<Input, ProjectStats>)

src/interface-adapters/
  presenters/
    statsSummary.presenter.ts  # getStatsSummary() -> StatsSummaryPresenter (Presenter<ProjectStats, StatsSummaryViewModel>)
  gateways/
    stats.gateway.ts             # DELETED (contract moves to entities)
    fileSystem/stats.fileSystem.ts # Updates imports from entities

src/tests/
  units/entities/reviewStats/
    reviewStats.schema.test.ts    # Schema validation tests
    reviewStats.parser.test.ts    # parseReviewOutput tests (moved from zero to full coverage)
  units/usecases/
    addReviewStats.usecase.test.ts
    getProjectStats.usecase.test.ts
  units/interface-adapters/presenters/
    statsSummary.presenter.test.ts
  stubs/
    stats.stub.ts                  # Updates imports
  factories/
    projectStats.factory.ts        # Updates imports (renamed to reviewStats.factory.ts)
```

### Consumer migration map

| Consumer | Current import | New import |
|----------|---------------|------------|
| `claudeInvoker.ts` | `addReviewStats` from `statsService` | `AddReviewStatsUseCase` from use case + `parseReviewOutput` from entity |
| `gitlab.controller.ts` | `parseReviewOutput` from `statsService` | `parseReviewOutput` from `@/entities/reviewStats/reviewStats.parser.js` |
| `github.controller.ts` | `parseReviewOutput` from `statsService` | `parseReviewOutput` from `@/entities/reviewStats/reviewStats.parser.js` |
| `mrTrackingAdvanced.routes.ts` | `parseReviewOutput` from `statsService` | `parseReviewOutput` from `@/entities/reviewStats/reviewStats.parser.js` |
| `stats.routes.ts` | `getStatsSummary` from `statsService` | `StatsSummaryPresenter` from presenter |
| `stats.routes.ts` | `StatsGateway` from `gateways/` | `StatsGateway` from `entities/reviewStats/` |
| `stats.gateway.ts` | `ProjectStats` from `statsService` | Deleted; contract moves to entities |
| `stats.fileSystem.ts` | `ProjectStats` from `statsService` | `ProjectStats` from `@/entities/reviewStats/reviewStats.schema.js` |
| `stats.stub.ts` | Both `StatsGateway` and `ProjectStats` | Both from entities |
| `projectStats.factory.ts` | Types from `statsService` | Types from `@/entities/reviewStats/reviewStats.schema.js` |
| `stats.gateway.test.ts` | Indirect via stub/factory | Updated transitively |
| `dependencies.ts` | `StatsGateway` from `gateways/` | `StatsGateway` from `@/entities/reviewStats/reviewStats.gateway.js` |

### Constraints

- **Zero breaking changes to `stats.json` format** — existing files must load without migration
- **Zero breaking changes to `GET /api/stats` response shape** — dashboard must work unchanged
- **Strangler pattern** — new modules are created first, consumers migrated one by one, `statsService.ts` deleted last
- **No new npm dependencies**
- **All imports use `@/` alias + `.js` extension**

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| None | N/A | This refactoring has no external blockers |

---

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No blockers. All affected files are in this repo. No cross-PR dependency | PASS |
| **Negotiable** | `getProjectStats` use case is optional (could stay as gateway.load + factory). Presenter naming is negotiable. Decomposition order is flexible | PASS |
| **Valuable** | Eliminates dependency rule violation. Makes aggregation logic unit-testable. Completes the half-finished gateway migration. Sets pattern for remaining `services/` migrations | PASS |
| **Estimable** | 3 new modules (schema, parser, use case) + 1 presenter + 9 consumer migrations + tests. Bounded at ~3 story points | PASS |
| **Small** | 1 entity module, 1-2 use cases, 1 presenter, 9 import updates, 1 file deletion. Achievable in 1 focused day | PASS |
| **Testable** | 16 Gherkin scenarios with concrete assertions. All domain logic becomes unit-testable without I/O stubs | PASS |

---

## Suggested Decomposition

Given the 3-point effort estimate and the strangler pattern constraint, recommended sub-tasks:

1. **Entity layer** — Create `entities/reviewStats/reviewStats.schema.ts` (types + Zod schemas + `createEmptyStats`), `reviewStats.parser.ts` (`parseReviewOutput`), `reviewStats.gateway.ts` (move `StatsGateway` contract). Write tests for schema and parser.

2. **Use case layer** — Create `AddReviewStatsUseCase` (extract aggregation logic from `addReviewStats()`). Create `GetProjectStatsUseCase` if justified (thin wrapper around gateway + factory). Write tests with `InMemoryStatsGateway`.

3. **Presenter layer** — Create `StatsSummaryPresenter` implementing `Presenter<ProjectStats, StatsSummaryViewModel>` (extract from `getStatsSummary()`). Write tests for formatting and trend calculation.

4. **Consumer migration** — Update all 9 import sites to use new modules. Wire `AddReviewStatsUseCase` in `claudeInvoker.ts` and composition root. Delete `services/statsService.ts` and `interface-adapters/gateways/stats.gateway.ts`.

5. **Verification** — `yarn verify` passes. Manual test: run a review, confirm `stats.json` is written correctly, confirm dashboard displays stats.

Each sub-task produces a working codebase (no broken imports between steps).

---

## Definition of Done

- [ ] `ReviewStats` and `ProjectStats` types live in `src/entities/reviewStats/reviewStats.schema.ts`
- [ ] Zod schemas validate both types at boundaries
- [ ] `createEmptyStats()` factory lives alongside the schema
- [ ] `parseReviewOutput()` lives in `src/entities/reviewStats/reviewStats.parser.ts`
- [ ] `StatsGateway` contract lives in `src/entities/reviewStats/reviewStats.gateway.ts`
- [ ] `FileSystemStatsGateway` imports contract and types from entities layer
- [ ] `InMemoryStatsGateway` imports contract and types from entities layer
- [ ] `AddReviewStatsUseCase` encapsulates review recording + aggregation + 100-review cap
- [ ] `AddReviewStatsUseCase` receives `StatsGateway` via constructor injection
- [ ] `StatsSummaryPresenter` implements `Presenter<ProjectStats, StatsSummaryViewModel>`
- [ ] `StatsSummaryPresenter` handles duration formatting and trend calculation
- [ ] All 9 consumer files import from new locations (zero imports from `services/statsService.ts`)
- [ ] `src/services/statsService.ts` is deleted
- [ ] `src/interface-adapters/gateways/stats.gateway.ts` is deleted (contract moved to entities)
- [ ] Existing `stats.json` files load without errors (backward compatible)
- [ ] `GET /api/stats` response shape is unchanged
- [ ] Unit tests exist for: schema validation, `parseReviewOutput` (all 3 methods + edge cases), `AddReviewStatsUseCase` (record, cap, averages), `StatsSummaryPresenter` (formatting, trends)
- [ ] Test factories updated to import from entities
- [ ] `yarn verify` passes (typecheck + lint + tests)
