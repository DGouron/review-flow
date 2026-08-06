# Report — 224 Apply the review labels on follow-up reviews too

Spec: [docs/specs/224-followup-review-labels.md](../specs/224-followup-review-labels.md)

## Outcome

A follow-up review now runs the exact same platform-label lifecycle as an initial review: stale
`review-done` removed, `review-in-progress` applied before Claude is invoked, `review-done` applied
on completion, `review-in-progress` cleared on every terminal state.

Before this change a follow-up kept `review-done` visible for its whole duration and showed no
in-flight signal — the blind spot spec 221 was written to close, still open on the path where the
author is actively waiting.

## What changed

- **Use case (modified)**: `src/modules/review-execution/usecases/executeReview.usecase.ts` — the
  `if (input.isFollowup) return runAndMarkDone(...)` early return was removed, so both paths go
  through `markReviewInProgress` → `try/finally` → `clearReviewInProgress`. Doc comment updated.
- **Acceptance test (new)**: `src/tests/acceptance/224-followup-review-labels.acceptance.test.ts` —
  7 tests covering both platforms, the three terminal states, and the best-effort guarantee.
- **Acceptance test (modified)**: `221-review-in-progress-label.acceptance.test.ts` — the
  "follow-up reviews are untouched" block now asserts the shared lifecycle.
- **Acceptance test (modified)**: `222-review-done-label.acceptance.test.ts` — the follow-up test
  asserts the full 6-command sequence instead of the done-only pair.
- **Unit test (modified)**: `executeReview.usecase.test.ts` — two follow-up label expectations
  flipped to the new behavior.
- **Specs (modified)**: 221 and 222 carry strike-through notes on the rules superseded here.

No gateway, no use case, no label, and no wiring was added — `MarkReviewInProgressUseCase` already
handled the stale-`review-done` removal, so the follow-up path inherited the full invariant for free.

## Decisions

- Deleting the branch rather than adding a flag: after the change both paths are byte-identical, so a
  parameter would only re-encode a distinction the product no longer makes.
- The follow-up path reuses `MarkReviewInProgressUseCase` unchanged, which means it also removes a
  stale `review-done` first. That is required, not incidental: without it the merge request would
  carry both labels for the duration of the run.
- `isFollowup` stays in `runReviewPipeline` — it still drives notifications, `syncThreads`, and
  `threadsOpened`. Only the label gate was dropped.

## Verification

- `yarn verify` — typecheck, lint, and the full test suite.
- Label command sequences are asserted at the CLI-string level for both `gh` and `glab`; they were
  not exercised against a live platform (same caveat as spec 221).
