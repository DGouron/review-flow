# Run the real review when a parked request is confirmed

## Status: implemented

## Context

In semi-auto mode a review is parked and waits for a human to confirm it from the dashboard. Today confirming does nothing useful: the job finishes instantly without ever running the review. Confirming must actually run the full review — analysis and publication — even when the server has been restarted between parking and confirmation.

## Rules

- Confirming a parked review runs the full review, identical to one triggered automatically (same analysis and publication).
- Confirmation works even after a server restart: everything needed to run the review is kept alongside the parked request.
- The platform (GitLab or GitHub) and the kind of run (review or follow-up) are preserved from the original trigger.
- A review already queued or running cannot be started again: confirmation is refused.
- A parked review that no longer exists cannot be confirmed: confirmation is refused.
- A parked review whose project is no longer configured or is disabled cannot run: confirmation is refused.
- Once the review has started, the parked request leaves the waiting list.

## Scenarios

- confirmed runs review: {parked request exists, project configured, no active run for it} → status "confirmed" + the review runs
- survives restart: {parked request exists after a server restart, project configured} → status "confirmed" + the review runs
- follow-up preserved: {parked request is a follow-up} → status "confirmed" + a follow-up review runs
- already running: {parked request exists, a run is already queued or running for it} → reject "Cette review est déjà en cours"
- unknown request: {parked request does not exist} → reject "Cette review en attente est introuvable"
- project no longer available: {parked request exists, its project is disabled or removed} → reject "Le projet associé n'est plus configuré"

## Out of Scope

- Dashboard feedback for the confirm action (toasts, double-click guard, message on a second click) — separate concern (A-ux).
- The automatic (full-auto) trigger path, which already runs reviews correctly.
- Any new confirmation UI or new button.
- Automatic retry if the review fails *after* it has started — that is handled by the normal review lifecycle, not by the parked request.

## Glossary

| Term | Definition |
|------|------------|
| Parked review (pending review) | A review held in semi-auto mode, waiting for a human to confirm before it runs. |
| Confirmation | The human action (from the dashboard) that approves running a parked review. |
| Semi-auto mode | Trigger mode where reviews are parked and require human confirmation before running. |
| Run / review run | The full execution: analysis by the assistant plus publication of the result on the merge/pull request. |

## Implementation

**Artefacts**: confirm use case (`project-not-configured` variant + injected `isProjectRunnable`), `ProcessorRegistry` instantiated at the composition root with GitLab + GitHub builders registered at boot, `buildGitHubReviewProcessor` extracted from the inline controller closure (full-auto behaviour unchanged), HTTP route status mapping.

**Endpoint**: POST `/api/pending-reviews/:id/confirm` → ConfirmPendingReviewUseCase — 200 confirmed · 404 not-found · 409 already-running · 422 project-not-configured (French messages).

**Decisions**: confirmation rebuilds the real processor from the persisted snapshot via the registry (survives a server restart); GitHub repo resolved via `findRepositoryByProjectPath(job.projectPath)` — no schema change, no migration; the V0 no-op `resolveProcessor` was removed.

See [report](../reports/202-confirm-pending-review-runs-review.report.md).

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | A-ux (dashboard feedback) is a separate spec; full-auto path untouched. |
| Negotiable | OK | Only the behaviour is fixed; how the run context is rebuilt is left to implementation. |
| Valuable | OK | Makes semi-auto mode actually usable — confirming finally runs the review. |
| Estimable | WARN | Rebuilding the run context after a restart (from persisted data only) is the grey zone to size carefully. |
| Small | WARN | Touches the confirmation use case, the run-context rebuild, and composition wiring; expected 1-3 TDD sessions, under 15 files, but at the upper bound. |
| Testable | OK | Every rule maps to a scenario. |

Verdict: READY — WARN on Estimable/Small to monitor during planning.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.
