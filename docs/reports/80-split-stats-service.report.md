# Report — Spec #80: Split statsService into Clean Architecture Layers

**Spec**: [docs/specs/80-split-stats-service.md](../specs/80-split-stats-service.md)
**Plan**: [docs/plans/80-split-stats-service.plan.md](../plans/80-split-stats-service.plan.md)
**Date**: 2026-06-19
**Status**: Complete

---

## Summary

The God Object `src/modules/statistics-insights/services/statsService.ts` (parser +
aggregation + persistence + presentation + duration formatting) was split across the
proper Clean Architecture layers using the strangler pattern. New modules were created
first, the 14 consumer import sites migrated one by one, then the service and its
re-export shim were deleted. The outer-loop acceptance test stayed RED during the
refactoring and is GREEN at the end. `yarn verify` passes (typecheck + lint + 3869
tests).

Per the USER OVERRIDE in the amended plan (D6, D7), BOTH the Zod schema/guard and the
`GetProjectStatsUseCase` were implemented (DoD-literal), not declined.

---

## Files created (10)

| File | Layer | Purpose |
|------|-------|---------|
| `src/modules/statistics-insights/entities/stats/projectStats.schema.ts` | entity | Zod `reviewStatsSchema` + `projectStatsSchema` (byte-identical shape) |
| `src/modules/statistics-insights/entities/stats/projectStats.guard.ts` | entity | `createGuard` → `isValidProjectStats`, `safeParseProjectStats` |
| `src/modules/statistics-insights/entities/stats/reviewOutput.parser.ts` | entity | `parseReviewOutput` + `parseCategoriesSegment` (moved verbatim) |
| `src/modules/statistics-insights/entities/stats/reviewDuration.format.ts` | entity | `formatReviewDuration` (moved; inward so `keyInsights.ts` can consume it) |
| `src/modules/statistics-insights/usecases/stats/addReviewStats.usecase.ts` | usecase | `AddReviewStatsUseCase` (aggregation + 100-cap + `?? createEmptyStats()`) |
| `src/modules/statistics-insights/usecases/stats/getProjectStats.usecase.ts` | usecase | `GetProjectStatsUseCase` (returns `ProjectStats \| null`, no empty fallback) |
| `src/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.ts` | presenter | `StatsSummaryPresenter` (duration formatting + trend calc) |
| `src/tests/units/entities/stats/projectStats.schema.test.ts` | test | schema validation (5) |
| `src/tests/units/entities/stats/reviewOutput.parser.test.ts` | test | parser (11) |
| `src/tests/units/entities/stats/reviewDuration.format.test.ts` | test | formatter (3) |
| `src/tests/units/usecases/stats/addReviewStats.usecase.test.ts` | test | use case (14) |
| `src/tests/units/usecases/stats/getProjectStats.usecase.test.ts` | test | use case (2) |
| `src/tests/units/interface-adapters/presenters/statsSummary.presenter.test.ts` | test | presenter (11) |
| `src/tests/acceptance/80-split-stats-service.acceptance.test.ts` | acceptance | outer-loop SDD gate (14) |

(7 production/test source files + 7 test files = 14 new files.)

## Files modified (15)

- `src/modules/statistics-insights/entities/stats/projectStats.ts` — types repointed to `z.infer`; `createEmptyStats()` promoted here.
- `src/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.ts` — boundary validation via `safeParseProjectStats` with LENIENT fallback (never throws; old stats.json still loads).
- `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` — `getStatsSummary` → `StatsSummaryPresenter`; `loadProjectStats` → `GetProjectStatsUseCase` (both call sites; null-on-miss preserved).
- `src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts` — `formatReviewDuration` repointed to entity.
- `src/modules/statistics-insights/entities/stats/keyInsights.ts` — `formatReviewDuration` repointed to entity (inward).
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — `parseReviewOutput` repointed.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — `parseReviewOutput` repointed.
- `src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` — `parseReviewOutput` repointed.
- `src/frameworks/claude/claudeInvoker.ts` — `addReviewStats` → `AddReviewStatsUseCase(deps.statsGateway).execute` (parse first); `statsGateway: StatsGateway` threaded into `ClaudeInvokerDependencies` + default factory (sc. 16).
- `src/main/dependencies.ts` — `StatsGateway` type repointed to entities (shim no longer imported).
- `src/tests/factories/persistedInsightsData.factory.ts` — `ReviewStats` type repointed.
- `src/tests/units/usecases/insights/{buildAiInsightsPrompt,computeDeveloperInsights,computeInsightsWithPersistence,insightLevelComputation.service}.test.ts` — `ReviewStats` type repointed (4 files).
- `src/tests/units/modules/statistics-insights/gateways/stats.fileSystem.test.ts` — added lenient-load test case.
- `src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts` — repointed to use case + gateway (kept GREEN).
- `src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts` — repointed to use case + gateway (kept GREEN).
- `docs/feature-tracker.md` — spec-80 → implemented.

## Files deleted (6)

- `src/modules/statistics-insights/services/statsService.ts` (the God Object)
- `src/modules/statistics-insights/interface-adapters/gateways/stats.gateway.ts` (re-export shim)
- `src/tests/units/services/statsService.addReview.test.ts`
- `src/tests/units/services/statsService.branches.test.ts`
- `src/tests/units/services/statsService.category.test.ts`
- `src/tests/units/services/statsService.summary.test.ts`

(Coverage from the 4 deleted unit tests was relocated: parser cases → `reviewOutput.parser.test.ts`;
addReview + category cases → `addReviewStats.usecase.test.ts` (now InMemory-gateway-backed, no real fs);
summary/trend cases → `statsSummary.presenter.test.ts`; formatReviewDuration cases →
`reviewDuration.format.test.ts`. The old load/save edge-branch tests covered the deleted service's
fs functions — that behavior is now owned and tested by `FileSystemStatsGateway`.)

---

## Tests

- New/touched spec-80 suites: **13 test files, 107 tests, all passing.**
- Full suite (`yarn verify`): **466 test files, 3869 tests, all passing.**

| New test file | Tests |
|---------------|-------|
| `reviewOutput.parser.test.ts` | 11 |
| `projectStats.schema.test.ts` | 5 |
| `reviewDuration.format.test.ts` | 3 |
| `addReviewStats.usecase.test.ts` | 14 |
| `getProjectStats.usecase.test.ts` | 2 |
| `statsSummary.presenter.test.ts` | 11 |
| `80-split-stats-service.acceptance.test.ts` | 14 |
| `stats.fileSystem.test.ts` (added lenient case) | 9 |
| `47-...acceptance.test.ts` (kept GREEN) | 7 |
| `203-...acceptance.test.ts` (kept GREEN) | 8 |

---

## Self-review

Reread every new source file against the criteria. 1 review-fix iteration:

| Violation found | Fix |
|-----------------|-----|
| `projectStats.ts` schema import flagged `consistent-type-imports` (used only in `typeof`) | changed to `import type` |
| `statsSummary.presenter.ts present()` 38 lines (> soft 30 limit) | extracted `computeTrend` + `averageScoreOf` + `averageBlockingOf` helpers (behavior preserved) |
| 9 files failed `oxfmt --check` | ran `yarn format` |

Checklist after fixes:
- **Naming**: full words, camelCase + domain suffixes. OK.
- **Imports**: `@/` alias + `.js` everywhere; no relative imports; no barrel. OK.
- **TypeScript**: no `any`, no `as Type` assertions, no `!` non-null. The lenient gateway fallback uses the typed-annotation JSON pattern (`const stats: ProjectStats = JSON.parse(...)`), not an assertion. OK.
- **Dependency rule**: entities ← usecases ← interface-adapters ← frameworks. `formatReviewDuration` lives in entities so the `keyInsights.ts` entity points inward. OK.
- **Tests**: factories used (`ProjectStatsFactory`, `ReviewStatsFactory`, `DiffStatsFactory`); only I/O mocked via `InMemoryStatsGateway`; state-based assertions. OK.
- **Domain**: `null` for absence; optional fields kept `.optional()` for backward compat.

No remaining violations.

---

## Acceptance test

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/80-split-stats-service.acceptance.test.ts
  status: GREEN (14/14)
```

RED throughout the strangler implementation (future modules absent), GREEN at the final step.
Includes an executable Definition-of-Done gate asserting zero `services/statsService` imports
remain in `src/`.

---

## Scenario → test coverage

| Scenario | Status | Covered by |
|----------|--------|-----------|
| 1 ReviewStats in entities | OK | already in entities; Zod schema added; acceptance DoD gate |
| 2 ProjectStats in entities | OK | already in entities; Zod schema added; acceptance DoD gate |
| 3 StatsGateway in entities | OK | already in entities; shim deleted |
| 4 parseReviewOutput structured | OK | `reviewOutput.parser.test.ts`, acceptance |
| 5 parseReviewOutput summary | OK | `reviewOutput.parser.test.ts`, acceptance |
| 6 parseReviewOutput inline markers | OK | `reviewOutput.parser.test.ts`, acceptance |
| 7 parseReviewOutput empty | OK | `reviewOutput.parser.test.ts`, acceptance |
| 8 AddReviewStats records review | OK | `addReviewStats.usecase.test.ts`, acceptance |
| 9 AddReviewStats 100-review cap | OK | `addReviewStats.usecase.test.ts`, acceptance |
| 10 AddReviewStats null-score average | OK | `addReviewStats.usecase.test.ts`, acceptance |
| 11 Presenter duration formatting | OK | `statsSummary.presenter.test.ts`, `reviewDuration.format.test.ts`, acceptance |
| 12 Presenter score trend up | OK | `statsSummary.presenter.test.ts`, acceptance |
| 13 Presenter insufficient data → stable | OK | `statsSummary.presenter.test.ts`, acceptance |
| 14 stats.json backward compatible | OK | `stats.fileSystem.test.ts` (lenient), acceptance (old-format fixture), #47 |
| 15 stats.routes uses presenter | OK | `getProjectStats.usecase.test.ts`, acceptance (GET /api/stats shape + null-on-miss) |
| 16 claudeInvoker uses use case | OK | `claudeInvoker.ts` wired; `statsGateway` threaded; standalone `addReviewStats` deleted |

---

## yarn verify

```
EXIT=0
Test Files  466 passed (466)
     Tests  3869 passed (3869)
```

typecheck OK, lint OK (0 errors; only pre-existing tracked-debt warnings), format OK, all tests pass.

---

## Out-of-scope flags (not addressed, per plan D8)

- `recalculateProjectStats.usecase.ts:17-30` inlines its own empty-stats literal. Now that
  `createEmptyStats()` lives in `entities/stats/projectStats.ts`, that literal could be deduped —
  a future cleanup, OUT OF SCOPE for #80.
