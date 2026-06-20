# Implementation Report — SPEC-208 Self-service backfill button

> Spec: `docs/specs/208-self-service-backfill-button.md` · Plan: `docs/plans/208-self-service-backfill-button.plan.md`
> Status: **implemented** · Date: 2026-06-20

## Summary

The dashboard "Recalculate" button now actually backfills change-size data. Three wiring
defects were fixed and one missing aggregate was added; only one genuinely new file (a pure
git-remote parser) was created. The git side was reused from `setup-wizard`, not reinvented.

## Files

### Created

| File | Purpose |
|------|---------|
| `src/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.ts` | Pure `resolveProjectIdentifier(remoteUrl)` → `group/proj` \| `owner/repo` \| `null` |
| `src/tests/units/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.test.ts` | Parse-table unit tests |
| `src/tests/acceptance/208-self-service-backfill-button.acceptance.test.ts` | SDD outer loop (4 cases) |

### Modified

| File | Change |
|------|--------|
| `src/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.ts` | Store `diffStatsReviewCount` (RULE 4) |
| `src/modules/statistics-insights/usecases/stats/backfillDiffStats.usecase.ts` | Accept + forward `projectIdentifier` to gateway instead of local path (RULE 2) |
| `src/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.ts` | Thread `projectIdentifier`; guard requires platform + identifier (RULE 1) |
| `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` | Resolve platform/identifier from git remote; reject unresolvable with 422 (RULE 3); drop stale `repository.platform ?? null` |
| `src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts` | Param renamed to `projectIdentifier` (cosmetic; contract unchanged) |
| `src/main/routes.ts` | Inject `new GitRemoteCliGateway()` into `statsRoutes` |
| `src/tests/stubs/diffStatsFetch.stub.ts` | Capture `lastProjectIdentifier` / `fetchCallCount` for forwarding assertions |
| `src/tests/units/.../statsRecalculate.routes.test.ts`, `backfillDiffStats.usecase.test.ts`, `recalculateWithBackfill.usecase.test.ts`, `recalculateProjectStats.usecase.test.ts` | Adapted to new inputs + rejection cases |

## Tests

- `yarn verify`: **PASS** — typecheck clean, lint warnings only (pre-existing debt), format clean.
- **466 test files, 3878 tests passed**, 0 failed.

## Acceptance — GREEN

`src/tests/acceptance/208-self-service-backfill-button.acceptance.test.ts` — 4 cases:

1. GitLab project: backfill fetches + populates reviews, totals + `diffStatsReviewCount` correct.
2. Identifier (`group/proj`), not local path, reaches the gateway.
3. Remote missing → `422` + `Plateforme du projet introuvable`.
4. Nothing missing → no fetch, totals unchanged.

## Spec coverage

| Rule | Covered by |
|------|-----------|
| RULE 1 — resolve platform without manual config | `statsRecalculate.routes.test.ts` + acceptance case 1 |
| RULE 2 — fetch using project identifier, not local path | `projectIdentifier.test.ts` + `backfillDiffStats.usecase.test.ts` + acceptance case 2 |
| RULE 3 — reject unresolvable with clear message | `statsRecalculate.routes.test.ts` + acceptance case 3 |
| RULE 4 — recompute `diffStatsReviewCount` | `recalculateProjectStats.usecase.test.ts` + acceptance case 1 |
| RULE 5 — button populates → non-zero totals | acceptance case 1 |

## Decisions / notes

- Rejection status code **422** (validated by user).
- Resolver kept as a pure function (no Zod, no class) — YAGNI.
- `gitRemoteGateway` is an **optional** route option (backfill-only dep), consistent with the
  existing optional `diffStatsFetchGateways`. Fixed during orchestrator review: the implementer
  had made it required, which broke two unrelated GET-only stats-route test registrations.

## Remaining issues

None. Out-of-scope per spec: rendering additions/deletions in the dashboard, non-change-size
fields, platform inference for projects without a git remote.
