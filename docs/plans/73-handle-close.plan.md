# Plan — SPEC-073 Stage 2: Extract `handleClose` + state-transition composition

> Scope: **Stage 2 ONLY** of SPEC-073. Stage 1 (`executeReview`) is DONE/committed
> (commit `d92ce1f`) — not re-planned here. Stage 3 (ProcessWebhook orchestrator +
> `WebhookEvent` discriminated union) and Stage 4 (full controller thinning) are OUT OF SCOPE.
> Paths mapped to the REAL modular monolith tree (`src/modules/<context>/...`),
> NOT the stale flat `src/usecases/` paths in the spec. The spec's close line numbers
> (gitlab 97-141 / github 71-114) are STALE: the real close handling is gitlab.controller.ts
> 293-360 and github.controller.ts 361-427 (controllers grew + gained worktree removal).

```
PLAN:
  scope: Extract MR/PR close handling (cancel running job → archive tracking → delete
         review context → remove worktree) into one function-based handleClose use case,
         reconciling the GitLab/GitHub close call sites onto it. Merge/approve state
         transitions are ALREADY composed from TransitionStateUseCase and stay as-is
         (justification below); no new merge/approve use cases are created.
  is_new_module: false
```

## Anti-overengineering verdict

**Close extraction: justified.** The block is duplicated in both controllers
(gitlab 293-360, github 361-427), ~35 lines each, structurally identical: cancel job →
archive tracking → delete review context → remove worktree → log → reply. Divergences are
cosmetic (ID prefix `gitlab-`/`github-`, log field names `mrNumber`/`project` vs
`prNumber`/`repo`). Extraction removes real duplication and gives a unit-testable cleanup
flow without HTTP fixtures. It is a use case (orchestrates 4 side-effects, returns a result
summary) — function-based, matching `triggerReview`/`executeReview` siblings.

**Merge/approve "extraction": NOT justified as new use cases — DO NOT CREATE THEM.**
The spec line "compose state transitions from the existing `TransitionStateUseCase`" is
ALREADY satisfied: both controllers call `deps.transitionState.execute({ targetState:
'merged' | 'approved', ... })` today (gitlab 362-496, github via
`handleGitHubPullRequestReviewHook` 160-246). Wrapping those single calls in a new use case
would be ceremony (boilerplate > logic). Worse, the approve path is genuinely platform-divergent
(GitLab `approvalRevocationGateway.revoke({projectPath, mrNumber})` vs GitHub
`.revoke({projectPath, mrNumber, reviewId, dismissalMessage})`) and chains
`handlePlatformApproval` + `noteCommentPostGateway.postComment` — pulling those platform HTTP
gateways behind one "transition" use case inverts the logic/boilerplate ratio and leaks
infra. KISS + YAGNI: leave merge/approve composed in the controllers; Stage 3's orchestrator
can route to them later if needed. This plan documents the decision rather than building the
abstraction.

---

## ENTITIES

No new domain entities. Stage 2 reuses existing types and one EXISTING port abstraction
pattern (the queue port, mirroring `triggerReview`'s `ReviewQueuePort`):

- `Platform` — `@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js` (`'gitlab' | 'github'`)
- `ReviewRequestTrackingGateway` (contract, has `archive(projectPath, reviewRequestId): boolean`)
  — `src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts`
- `ReviewContextGateway` (contract, has `delete(localPath, mergeRequestId): DeleteReviewContextResult`)
  — `src/modules/review-execution/entities/reviewContext/reviewContext.gateway.ts`
- `WorktreeIdentity`, `RemoveResult` — `src/modules/worktree-management/entities/worktree/worktree.schema.ts`

**No new entity files.** The queue-cancel side-effect and the worktree-removal side-effect
are injected as plain functions in the dependency interface (same KISS choice Stage 1 made
for `updateJobProgress`/`sendNotification`, and `triggerReview` made for its `ReviewQueuePort`).
A 1-method port file for "cancel this jobId" would be ceremony.

> Decision flagged: a `CancelJobPort` interface vs an injected `cancelJob(jobId) => boolean`
> fn. Recommend the injected fn (option A) — see OPEN DECISIONS.

---

## USECASES

```
USECASES:
  - name: handleClose
    file: src/modules/review-execution/usecases/handleClose.usecase.ts
    test: src/tests/units/modules/review-execution/usecases/handleClose.usecase.test.ts
    type: command  (side-effectful cleanup orchestration; returns a result summary)
    input: HandleCloseInput (see INPUT TYPE)
    output: Promise<HandleCloseResult>
      = { status: 'cleaned'; jobCancelled: boolean; trackingArchived: boolean; contextDeleted: boolean }
    style: function-based with explicit deps param (matches executeReview / triggerReview)
    export shape: `export type HandleClose = (input: HandleCloseInput) => Promise<HandleCloseResult>;`
                  `export async function handleClose(input, deps): Promise<HandleCloseResult>`
```

### Module placement justification

`review-execution` (chosen) over `tracking`. Close handling is cross-cutting cleanup of a
**review's** runtime artefacts: it cancels a running review **job** (queue), deletes the
**review context** file (review-execution entity), and removes the review **worktree**
(worktree-management) — only ONE of its four effects (archive tracking) is a tracking concern.
`executeReview` and `triggerReview` already live in `review-execution/usecases/`, and the
close flow is the teardown counterpart to those. Putting it in `tracking` would force
`tracking` to depend on `reviewContext` + `worktree` ports it otherwise does not. Co-locating
with the other review-lifecycle use cases keeps the seam consistent with Stage 1.

### What the function does (the reconciled single copy of both blocks)

In order, all best-effort and independently logged:
1. `const jobCancelled = deps.cancelJob(deps.buildJobId(platform, projectPath, mergeRequestNumber))`
   — abort any running review job for this MR/PR.
2. `const trackingArchived = deps.trackingGateway.archive(localPath, mergeRequestId)`
   — archive the tracked MR/PR (returns `false` if not tracked).
3. `const contextDeleted = deps.reviewContextGateway.delete(localPath, mergeRequestId).deleted`
   — delete the review context file (returns `{ deleted: false }` if absent).
4. worktree removal (try/catch, warn-only — matches both controllers):
   `const removal = await deps.removeWorktree({ identity: { platform, projectPath, mrNumber }, sourceCheckoutPath: localPath })`;
   warn on `removal.status === 'failed'` and on a thrown error. Removal failure NEVER fails
   the cleanup.
5. `deps.logger.info({...}, 'Review request closed - cleaned up tracking, cancelled job, deleted context')`
6. return `{ status: 'cleaned', jobCancelled, trackingArchived, contextDeleted }`.

`mergeRequestId = \`${platform}-${projectPath}-${mergeRequestNumber}\`` is built inside the
use case (divergence #1 below), exactly as both controllers do today.

> The "repo not configured" branch (both controllers reply `200 ignored` when there is no
> `repoConfig`) stays in the CONTROLLER — it owns config lookup (`findRepositoryByProjectPath`
> / `findRepositoryByRemoteUrl`) and the controller calls `handleClose` only after `repoConfig`
> resolves and passes the already-resolved `localPath`. The use case never reads `@/config`.
> This mirrors Stage 1's rule (controller resolves config; use case is config-agnostic).

---

## STATE TRANSITIONS (merge / approve)

**No new use cases. No call-site changes for merge/approve.** Already composed from
`TransitionStateUseCase` (`src/modules/tracking/usecases/tracking/transitionState.usecase.ts`,
class-based `execute({ projectPath, mrId, targetState, qualityCheck?, requireCurrentState? })`
→ `TransitionStateResult`). Current composition that STAYS as-is:

| Transition | Site | Composition (unchanged) |
|-----------|------|--------------------------|
| GitLab merge | gitlab.controller.ts 362-399 | `transitionState.execute({ targetState: 'merged' })` + `removeWorktree` |
| GitLab approve | gitlab.controller.ts 401-496 | `transitionState.execute({ targetState: 'approved', qualityCheck: evaluateQualityGate })` → on `quality-gate` reason: `handlePlatformApproval.execute` → `approvalRevocationGateway.revoke` + `noteCommentPostGateway.postComment` |
| GitHub approve | github.controller.ts `handleGitHubPullRequestReviewHook` 160-246 | identical shape, GitHub revoke signature (`reviewId` + `dismissalMessage`) |

GitHub has **no merge transition** (`filterGitHubPrClose` covers merged-or-closed; a merged
GitHub PR arrives as a close event and goes through `handleClose`). Do not invent a GitHub
merge path.

> If a future stage wants merge symmetry, the merge-on-close behaviour would need its own
> spec decision (GitHub currently archives a merged PR rather than transitioning it to
> `merged`). OUT OF SCOPE here — flagged in OPEN DECISIONS as a known asymmetry, not a bug.

---

## GATEWAYS

No new gateway *contracts* and no new gateway *implementations* in Stage 2. `handleClose`
consumes EXISTING contracts and injected fns:

```
GATEWAYS (consumed, already exist):
  - ReviewRequestTrackingGateway  contract: tracking/entities/tracking/reviewRequestTracking.gateway.ts
                                  method used: archive(localPath, mergeRequestId): boolean
                                  stub: src/tests/stubs/reviewRequestTracking.stub.ts (EXISTS — archive
                                        implemented at line 103; no stub change needed)
  - ReviewContextGateway          contract: review-execution/entities/reviewContext/reviewContext.gateway.ts
                                  method used: delete(localPath, mergeRequestId): DeleteReviewContextResult
                                  stub: src/tests/stubs/reviewContextGateway.stub.ts (EXISTS — delete
                                        implemented at line 46, returns { success, deleted }; no change needed)

INJECTED FNS (no new interface — KISS, mirrors triggerReview's queue port + Stage 1 fns):
  - cancelJob: (jobId: string) => boolean
        wraps frameworks/queue/pQueueAdapter.cancelJob (abort controller; true if a job was aborted)
  - buildJobId: (platform, projectPath, mrNumber) => string
        wraps frameworks/queue/pQueueAdapter.createJobId  (so the use case never imports frameworks/queue)
  - removeWorktree: RemoveWorktreeAction
        the SAME fn type the controllers already inject
        ({ identity: WorktreeIdentity; sourceCheckoutPath: string }) => Promise<RemoveResult>
```

> `buildJobId` is injected (not derived inside the use case) because `createJobId` lives in
> `frameworks/queue` and the use case must not import outward (Dependency Rule). Today both
> controllers call `createJobId('gitlab' | 'github', projectPath, mrNumber)` — identical
> across platforms, so a single injected `buildJobId` covers both.

---

## CONTROLLERS / CALL-SITE CHANGES

No new controllers. TWO existing controllers change at the close call site only
(merge/approve untouched). Each controller's `Dependencies` interface gains the `handleClose`
use case and may shed the now-unused direct `cancelJob`/`createJobId` imports IF no other
site in the file uses them (verify: `createJobId` is also used by review + followup enqueue
paths, so it STAYS imported; `cancelJob` is used ONLY by the close block, so it can be
dropped from the controller import once `handleClose` owns it — verify per file).

```
CONTROLLERS (modified, not created):
  - gitlab.controller.ts
    file: src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
    close site: lines 293-360 (the `if (closeResult.shouldProcess)` block)
    test: src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts (update)
  - github.controller.ts
    file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
    close site: lines 361-427 (the `if (closeResult.shouldProcess)` block)
    test: src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts (update)
```

### Exact change at EACH close call site (2 sites)

Replace the inlined cleanup (cancel + archive + delete + worktree + log) with:

1. Keep: parse `closeResult` (`filterGitLabMrClose` / `filterGitHubPrClose`), extract
   `projectPath` + `mergeRequestNumber`, resolve `repoConfig`
   (`findRepositoryByProjectPath` GitLab / `findRepositoryByRemoteUrl(event.repository.clone_url)`
   GitHub).
2. Keep: the `if (!repoConfig)` branch → `reply.status(200).send({ status: 'ignored',
   reason: '... closed, repo not configured' })`. (Controller-owned config branch.)
3. Replace the inline block with:
   ```
   const result = await deps.handleClose({
     platform: 'gitlab' | 'github',
     projectPath,
     localPath: repoConfig.localPath,
     mergeRequestNumber,
   });
   reply.status(200).send({
     status: result.status,                 // 'cleaned'
     mrNumber | prNumber: mergeRequestNumber, // keep existing per-platform field name
     jobCancelled: result.jobCancelled,
     trackingArchived: result.trackingArchived,
   });
   ```
   The reply field name stays `mrNumber` (GitLab) / `prNumber` (GitHub) to preserve the
   existing HTTP contract (do NOT unify response keys in Stage 2 — out of scope, asserted by
   existing controller tests).
4. Remove the now-dead `cancelJob` import from the controller IF unused elsewhere in the file
   (verify: GitLab/GitHub close is `cancelJob`'s only caller in each controller → safe to drop).
   Keep `createJobId` (used by enqueue paths).

---

## DIVERGENCES TO RECONCILE (verified by reading both blocks)

| # | Divergence | GitLab (293-360) | GitHub (361-427) | Reconciled in `handleClose` |
|---|-----------|-------------------|-------------------|------------------------------|
| 1 | mergeRequestId prefix | `gitlab-${projectPath}-${n}` | `github-${projectPath}-${n}` | Built from `platform` arg: `${platform}-${projectPath}-${n}` |
| 2 | job id | `createJobId('gitlab', projectPath, n)` | `createJobId('github', projectPath, n)` | `deps.buildJobId(platform, projectPath, n)` |
| 3 | worktree identity platform | `'gitlab'` | `'github'` | from `platform` arg |
| 4 | log field names | `{ mrNumber, project, ... }` | `{ prNumber, repo, ... }` | unify to `{ platform, mergeRequestNumber, projectPath, ... }` inside use case (internal log only; HTTP reply keys unchanged per site) |
| 5 | repo lookup | `findRepositoryByProjectPath` | `findRepositoryByRemoteUrl(clone_url)` | stays in CONTROLLER; use case receives resolved `localPath` |
| 6 | HTTP reply key | `mrNumber` | `prNumber` | stays in CONTROLLER (preserve contract) |

No behavioural divergence in the cleanup itself — the two blocks are byte-for-byte equivalent
modulo the above naming. (Contrast Stage 1, which had a real action-execution bug; Stage 2 has
none — it is pure deduplication.)

---

## DEPENDENCY INTERFACE: `HandleCloseDependencies`

Defined in `handleClose.usecase.ts`. Classification per the Dependency Rule:

```
HandleCloseDependencies {
  // --- existing gateway CONTRACTS (already in entities/, inject real impls) ---
  trackingGateway: Pick<ReviewRequestTrackingGateway, 'archive'>;
  reviewContextGateway: Pick<ReviewContextGateway, 'delete'>;

  // --- injected fns wrapping infra (NOT new interfaces — KISS) ---
  cancelJob: (jobId: string) => boolean;                              // frameworks/queue
  buildJobId: (platform: Platform, projectPath: string, mrNumber: number) => string; // frameworks/queue
  removeWorktree: RemoveWorktreeAction;                               // already injected in controllers

  logger: Logger;
}
```

`RemoveWorktreeAction` type: reuse the SAME shape both controllers already declare
(`({ identity: WorktreeIdentity; sourceCheckoutPath: string }) => Promise<RemoveResult>`).
To avoid duplicating it, either import the controller's exported `RemoveWorktreeAction`
(controller is interface-adapters → use case importing it would VIOLATE the Dependency Rule)
OR — preferred — define the canonical `RemoveWorktreeAction` type in the worktree entity layer
and have both the controllers and `handleClose` import it from there. **Decision flagged**: the
controllers currently each `export type RemoveWorktreeAction` locally; the clean fix is to move
that type to `worktree-management/entities/worktree/worktree.schema.ts` (or a sibling type
file) and import it inward-safely. See OPEN DECISIONS — recommend the entity-layer move
(small, in-scope, removes a duplicated type).

**Classification summary (for reviewer):**
- *Already gateway contracts (no new code):* `trackingGateway` (`archive`),
  `reviewContextGateway` (`delete`) — both narrowed with `Pick<>` to the single method used.
- *Injected plain fns (NOT new interfaces):* `cancelJob`, `buildJobId`, `removeWorktree`.
- *NEW interfaces to create:* none.
- *NEW entity type move (recommended):* `RemoveWorktreeAction` relocated to worktree entities.

---

## INPUT TYPE: `HandleCloseInput`

```
HandleCloseInput {
  platform: Platform;          // 'gitlab' | 'github'
  projectPath: string;         // platform project path (used for jobId + worktree identity)
  localPath: string;           // resolved checkout path (used for tracking + context + worktree source)
  mergeRequestNumber: number;
}
```

Derived inside the use case: `mergeRequestId`, `jobId` (via `deps.buildJobId`), worktree
`identity`. Nothing platform-specific leaks in — `platform` is the only branch driver and it
only changes string prefixes.

---

## TEST FILES

Unit (Detroit, stub gateways + fn spies — no HTTP, no real infra):

```
TESTS:
  - src/tests/units/modules/review-execution/usecases/handleClose.usecase.test.ts   (NEW, primary)
      cases:
        * happy path → cancelJob(builtJobId) called, archive(localPath, `${platform}-...`) called,
          reviewContextGateway.delete called, removeWorktree called with correct identity,
          result { status:'cleaned', jobCancelled:true, trackingArchived:true, contextDeleted:true }
        * no running job → cancelJob returns false → result.jobCancelled === false, others still run
        * MR/PR not tracked → archive returns false → result.trackingArchived === false, cleanup continues
        * context file absent → delete returns { deleted:false } → result.contextDeleted === false
        * worktree removal returns { status:'failed', warning } → warn logged, result still 'cleaned'
        * worktree removal THROWS → warn logged, result still 'cleaned' (no rethrow)
        * mergeRequestId prefix: platform 'github' builds `github-...`; platform 'gitlab' builds `gitlab-...`
        * jobId built via deps.buildJobId(platform, projectPath, mrNumber) (spy asserts args)
  - stubs: reuse src/tests/stubs/reviewRequestTracking.stub.ts (archive present, line 103),
           src/tests/stubs/reviewContextGateway.stub.ts (delete present, line 46),
           src/tests/stubs/logger.stub.ts (or capturingLogger.stub.ts for warn assertions).
           No new stub files needed.
  - fn doubles: cancelJob / buildJobId / removeWorktree as vitest fn spies (no stub files needed)
  - factory: none new (input is 4 primitives; no entity construction)
```

Controller tests (UPDATE existing) — assert the close site now delegates to the injected
`deps.handleClose` with the right `HandleCloseInput` and maps the result onto the existing
HTTP reply shape (`status:'cleaned'`, per-platform `mrNumber`/`prNumber`), and that the
`repo not configured` branch still replies `200 ignored` WITHOUT calling `handleClose`.

> Verify the existing controller close tests live in
> `src/tests/units/interface-adapters/controllers/webhook/{gitlab,github}.controller.test.ts`
> (Stage 1 report references this flat path for controller tests, distinct from the
> `src/tests/units/modules/...` path used for the gitlabIdempotency controller test). Match
> whichever path the current close tests use; do not move them.

---

## WIRING

```
WIRING (src/main/routes.ts):
  routes: no new routes.
  dependencies:
    - Build ONE handleClose binding per controller invocation (cheap — closes over injected fns),
      OR a shared `buildHandleClose(...)` factory in a small wiring module mirroring
      executeReviewWiring.ts. Recommend an inline binding in routes.ts (fewer moving parts than
      Stage 1's separate wiring file, since handleClose has no platform-strategy branching).
    - Inject into BOTH controller deps bundles (gitlab.controller deps ~561-592,
      github.controller deps ~616-645):
        handleClose: (input) => handleClose(input, {
          trackingGateway: trackingGw,
          reviewContextGateway: deps.reviewContextGateway,
          cancelJob,                              // import { cancelJob } from '@/frameworks/queue/pQueueAdapter.js'
          buildJobId: createJobId,                // import { createJobId } from '@/frameworks/queue/pQueueAdapter.js'
          removeWorktree: removeWorktreeAction,   // already defined at routes.ts ~530
          logger: deps.logger,
        }),
    - `removeWorktreeAction` already exists in routes.ts (~530) — reuse it.
    - `trackingGw`, `deps.reviewContextGateway`, `cancelJob`, `createJobId` are already in
      scope / imported in routes.ts (createJobId/cancelJob via the controllers today; ensure
      routes.ts imports them or the binding lives where they are in scope).
    - Add `handleClose` to BOTH `GitLabWebhookDependencies` and `GitHubWebhookDependencies`
      interfaces (the controller files).
```

---

## IMPLEMENTATION_ORDER

1. (Optional, recommended) Move `RemoveWorktreeAction` type to
   `worktree-management/entities/worktree/worktree.schema.ts`; re-export-import in both
   controllers. — removes a duplicated type, keeps Dependency Rule clean for the use case.
2. `handleClose.usecase.ts` + its unit test — RED→GREEN the reconciled cleanup block
   (the core deliverable; everything else is wiring). Walking-skeleton seam: input → 4
   side-effects via stubs/spies → result summary.
3. Migrate the **GitHub close call site** first (smaller controller; proves delegation),
   then the **GitLab close call site**.
4. Add `handleClose` to both controller `Dependencies` interfaces; drop now-dead `cancelJob`
   import per file (verify unused).
5. Update both controller close tests to the delegated pattern.
6. Wire in `src/main/routes.ts` (composition root) — LAST. Bind `handleClose` into both deps
   bundles using the existing `removeWorktreeAction` + queue fns.
7. `yarn verify`.

---

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/73-handle-close.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
         Focus Stage-2 DoD: (1) one shared handleClose drives BOTH GitLab MR close and GitHub
         PR close call sites; (2) cleanup performs cancel job + archive tracking + delete
         review context + remove worktree, all best-effort (worktree failure does not fail
         the cleanup); (3) close on an unconfigured repo replies 200 ignored WITHOUT invoking
         handleClose; (4) merge/approve transitions are unchanged (no regression)."
```

---

## REFERENCE_FILES

- `src/modules/review-execution/usecases/executeReview.usecase.ts` — function-style + deps + result-union template (Stage 1 sibling)
- `src/modules/review-execution/usecases/triggerReview.usecase.ts` — queue-port abstraction precedent (`ReviewQueuePort`)
- `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` — the merge/approve composition (stays as-is)
- `.../controllers/webhook/gitlab.controller.ts` 293-360 (close) / 362-399 (merge) / 401-496 (approve) — GitLab sites
- `.../controllers/webhook/github.controller.ts` 361-427 (close) / 160-246 (approve in PR-review hook) — GitHub sites
- `src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts` — `archive` contract
- `src/modules/review-execution/entities/reviewContext/reviewContext.gateway.ts` — `delete` contract
- `src/modules/worktree-management/entities/worktree/worktree.schema.ts` — `WorktreeIdentity`, `RemoveResult`
- `src/frameworks/queue/pQueueAdapter.ts` — `cancelJob` (~334), `createJobId` (~167)
- `src/main/routes.ts` 530-537 (`removeWorktreeAction`), 561-592 / 616-645 (controller deps bundles)
- `src/main/executeReviewWiring.ts` — composition-root factory pattern (reference; Stage 2 wiring is simpler/inline)
- `src/tests/stubs/reviewRequestTracking.stub.ts`, `src/tests/stubs/reviewContextGateway.stub.ts` — stub patterns

---

## RESOLVED DECISIONS (locked — implementer MUST follow)

1. **Queue-cancel injection shape.** ✅ RESOLVED: option (A) — inject `cancelJob` + `buildJobId`
   as plain fns (matches Stage 1's `updateJobProgress`/`sendNotification`, keeps the use case
   free of `frameworks/queue`). No `CancelJobPort`.

2. **`RemoveWorktreeAction` type.** ✅ RESOLVED: option (A) — move the canonical type to the
   worktree ENTITY layer; import it inward-safely from both controllers and the use case. The
   two controller import-line edits are IN SCOPE for Stage 2. No re-declared local duplicate.

3. **Merge/approve stay in controllers.** ✅ RESOLVED: confirmed. Document the existing
   `TransitionStateUseCase` composition; do NOT add `handleMerge`/`handleApprove` wrappers
   (over-engineering — approve drags platform revocation/comment HTTP gateways into a use case).
   Leave the merge/approve call sites untouched.

4. **GitHub merge asymmetry.** ✅ ACKNOWLEDGED: pre-existing, OUT OF SCOPE. A merged GitHub PR
   arrives as a close event → `handleClose` (archived), not recorded as `state:'merged'`. Do
   NOT change this in Stage 2.

5. **HTTP reply keys NOT unified.** ✅ ACKNOWLEDGED: preserve `mrNumber`/`prNumber` + existing
   `status` strings to avoid breaking controller tests / dashboard consumers. Response-shape
   unification is Stage 4, not Stage 2.
