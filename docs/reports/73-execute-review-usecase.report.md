# Report — SPEC-073 Stage 1: Extract `executeReview` Use Case

> Scope: **Stage 1 ONLY**. Stages 2-4 (handleClose, ProcessWebhook orchestrator,
> WebhookEvent discriminated union, full controller thinning) are OUT OF SCOPE and were
> not implemented.

## Summary

Extracted the duplicated review-execution block (create context → invoke Claude → track
progress → execute post-review actions → record stats → notify) from the 4 processor paths
(GitLab review + followup, GitHub review + followup) into a single function-based use case
`executeReview`. The GitHub review dual-action-execution bug is fixed: it now runs a single
primary/fallback path (context actions primary, stdout markers fallback) instead of both.

All 4 processor paths now delegate to one `executeReview` instance per platform, wired in the
composition root (`src/main/routes.ts` + `src/main/executeReviewWiring.ts`).

## Architecture decisions honoured (from plan RESOLVED DECISIONS)

1. Fallback executor = `dispatchConstrainedActions` for BOTH platforms (GitHub's legacy
   `executeThreadActions` fallback dropped). GitHub gains the constrained chokepoint.
2. Action executors injected as plain fns (`executeContextActions`, `executeFallbackActions`)
   — no `ReviewActionExecutor` port.
3. `ClaudeReviewInvoker` = small named port carrying `ClaudeReviewResult`
   (`entities/review/claudeReviewInvoker.gateway.ts`).
4. Only bug fixed = GitHub review dual execution. Throw behaviour unchanged (all paths still
   throw on failure, via caller mapping `{status:'failed'}` → `throw`).
5. Per-site thread-fetch strategy preserved via injected `resolveThreads`
   (GitLab review = pinned target, GitLab followup = pinned threads, GitHub = plain),
   branching on `input.isFollowup`. GitHub NOT upgraded to pinning.

### Note on the GitHub inventory gateway (deviation, justified)

Decision #1 (use `dispatchConstrainedActions` for GitHub) requires a `ThreadInventoryGateway`,
but none exists for GitHub and building a real one (a GitHub threads API paginator) is a new
gateway implementation — explicitly out of Stage-1 scope. Resolution: a thin composition-root
adapter (`buildGitHubInventoryGateway`) derives the authenticated thread-id set from the
existing `GitHubThreadFetchGateway` (the same authenticated source used to build the context),
returned as one complete page. This honours decision #1's constrained-dispatch chokepoint
without a new platform API client. It lives only in the "dirty" wiring layer, not as a new
gateway contract/file.

## Files created

- `src/modules/review-execution/entities/review/claudeReviewInvoker.gateway.ts` — `ClaudeReviewInvoker` port + `ClaudeReviewResult` + `ReviewProgressCallback`.
- `src/modules/review-execution/entities/progress/progressWatcher.gateway.ts` — `ProgressWatcher` port.
- `src/modules/review-execution/usecases/executeReview.usecase.ts` — the use case + `ExecuteReview`/`ExecuteReviewInput`/`ExecuteReviewResult`/`ExecuteReviewDependencies`.
- `src/main/executeReviewWiring.ts` — composition-root factory `buildExecuteReview` + `buildGitHubInventoryGateway` (adapters wrapping websocket/claude/queue/services).
- `src/tests/stubs/claudeReviewInvoker.stub.ts`
- `src/tests/stubs/progressWatcher.stub.ts`
- `src/tests/stubs/diffMetadataFetch.stub.ts`
- `src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts`
- `src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts`
- `docs/reports/73-execute-review-usecase.report.md`

## Files modified

- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — both processors (review + followup) delegate to `deps.executeReview`; dead imports removed; `executeReview` added to deps interface; unused handler destructures trimmed.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — same; the dual-execution review bug removed (now primary/fallback once).
- `src/main/routes.ts` — builds `gitLabExecuteReview` / `gitHubExecuteReview` once; passes them into both processor builders and both controller deps bundles.
- `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` — migrated processor/DI tests to the delegated pattern; added `executeReview` mock.
- `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` — same.
- `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` — added `executeReview` to deps helper.
- `src/tests/acceptance/200-webhook-event-idempotency.acceptance.test.ts` — same.
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/gitlabIdempotency.controller.test.ts` — same.

## Test counts

- `executeReview` unit test: 9 passed.
- Acceptance test (`73-execute-review-usecase`): 6 passed.
- GitLab controller test: 47 passed. GitHub controller test: passing.
- Full suite: **465 files / 3865 tests passed, 0 failed**.

## `yarn verify` result

`VERIFY_EXIT=0` — typecheck (tsc --noEmit) clean, lint (oxlint) warnings only (no errors;
size/param warnings are tracked debt per project convention), format check (oxfmt --check)
clean, `vitest --run` → 465 files / 3865 tests passed.

```
Test Files  465 passed (465)
     Tests  3865 passed (3865)
```

## Acceptance test status

**GREEN.** Covers the Stage-1 DoD: one shared `executeReview` drives GitLab review + followup
and GitHub review; GitHub review runs context-primary / stdout-fallback once (regression guard
asserts NOT-both); failure returns `{status:'failed'}` so the caller throws for queue retry;
cancelled returns without recording stats.

## Self-review

- Iterations: 1 (no violations found in new files).
- Violations found / fixed: 0 in new files. Checked: no `any` / `as Type` / non-null `!`,
  no relative imports (all `@/` + `.js`), `null` for absence, full words, English throughout.
- Pre-existing lint warnings (max-lines / max-params / max-depth) remain on the large
  controllers and on `executeReview` itself; these are warnings (tracked debt), not errors,
  and `yarn verify` passes. Not addressed to avoid over-engineering / scope creep.

## DoD items met

- One `executeReview` drives all 4 processor paths. ✅
- GitHub review no longer runs both executors (regression test). ✅
- Unit test covers: review success (primary), no-context→fallback (not both), followup
  success (syncThreads + threadsClosed count), cancelled (no stats), failure (returns failed),
  thread-fetch failure (best-effort), diff-metadata failure (best-effort), progressWatcher
  start/stop around invoke. ✅
- Controllers compile; their tests pass on the delegated pattern. ✅
- `routes.ts` wires the deps bundle for both platforms. ✅
- `yarn verify` passes. ✅

## DoD items NOT met

None for Stage 1. (Stages 2-4 are intentionally out of scope.)
