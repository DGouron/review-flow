# Report — SPEC-073 Stage 4b: approve verdict inward

Plan: `docs/plans/73-stage4-controller-thinning.plan.md` (§3) · Spec: `docs/specs/73-extract-webhook-processing-usecase.md`

## Status: OK — `yarn verify` green (typecheck + lint + format:check + test:ci), exit 0, 477 files / 3969 tests

> Report authored by the orchestrator after the implementer agent completed the code and reached
> `yarn verify` green but came to rest before persisting its own report. All facts below verified
> directly against the worktree tree.

## What shipped (Stage 4b only)

The `approve` verdict **decision** (platform-neutral: tracked? quality gate passed? approval reverted?)
is moved inward into `processWebhook`. The platform **I/O** (approval revoke arg shape + FR dismissal
label + note comment) stays controller-side. The orchestrator's previous placeholder
(`{ type:'ignored', reason:'approve-handled-by-controller' }`) is replaced by real routing.

## Verdict / IO split (the load-bearing decision, §3)

- **Inward (`processWebhook`):** reads `getQualityThreshold(localPath)`, calls `transitionState`
  (targetState `approved` with `evaluateQualityGate`) and, on a `quality-gate` rejection,
  `handlePlatformApproval`. Returns one of three new result variants. Imports ONLY `entities/` +
  sibling `usecases/` — verified: NO `interface-adapters/`, NO `frameworks/`, NO
  `approvalRevocationGateway`/`noteCommentPostGateway`, NO `GitLab*`/`GitHub*` type.
- **Controller-side (I/O):** on `approval-revoked`, the controller calls
  `approvalRevocationGateway.revoke(...)` with the per-platform arg shape and
  `noteCommentPostGateway.postComment(revokeMessage)`.

## Artefacts

**Entity** — `webhookEvent.ts`: `approve` variant gains `reviewId: number | null` (GitHub review id;
`null` for GitLab — GitHub review ids are numeric, hence `number` not `string`).

**Usecase** — `processWebhook.usecase.ts`:
- `ProcessWebhookResult` += `{ type:'approved'; mergeRequestNumber }`,
  `{ type:'approval-revoked'; mergeRequestNumber; reason; revokeMessage }`,
  `{ type:'approval-ignored'; mergeRequestNumber; reason }`.
- `ProcessWebhookDependencies` += `handlePlatformApproval: Pick<HandlePlatformApprovalUseCase,'execute'>`
  and `getQualityThreshold: (projectPath: string) => number | null`.

**Controllers** — both `approve` branches map parsed event → `WebhookEvent` `approve`
(GitLab `reviewId:null`, GitHub real numeric `reviewId`), call `deps.processWebhook`, then:
- `approved` → `200 {status:'approved', mrNumber/prNumber}`
- `approval-revoked` → `revoke(...)` (GitLab `{projectPath, mrNumber}`; GitHub
  `{projectPath, mrNumber, reviewId, dismissalMessage: shortDismissalLabel(reason)}`) +
  `postComment(revokeMessage)` → `200 {status:'unapproved', ..., reason}`
- `approval-ignored` → `200 {status:'ignored', ..., reason}`

**Composition root** — `routes.ts`: both `processWebhook` dep objects extended with
`handlePlatformApproval` + `getQualityThreshold` (reused already-instantiated usecases; no new instances).

## Per-platform revoke arg shapes (security-adjacent — preserved exactly)

GitLab revoke carries no `reviewId`/`dismissalMessage`; GitHub passes numeric `reviewId` +
`dismissalMessage` from `shortDismissalLabel(reason)`. Preserved byte-for-byte — proven green by the
SPEC-180 quality-threshold acceptance suites (the regression net for the revoke behavior).

## Tests

- `processWebhook.usecase.test.ts` — approve cases added (approved / quality-gate-reverted / not-tracked).
- `73-stage4-controller-thinning.acceptance.test.ts` (new) — approve verdict routing, platform-neutral
  (imports no `GitLab*`/`GitHub*`).
- Regression net green UNCHANGED in behavior: `73-process-webhook`, `46-github-followup`, `197-trusted-actor`,
  `200-idempotency`, `180-quality-threshold` acceptance + both controller unit tests + idempotency controller test.
- Test-site dep objects updated across 9 files to provide the 2 new deps.

## Verification

`yarn verify`: typecheck OK · lint exit 0 · format:check exit 0 · test:ci **3969 passed / 477 files** · **exit 0**.
Remaining lint output is pre-existing warning-level size-limit debt only.

## Dependency Rule

`processWebhook` imports: `pino` Logger type, `WebhookEvent` entity, `handleClose` usecase,
`qualityGate` entity (`evaluateQualityGate` + `QualityGateRejectionReason`), `checkFollowupNeeded` /
`handlePlatformApproval` / `recordPush` / `transitionState` usecases, `worktree` entity. **CLEAN.**

## Remaining

Stage 4a (review-request enqueue tail inward via `processReviewRequest`) — the last HIGH-risk sub-stage,
guarded by spec-46/197/200 acceptance suites.
