# Signal a finished review with a platform label

## Status: implemented

## Context

Spec [221-review-in-progress-label](221-review-in-progress-label.md) added the `review-in-progress`
label, applied before Claude runs and removed on every terminal state. It explicitly left
"a distinct label per outcome" out of scope.

This feature adds the counterpart signal: once a review has actually produced a verdict, the merge
request carries `review-done`. It stays deliberately **neutral** — it says "an automated review ran
to completion here", not whether the code passed. The verdict itself already lives in the posted
report and in the recorded stats; duplicating it as a label would need a second signal to be kept
truthful on every re-review, for no added information.

Unlike the in-progress label, `review-done` is applied by **both** initial reviews and follow-up
reviews: the follow-up is the run that verifies corrections, so its completion is the most current
statement that a review happened.

## Rules

- the label name is the domain constant `review-done` — not configurable, sibling of
  `review-in-progress`
- when a review reaches the `completed` terminal state, ReviewFlow ensures the label exists on the
  project and then applies it to the merge request
- this applies to initial reviews **and** follow-up reviews — unlike `review-in-progress`, which
  stays initial-only
- a `cancelled` or `failed` run applies nothing: no verdict was produced, so there is nothing to
  signal
- when an initial review starts, `review-done` is removed before `review-in-progress` is applied —
  a merge request must never carry both labels at once
- ~~a follow-up review does not remove `review-done` at start (it does not set `review-in-progress`
  either, so the two labels cannot collide)~~ — superseded by
  [224-followup-review-labels](224-followup-review-labels.md): a follow-up removes the stale
  `review-done` and sets `review-in-progress` like an initial review. Re-applying `review-done` on a
  merge request that already carries it stays a harmless no-op
- label operations stay best-effort: any failure is logged as a warning and **never** changes the
  `ExecuteReviewResult` — a review that completes still reports `completed` even if its label could
  not be applied
- both platforms are supported through the existing `ReviewLabelGateway`, with no new gateway
  operation

## Scenarios

- initial review completes: {initial review, Claude succeeds, actions executed} → `review-done`
  ensured then applied, `review-in-progress` removed, result `completed` with unchanged stats
- follow-up completes: {follow-up review, Claude succeeds} → `review-done` ensured then applied,
  result `completed` (since spec 224 the follow-up also carries `review-in-progress` while it runs)
- blocking issues found: {initial review completes, `blocking: 3`} → `review-done` applied all the
  same (the label is neutral), stats unchanged
- cancelled: {initial review aborted} → no `review-done` applied, `review-in-progress` still removed,
  result `cancelled`
- failed on invocation: {Claude exits non-zero} → no `review-done` applied, result `failed`
- failed on unreadable context: {context file unreadable after the run} → no `review-done` applied,
  result `failed`
- re-review of a done merge request: {initial review starts on a MR already carrying `review-done`}
  → `review-done` removed, then `review-in-progress` applied; the two labels are never both present
- apply fails: {review completes, ensure or add throws} → warning logged, result still `completed`
  with unchanged stats
- stale-removal fails: {initial review starts, removing `review-done` throws} → warning logged,
  `review-in-progress` still applied, Claude still invoked

## Out of Scope

- A verdict-bearing label (`review-passed` / `review-blocked`) or any label derived from `blocking`,
  `score` or `qualityThreshold`
- A `review-failed` label for broken runs (an infrastructure problem does not belong on the author's
  merge request)
- Making either label name configurable per project
- Removing `review-done` when the merge request is merged or closed
- Reconciling labels left over from a daemon crash mid-review (no startup sweep, same as spec 221)
- Exposing label state on the dashboard

## Glossary

| Term | Definition |
|------|------------|
| done label | The neutral `review-done` platform label stating that an automated review ran to completion on this merge request |
| verdict | The pass/block judgement, which lives in the posted report and recorded stats — deliberately **not** encoded in a label |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reuses the `ReviewLabelGateway` from spec 221; no new gateway operation |
| Negotiable | OK | Label colour left to implementation |
| Valuable | OK | Closes the loop opened by spec 221 — the MR shows both "under review" and "reviewed" |
| Estimable | OK | 1 constant, 1 use case, 1 modified use case, wrapper change, wiring |
| Small | OK | ~6 files including tests |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity (modified)**: `reviewLabel.ts` gained `REVIEW_DONE_LABEL`, sibling of
  `REVIEW_IN_PROGRESS_LABEL`. No gateway change — spec 221's `ReviewLabelGateway`
  (`ensureLabelExists` / `addLabel` / `removeLabel`) already covered every operation, and the two CLI
  implementations were not touched.
- **Use case (new)**: `MarkReviewDoneUseCase`
  (`src/modules/platform-integration/usecases/markReviewDone.usecase.ts`) — ensure then add, same
  non-throwing contract as its in-progress sibling.
- **Use case (modified)**: `MarkReviewInProgressUseCase` removes a stale `review-done` first, via a
  private `removeStaleDoneLabel` holding **its own** `try/catch`.
- **Use case (modified)**: `executeReview.usecase.ts` — new private `runAndMarkDone` wraps
  `runReviewPipeline` and marks done only on `completed`; called from both the follow-up and initial
  branches. `runReviewPipeline`'s body untouched.
- **Wiring**: `executeReviewWiring.ts` constructs and injects `MarkReviewDoneUseCase`. `routes.ts`
  needed no wiring change (import path only).

### Decisions

- A neutral label rather than a `review-passed` / `review-blocked` pair: a verdict pair needs the
  opposite label removed on every re-review to stay truthful, and duplicates the posted report.
- The stale-`review-done` removal lives in the mark-in-progress use case — "this merge request is now
  under review, not done" is one intention — and carries its own swallow so a removal failure cannot
  skip the in-progress label.
- Follow-ups apply `review-done` but never touch `review-in-progress`, so the two cannot collide on
  that path and no stale removal is needed there.
- Between the done-apply and the `finally` that clears the in-progress label, both are briefly
  present. Reversing the order would clear the in-progress label before the result is known, losing
  the `finally` guarantee against an unexpected throw.

Full report: [docs/reports/222-review-done-label.report.md](../reports/222-review-done-label.report.md).
