# Report — Signal a finished review with a platform label

Spec: [222-review-done-label](../specs/222-review-done-label.md)

## Status: implemented

`yarn verify` green: typecheck clean, format clean, 4322 tests / 513 files passing (+19 tests over
spec 221's baseline). No new lint warning.

## What was built

The `review-done` counterpart to spec 221's `review-in-progress`. Deliberately neutral: it states
that an automated review ran to completion, not whether the code passed. Encoding the verdict would
have required a second signal kept truthful on every re-review, for information already carried by
the posted report and the recorded stats.

Applied on the `completed` terminal state only, by **both** initial and follow-up runs — the
follow-up is the run that verifies corrections, so its completion is the most current statement that
a review happened. The in-progress label stays initial-only, unchanged.

No new gateway operation: the existing `ReviewLabelGateway` (`ensureLabelExists` / `addLabel` /
`removeLabel`) covered everything. The two CLI gateway implementations were not touched.

## Files

### New

- `src/modules/platform-integration/usecases/markReviewDone.usecase.ts` —
  `MarkReviewDoneUseCase`, mirroring `MarkReviewInProgressUseCase`: same dependency and input shapes,
  same non-throwing contract, ensure then add with `REVIEW_DONE_LABEL`.
- `src/main/githubInventoryWiring.ts` — see "Incidental fix" below.
- `src/tests/units/modules/platform-integration/usecases/markReviewDone.usecase.test.ts`
- `src/tests/acceptance/222-review-done-label.acceptance.test.ts` — GREEN, one test per spec
  scenario (9 scenarios).

### Modified

- `src/modules/platform-integration/entities/reviewLabel/reviewLabel.ts` — `REVIEW_DONE_LABEL`
  added as a sibling constant.
- `src/modules/platform-integration/usecases/markReviewInProgress.usecase.ts` — removes a stale
  `review-done` before ensuring/adding `review-in-progress`, via a private `removeStaleDoneLabel`
  with **its own** `try/catch`. The separate swallow is what makes the spec scenario
  "stale-removal fails → `review-in-progress` still applied" true; a single flat `try/catch` would
  have aborted the ensure/add.
- `src/modules/review-execution/usecases/executeReview.usecase.ts` — new private `runAndMarkDone`
  wraps `runReviewPipeline` and marks done only on `completed`. The exported `executeReview` calls it
  on both branches. `runReviewPipeline`'s body remains untouched.
- `src/main/executeReviewWiring.ts` — constructs and injects `MarkReviewDoneUseCase` from the
  existing `reviewLabelGateway` + `logger`.
- `src/main/routes.ts` — import path only (see below); no wiring change was needed, the gateway was
  already injected at both `buildExecuteReview` call sites.
- Extended stubs/assertions: `markReviewInProgress.usecase.test.ts`,
  `executeReview.usecase.test.ts`, `73-execute-review-usecase.acceptance.test.ts`,
  `221-review-in-progress-label.acceptance.test.ts`.

### Spec 221 assertions updated

Two assertions in `221-review-in-progress-label.acceptance.test.ts` changed, both intentional and
superseded by spec 222:

- the initial-review command sequences now start with the stale-`review-done` removal
  (`[REMOVE_STALE_DONE, ENSURE, ADD]` instead of `[ENSURE, ADD]`);
- the follow-up test no longer expects an empty command list — follow-ups now apply `review-done`.

## Incidental fix

`src/main/executeReviewWiring.ts` had crossed the 200-line oxlint `max-lines` threshold when spec 221
added the label gateway. That warning was introduced by spec 221 and missed at its commit. Fixed here
by moving `buildGitHubInventoryGateway` — which had nothing to do with execute-review wiring — into
its own `src/main/githubInventoryWiring.ts`, and updating the single importer (`routes.ts`). The
three remaining warnings in the file (`buildGitLabResolveThreads`, `buildExecuteReview` length) are
pre-existing debt.

## Decisions

- **Neutral label rather than a verdict pair.** `review-passed` / `review-blocked` was considered and
  rejected: it needs the opposite label removed on every re-review to stay truthful, and duplicates
  the report's judgement.
- **Stale removal lives in the mark-in-progress use case**, not in a third use case. "This merge
  request is now under review, not done" is one intention.
- **Follow-ups apply `review-done` but never touch `review-in-progress`.** They do not set the
  in-progress label, so the two cannot collide on that path, and no stale removal is needed there.

## Known limitations

- Between `markReviewDone` and the `finally` that clears `review-in-progress`, both labels are
  briefly present on a completing review. Reversing the order would mean clearing the in-progress
  label before the result is known, losing the `finally` guarantee that covers an unexpected throw.
  The window is one CLI call wide.
- On GitHub, removing a label that is absent returns 404 and logs a warning. A first-ever review of a
  merge request therefore logs one spurious stale-removal warning. Harmless; avoiding it would mean
  fetching the current label set first, one extra API call per review.
- The GitLab command forms remain unverified against a live instance (inherited from spec 221).
