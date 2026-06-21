# Report — SPEC-073 Stage 4a: review-request enqueue tail inward

Plan: `docs/plans/73-stage4-controller-thinning.plan.md` (§2 Option A) · Spec: `docs/specs/73-extract-webhook-processing-usecase.md`

## Status: OK — `yarn verify` green, exit 0, 478 files / 3994 tests. **SPEC-073 closed.**

> Report authored by the orchestrator after the implementer agent completed the code and reached
> `yarn verify` green but came to rest before persisting its own report. All facts verified directly
> against the worktree tree.

## What shipped (Stage 4a — Option A, minimal honest extraction)

The review-request async enqueue **sequencing** (budget → actor trust → gate → enqueue + verdict
classification) is extracted into a new function-style usecase `processReviewRequest(input, deps)`.
Both controllers delegate BOTH their review-request tail AND their followup tail to it — **4
copy-pasted sites collapsed into 1**. The config-bound assembly (ReviewJob literal, processor closure,
`@/config` reads) and the WebSocket I/O (`broadcastBudgetExceeded`) stay controller-side per §7.

## Artefact

`src/modules/platform-integration/usecases/processReviewRequest.usecase.ts`:

```
ReviewRequestVerdict =
  | { type: 'budget-exceeded'; status: BudgetStatus }
  | { type: 'pending'; pendingId: string | null; reason?: 'untrusted-actor' }
  | { type: 'queued'; jobId: string }
  | { type: 'deduplicated'; jobId: string }
```

`ProcessReviewRequestDependencies` = `enforceBudget: Pick<EnforceBudgetUseCase,'execute'>`,
`gateClaudeInvocation?: GateClaudeInvocationUseCase`, `isTrustedActor?: IsTrustedActorUseCase`,
`enqueue: EnqueueReviewFunction`, `logger`. **No new single-implementation port invented** — every
dep is an already-existing usecase or the pre-existing `EnqueueReviewFunction` port (the queue was
already behind it inside `gateClaudeInvocation`).

Input: `{ job: ReviewJob, processor: GateClaudeInvocationProcessor, localPaths, actorUsername,
projectPath, gateActorTrust }`. GitLab passes `gateActorTrust:true`; GitHub review-request passes
`gateActorTrust:false` (GitHub has no actor-trust gate on review-request — preserved).

## 4-sites-into-1

| Site | Before | After |
|---|---|---|
| GitLab review-request tail | inline budget→trust→gate→enqueue | `processReviewRequest(...)` (gitlab.controller.ts:689) |
| GitLab followup tail | inline (duplicate) | `processReviewRequest(...)` (gitlab.controller.ts:566) |
| GitHub review-request tail | inline (duplicate) | `processReviewRequest(...)` (github.controller.ts:649) |
| GitHub followup tail | inline (duplicate) | `processReviewRequest(...)` (github.controller.ts:517) |

## What stayed controller-side (and why — §7)

- `findRepositoryBy{ProjectPath,RemoteUrl}` config lookup, `ReviewJob` literal + `assignedBy`/
  `sizeMetrics` assembly (reads `@/config` for skill/language).
- The processor closure (`buildGitLab/GitHubReviewProcessor`) — reads `@/config` + captures
  `executeReview`; cannot live in a platform-neutral usecase.
- `broadcastBudgetExceeded(...)` WebSocket I/O — usecase returns `budget-exceeded`, controller
  broadcasts. No `BudgetBroadcastPort` invented.
- Verdict → HTTP reply mapping — via the 4c `webhookReply` mapper.

## DoD verification

- **No raw `enqueueReview(` call remains in either controller** — verified by grep (the queue call
  now goes through the injected `enqueue` port inside `processReviewRequest` / `gateClaudeInvocation`).
- No inline budget-decision branching in controllers.

## Dependency Rule

`processReviewRequest` imports: `pino` Logger type; entities `ReviewJob`, `TriggerSource`,
`BudgetStatus`; sibling usecases `IsTrustedActorUseCase`, `EnforceBudgetUseCase`, and
`EnqueueReviewFunction`/`GateClaudeInvocationProcessor`/`GateClaudeInvocationUseCase` (from
`gateClaudeInvocation.usecase.ts`). **CLEAN** — no `interface-adapters/`, no `frameworks/`, no
`@/config`, no `GitLab*`/`GitHub*` type, no processor builder.

## Tests

- `processReviewRequest.usecase.test.ts` (new) — verdict cases: budget-exceeded, pending (semi-auto),
  pending (untrusted-actor), queued, deduplicated, + the no-gate raw-`enqueue` fallback branch.
- `73-stage4-controller-thinning.acceptance.test.ts` — review-request verdict cases added,
  platform-neutral (imports no `GitLab*`/`GitHub*`).
- `webhookReply` extended for the review-request verdict reply shapes; its test updated.

## Regression net (the safety net for the HIGH-risk path — all GREEN, assertions unchanged)

`73-process-webhook`, `46-github-followup-review-on-push`, `197-trusted-actor-provenance-gate`,
`200-webhook-event-idempotency` acceptance suites + both controller unit tests + idempotency
controller test — all green within the 3994 total.

## Verification

`yarn verify`: typecheck OK · lint exit 0 · format:check exit 0 · test:ci **3994 passed / 478 files** · **exit 0**.

## De-scope valve

NOT used. Option A extracted cleanly; no path left half-moved.
