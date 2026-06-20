# Report — SPEC-073 Stage 2: Extract `handleClose` Use Case

> Scope: **Stage 2 ONLY**. Stage 1 (`executeReview`) was already done/committed. Stages 3
> (ProcessWebhook orchestrator + `WebhookEvent` union) and 4 (full controller thinning,
> HTTP reply-key unification) are OUT OF SCOPE and were not implemented.

## Summary

Extracted the duplicated MR/PR close-cleanup block from both webhook controllers into one
function-based use case `handleClose`. The block was structurally identical in both
controllers (cancel running job → archive tracking → delete review context → remove worktree
→ log → reply), diverging only on cosmetic naming (`gitlab-`/`github-` id prefix, log field
names). Both controllers' close handlers now delegate to `deps.handleClose(...)` and map its
result onto the existing per-platform HTTP reply (`mrNumber`/`prNumber`, `status: 'cleaned'`).

Merge/approve transitions were left untouched (already composed from `TransitionStateUseCase`,
per plan RESOLVED DECISION #3). The `RemoveWorktreeAction` type was moved to the worktree
entity layer (RESOLVED DECISION #2) so both controllers and the use case import it
inward-safely instead of each re-declaring it locally.

## Architecture decisions honoured (from plan RESOLVED DECISIONS)

1. `cancelJob` + `buildJobId` injected as plain fns — no `CancelJobPort`. The use case never
   imports `frameworks/queue`; `routes.ts` wires `cancelJob` and `createJobId` from the queue
   adapter.
2. `RemoveWorktreeAction` canonical type relocated to
   `worktree-management/entities/worktree/worktree.schema.ts`; the two local `export type`
   declarations in the controllers were removed and replaced with an inward-safe import.
3. Merge/approve stay in the controllers — no `handleMerge`/`handleApprove` wrappers; those
   call sites are untouched.
4. GitHub merge asymmetry left as-is (a merged GitHub PR arrives as a close event → archived).
5. HTTP reply keys preserved (`mrNumber` for GitLab, `prNumber` for GitHub; `status: 'cleaned'`
   / `status: 'ignored'`) — not unified (Stage 4).

## The reconciled single copy

`handleClose(input, deps)` performs, in order, all best-effort and independently reported:

1. `jobCancelled = deps.cancelJob(deps.buildJobId(platform, projectPath, mergeRequestNumber))`
2. `trackingArchived = deps.trackingGateway.archive(localPath, mergeRequestId)`
3. `contextDeleted = deps.reviewContextGateway.delete(localPath, mergeRequestId).deleted`
4. worktree removal in try/catch, warn-only (failure status warns; a thrown error warns) —
   removal never fails the cleanup
5. one info log, then returns `{ status: 'cleaned', jobCancelled, trackingArchived, contextDeleted }`

`mergeRequestId = ` `${platform}-${projectPath}-${mergeRequestNumber}` is built inside the use
case — the single platform branch driver, only changing the id prefix and worktree identity
platform. Config lookup (`findRepositoryByProjectPath` / `findRepositoryByRemoteUrl`) stays in
the controller; the controller passes the resolved `localPath` in.

## Files created

- `src/modules/review-execution/usecases/handleClose.usecase.ts` — the use case +
  `HandleClose` / `HandleCloseInput` / `HandleCloseResult` / `HandleCloseDependencies`.
- `src/tests/units/modules/review-execution/usecases/handleClose.usecase.test.ts` — 10 unit tests.
- `src/tests/acceptance/73-handle-close.acceptance.test.ts` — 4 acceptance tests (SDD outer loop).
- `docs/reports/73-handle-close.report.md` — this report.

## Files modified

- `src/modules/worktree-management/entities/worktree/worktree.schema.ts` — added the canonical
  `RemoveWorktreeAction` type.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts`
  — close handler delegates to `deps.handleClose`; `handleClose` added to the deps interface;
  `RemoveWorktreeAction` imported from the entity (local declaration removed); dead `cancelJob`
  import dropped (`createJobId` kept — used by enqueue/followup paths); now-unused
  `trackingGateway` positional param renamed `_trackingGateway`.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts`
  — same set of changes.
- `src/main/routes.ts` — imports `createJobId` + `handleClose`; binds `handleClose` into BOTH
  controller deps bundles (reusing the existing `removeWorktreeAction`, `trackingGw`,
  `deps.reviewContextGateway`, `cancelJob`, `createJobId`, `deps.logger`).
- `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` — added a
  `handleClose` mock to default deps; rewrote close-path tests to assert delegation to
  `handleClose` and result→reply mapping; the unconfigured-repo test now asserts `handleClose`
  is NOT called.
- `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` — same.
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/gitlabIdempotency.controller.test.ts`
  — added `handleClose` to mock deps.
- `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` — added
  `handleClose` to deps helper.
- `src/tests/acceptance/200-webhook-event-idempotency.acceptance.test.ts` — same.
- `docs/feature-tracker.md` — added the Stage 2 report link (status stays `implementing`:
  Stages 3-4 remain).

## Test counts

- `handleClose` unit test: 10 passed.
- Acceptance test (`73-handle-close`): 4 passed.
- All impacted files together (handleClose unit + acceptance + both controller tests +
  idempotency test + acceptance 197/200): 7 files / 118 tests passed.
- Full suite: **467 files / 3879 tests passed, 0 failed** (Stage 1 baseline was 465 / 3865;
  +2 files, +14 tests).

## `yarn verify` result

`EXIT=0` — typecheck (`tsc --noEmit`) clean, lint (oxlint) warnings only (no errors; the
max-lines/max-params warnings are pre-existing tracked debt, none on `handleClose`), format
check (`oxfmt --check`) clean.

```
All matched files use the correct format.
 Test Files  467 passed (467)
      Tests  3879 passed (3879)
```

## Acceptance test status

**GREEN.** Covers the Stage-2 DoD:
- one shared `handleClose` drives both GitLab MR close and GitHub PR close;
- cleanup performs cancel job + archive tracking + delete context + remove worktree;
- worktree removal failure (status `failed`) and a thrown error both still return `cleaned`;
- each effect reports its own outcome independently (`jobCancelled` / `trackingArchived` /
  `contextDeleted`).

The unconfigured-repo branch (controller replies `200 ignored` WITHOUT invoking `handleClose`)
and merge/approve no-regression are asserted in the controller unit tests.

## Self-review

- Iterations: 1 review-fix loop.
- Violations found / fixed: 1 — my two new test files initially used `as never` to seed a
  minimal review context into the stub gateway; replaced with `ReviewContextFactory.create({
  mergeRequestId })` (factory usage, no type assertion). Re-ran `yarn verify` → still green.
- Verified on the new use case + new tests: no `any`, no `as Type` assertions, no non-null `!`,
  no relative imports (all `@/` + `.js`), `null`/explicit booleans for absence, full words,
  English throughout, no barrel exports. The use case imports only entity contracts +
  injected deps/fns (Dependency Rule respected; no `interface-adapters/` or `frameworks/`
  imports).
- Confirmed no dangling references to the removed local `RemoveWorktreeAction` exports; both
  controllers now import it from the entity layer.
- Pre-existing lint warnings (max-lines / max-params) on the large controllers remain; not
  addressed (out of scope / tracked debt). `yarn verify` passes regardless.

## DoD items met

- One `handleClose` drives both controllers' close paths; the 4 effects happen once in the use
  case. ✅
- Unit test covers: cleaned happy path, job-not-found (`jobCancelled` false),
  tracking-not-found (`trackingArchived` false), context-absent (`contextDeleted` false),
  worktree removal failure (warn + still cleaned), worktree removal throws (warn + still
  cleaned), `buildJobId` args, gitlab-prefixed id + identity, github-prefixed id + identity. ✅
- Both controllers compile; existing tests pass on the delegated pattern (+ `handleClose`
  mocks). ✅
- `routes.ts` wires `handleClose` for both platforms. ✅
- `yarn verify` passes (EXIT=0). ✅

## DoD items NOT met

None for Stage 2.

## Notes / deviations

- The `trackingGateway` 4th positional param of both `handleGitLabWebhook` /
  `handleGitHubWebhook` became unused after the close block (its only caller) moved into the
  use case. Removing the param would change the controller signatures and ripple to `routes.ts`
  and every controller-test call site — out of Stage-2 scope. Renamed to `_trackingGateway`
  (the codebase's established underscore-prefix convention for intentionally-unused params,
  e.g. `_job` already in these controllers) to satisfy `noUnusedParameters`. Stage 4 (controller
  thinning) can drop the param if desired.
