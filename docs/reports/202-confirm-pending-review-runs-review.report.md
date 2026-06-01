# Implementation Report — spec-202: Run the real review when a parked request is confirmed

**Date**: 2026-06-01
**Status**: Implemented
**Spec**: [202-confirm-pending-review-runs-review](../specs/202-confirm-pending-review-runs-review.md)
**Plan**: [202-confirm-pending-review-runs-review.plan](../plans/202-confirm-pending-review-runs-review.plan.md)

## Summary

Confirming a parked review from the dashboard now runs the real review (invokes Claude) instead of the V0 no-op, for both GitLab and GitHub, and survives a server restart. The fix is a wiring change plus one new reject rule — no new entity, no new gateway contract, no schema change, no migration.

## Root cause removed

`src/main/routes.ts` injected `resolveProcessor: () => async () => logger.warn('…V0 limitation')` — a no-op. Replaced with `resolveProcessor: (pending) => processorRegistry.resolve(pending)`. The previously-unused `ProcessorRegistry` is now instantiated at the composition root, with GitLab and GitHub processor builders registered at boot (keyed by platform × jobType × triggerSource). Builders close over gateways re-created at boot, so confirmation is driven entirely by the persisted `pending.job` snapshot and survives a restart.

## Artefacts

- **Use case** — `confirmPendingReview.usecase.ts`: new `project-not-configured` result variant + injected `isProjectRunnable` predicate, evaluated after not-found/already-running and **before** enqueue/delete (the pending request stays on the waiting list when rejected).
- **Service** — `ProcessorRegistry` instantiated and populated in `routes.ts`; the confirm wiring block was moved below `claudeInvokerDeps` and the egress scanner so builders have their gateways.
- **Controller** — extracted `buildGitHubReviewProcessor` from the inline closure in `github.controller.ts` into a curried `(deps, logger)(job)` builder mirroring `buildGitLabReviewProcessor`; full-auto path behaviour-identical (verified: 47/47 controller tests green). Added the same fail-closed `findRepositoryByProjectPath` guard GitLab already has.
- **HTTP route** — `pendingReviews.routes.ts`: `project-not-configured` → **422**, `not-found` → **404** with French body message.

## Endpoint

`POST /api/pending-reviews/:id/confirm` → `ConfirmPendingReviewUseCase`
- 200 `confirmed` · 404 `not-found` ("Cette review en attente est introuvable") · 409 `already-running` ("Cette review est déjà en cours") · 422 `project-not-configured` ("Le projet associé n'est plus configuré")

## Key decisions

- **clone_url**: GitHub repo resolved at confirm time via `findRepositoryByProjectPath(job.projectPath)` (owner/repo). No schema change, no migration — already-parked GitHub requests stay valid.
- **Project-not-configured** enforced in the use case (not in the processor) so the pending is preserved on reject.
- HTTP **422** for project-not-configured (distinct from the 409 transient "already running").

## Tests

- `yarn verify` GREEN: typecheck + lint + **3645 tests across 438 files**.
- Acceptance `202-confirm-pending-review-runs-review.acceptance.test.ts`: 6 scenarios × both platforms (10 cases), all GREEN.
- Unit: use case (project-not-configured reject), `ProcessorRegistry`, route (422 / 404 message), GitHub processor provenance (fail-closed pin).

## Spec coverage

| Rule / Scenario | Covering test |
|---|---|
| confirmed runs review | acceptance — confirmed runs review (GitLab + GitHub) |
| survives restart | acceptance — rebuilds from persisted snapshot only |
| follow-up preserved | acceptance — parked follow-up runs follow-up |
| already running | acceptance — rejects 409, never enqueues |
| unknown request | acceptance — rejects 404 |
| project no longer available | acceptance — rejects 422, keeps waiting list (GitLab + GitHub) |

## Self-review

0 iterations, 0 violations. Conventions respected (`@/`+`.js` imports, no `as`/`any` in production code, `null` for absence, French only for user-facing messages).

## Out of scope (follow-ups)

- A-ux: dashboard double-click guard + readable toasts + stop showing "Review confirmée" misleadingly.
