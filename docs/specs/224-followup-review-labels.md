# Apply the review labels on follow-up reviews too

## Status: implemented

## Context

Spec [221-review-in-progress-label](221-review-in-progress-label.md) added `review-in-progress`,
applied before Claude runs and cleared on every terminal state, and deliberately scoped it to the
**initial** review. Spec [222-review-done-label](222-review-done-label.md) added the neutral
`review-done` label and did extend it to follow-ups.

The result is asymmetric: a follow-up run leaves the merge request carrying `review-done` for its
whole duration. Anyone looking at the MR/PR while corrections are being re-reviewed sees a stale
"reviewed" signal and no sign that a run is in flight — exactly the blind spot spec 221 was written
to close, reintroduced on the path where it matters most (the author has just pushed and is waiting).

This feature drops the `isFollowup` gate: a follow-up run goes through the same label lifecycle as an
initial review. It supersedes the "follow-up reviews neither apply nor remove the label" rule of spec
221 and the "a follow-up review does not remove `review-done` at start" rule of spec 222.

No new gateway, no new use case, no new label: only the branch in `executeReview` that skips the
in-progress lifecycle for follow-ups is removed.

## Rules

- a follow-up review applies `review-in-progress` before Claude is invoked, exactly as an initial
  review does — ensure the label exists on the project, then add it to the merge request
- a follow-up review removes a stale `review-done` before applying `review-in-progress`, so the two
  labels are never both present (same invariant as spec 222, now enforced on both paths)
- a follow-up review removes `review-in-progress` when it reaches any terminal state — `completed`,
  `cancelled`, or `failed` — including on an unexpected throw
- a follow-up review that reaches `completed` still applies `review-done`, unchanged from spec 222
- a cancelled or failed follow-up applies no `review-done`, unchanged from spec 222
- label operations stay best-effort on the follow-up path: any failure is logged as a warning and
  **never** changes the `ExecuteReviewResult`
- the initial-review label lifecycle is unchanged in every respect

## Scenarios

- follow-up starts: {follow-up job, GitLab} → stale `review-done` removed, `review-in-progress`
  ensured then applied, all before `claudeInvoker.invoke` is called
- follow-up starts: {follow-up job, GitHub} → same, via `gh`
- follow-up completes: {follow-up job, Claude succeeds} → `review-done` ensured then applied, then
  `review-in-progress` removed, result `completed` with unchanged stats
- follow-up cancelled: {follow-up job, run aborted} → `review-in-progress` removed, no `review-done`
  applied, result `cancelled`
- follow-up fails on invocation: {follow-up job, Claude exits non-zero} → `review-in-progress`
  removed, no `review-done` applied, result `failed` with the same reason as today
- follow-up fails on unreadable context: {follow-up job, context file unreadable after the run} →
  `review-in-progress` removed, no `review-done` applied, result `failed` with
  `CONTEXT_UNREADABLE_REASON`
- apply fails on a follow-up: {follow-up job, ensure or add throws} → warning logged, Claude still
  invoked, review outcome identical to a run without the feature
- initial review unchanged: {initial review job} → same command sequence as spec 222 records today

## Out of Scope

- Making either label name configurable per project
- A verdict-bearing label (`review-passed` / `review-blocked`)
- A `review-failed` label for broken runs
- Removing `review-done` when the merge request is merged or closed
- Reconciling labels left over from a daemon crash mid-review (no startup sweep, same as spec 221)
- Exposing label state on the dashboard

## Glossary

| Term | Definition |
|------|------------|
| follow-up review | The run triggered by a push on a merge request that already carries an initial review with open threads (`isFollowup === true`) |
| label lifecycle | Remove stale `review-done` → apply `review-in-progress` → apply `review-done` on completion → remove `review-in-progress` |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Touches one branch in `executeReview`; no gateway, use case, or label added |
| Negotiable | OK | Nothing left open — the initial-review lifecycle is the reference |
| Valuable | OK | Removes the stale "reviewed" signal while a follow-up is in flight |
| Estimable | OK | 1 modified use case, 1 acceptance test, updates to specs 221/222 tests |
| Small | OK | ~5 files including tests |
| Testable | OK | Each rule maps to a scenario; assertions are CLI-command sequences |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Use case (modified)**: `executeReview.usecase.ts` — the `isFollowup` early return was removed, so
  both paths run `markReviewInProgress` → `try/finally` → `clearReviewInProgress`.
- **Tests**: new acceptance suite for this spec; the follow-up expectations of the spec 221 and 222
  suites and of `executeReview.usecase.test.ts` were flipped to the shared lifecycle.

### Decisions

- Deleting the branch rather than gating it behind a flag: both paths are now identical, so a
  parameter would re-encode a distinction the product no longer makes.
- The follow-up path reuses `MarkReviewInProgressUseCase` unchanged, so it also drops a stale
  `review-done` first — required to keep the never-both-labels invariant on this path.

Full report: [docs/reports/224-followup-review-labels.report.md](../reports/224-followup-review-labels.report.md).
