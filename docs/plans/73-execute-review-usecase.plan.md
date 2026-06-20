# Plan — SPEC-073 Stage 1: Extract `executeReview` Use Case

> Scope: **Stage 1 ONLY** of SPEC-073. Stages 2-4 (handleClose, ProcessWebhook
> orchestrator, controller thinning, `WebhookEvent` discriminated union) are OUT OF SCOPE.
> Paths mapped to the REAL modular monolith tree (`src/modules/<context>/...`),
> NOT the stale flat `src/usecases/` paths in the spec.

```
PLAN:
  scope: Extract the shared review-execution block (createContext → invoke → track →
         executeActions → recordStats → notify) into one executeReview use case,
         called by all 4 processor blocks. Reconciles divergences and fixes the
         GitHub review dual-execution bug.
  is_new_module: false  (lands inside existing module: review-execution)
```

## Anti-overengineering verdict

Justified. The block is copy-pasted 4× (~200 lines each in 2 controllers). Extraction
removes real duplication AND fixes a real bug (GitHub review runs both stdout + context
actions). This is a use case (orchestrates 6+ sub-operations, needs a logger) — not a
value object, not a new module, not a gateway. Function-based style matches the existing
`triggerReview`/`handleReviewRequestPush` siblings. No new entities, no new gateway
contracts beyond two thin injection ports for non-gateway side-effects. KISS respected.

---

## ENTITIES

No new domain entities. Stage 1 reuses existing types:
- `ReviewJob` — `src/modules/review-execution/entities/job/reviewJob.ts`
- `ReviewContext`, `DiffMetadata`, `CreateReviewContextInput` — `.../reviewContext/reviewContext.ts`
- `ReviewContextGateway` (contract) — `.../reviewContext/reviewContext.gateway.ts`
- `ReviewAction` — `.../reviewAction/reviewAction.ts`
- `Platform` — `@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js`

**Two NEW injection-port interfaces** (kept in `entities/` to honour the Dependency Rule —
the use case must not import websocket/claude infra directly). See DEPENDENCY INTERFACE below:
- `ProgressWatcher` → new file `src/modules/review-execution/entities/progress/progressWatcher.gateway.ts`
- `ClaudeReviewInvoker` (port + result type) → new file `src/modules/review-execution/entities/review/claudeReviewInvoker.gateway.ts`

> Decision point flagged below: whether to introduce `ClaudeReviewInvoker` as a port or
> reuse the existing `InvocationResult` shape via a narrower injected function type.

---

## USECASES

```
USECASES:
  - name: executeReview
    file: src/modules/review-execution/usecases/executeReview.usecase.ts
    test: src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts
    type: command  (side-effectful orchestration; returns a result discriminated union)
    input: ExecuteReviewInput (see INPUT TYPE)
    output: Promise<ExecuteReviewResult>
      = { status: 'completed'; stats: ReviewStatsSummary }
      | { status: 'cancelled' }
      | { status: 'failed'; reason: string }   // controller throws on this for queue retry
    style: function-based with explicit deps param (matches triggerReview)
```

The function performs, in order (the reconciled single copy of the 4 blocks):
1. `sendNotification('Review [followup ]démarrée', ...)` (prefix from input.notificationPrefix)
2. create review context (best-effort): fetch threads (followup: plain fetch; review:
   pinned-target resolution preserved via injected `resolveThreads` strategy — see divergences),
   fetch diffMetadata (best-effort, warn on failure), `contextGateway.create({...})`,
   `progressWatcher.start(jobId, localPath, mergeRequestId)`
3. `claudeInvoker.invoke(job, onProgress, signal)` where `onProgress` calls
   `updateJobProgress` (injected) + `contextGateway.updateProgress(...)`
4. `progressWatcher.stop(mergeRequestId)`
5. branch on result:
   - `cancelled` → notify "annulée", return `{ status: 'cancelled' }`
   - `success` → `parseReviewOutput`, then **PRIMARY/FALLBACK** action execution
     (context actions primary via `executeActionsFromContext`; else stdout markers via
     `dispatchConstrainedActions`), `setResult`, optional `syncThreads` (followup only),
     `recordCompletion.execute(...)`, notify "terminée", return `{ status: 'completed', stats }`
   - `failure` (not cancelled) → notify "échouée", return `{ status: 'failed', reason }`

> Why return a result instead of throwing internally: keeps the use case pure of queue
> semantics. The controller/processor maps `failed` → `throw` so the queue retries
> (preserves today's GitLab/GitHub-followup behaviour and FIXES GitHub-review which today
> already throws — so no regression there).

---

## GATEWAYS

No new gateway *implementations* in Stage 1. The use case consumes EXISTING contracts and
the two NEW injection ports. Existing gateway contracts injected as-is:

```
GATEWAYS (consumed, already exist):
  - ReviewContextGateway     contract: .../reviewContext/reviewContext.gateway.ts
                             stub: src/tests/stubs/reviewContextGateway.stub.ts (exists)
  - ThreadFetchGateway       contract: platform-integration/.../threadFetch/threadFetch.gateway.ts
                             stub: src/tests/stubs/threadFetch.stub.ts (exists)
  - DiffMetadataFetchGateway contract: platform-integration/.../diffMetadata/diffMetadata.gateway.ts
                             stub: src/tests/stubs/diffMetadataFetch.stub.ts  (NEW — none exists)
  - DiffStatsFetchGateway    contract: shared-kernel/.../diffStats/diffStatsFetch.gateway.ts
                             stub: src/tests/stubs/diffStatsFetch.stub.ts (exists)
  - NoteCommentPostGateway   contract: platform-integration/.../noteComment/noteCommentPost.gateway.ts
                             stub: src/tests/stubs/noteCommentPost.stub.ts (exists)

NEW injection ports (contracts only, impl is a thin adapter in composition root / wiring):
  - ProgressWatcher          contract: review-execution/entities/progress/progressWatcher.gateway.ts
                             methods: start(jobId, localPath, mergeRequestId): void
                                      stop(mergeRequestId): void
                             stub: src/tests/stubs/progressWatcher.stub.ts (NEW)
  - ClaudeReviewInvoker      contract: review-execution/entities/review/claudeReviewInvoker.gateway.ts
                             methods: invoke(job, onProgress, signal): Promise<ClaudeReviewResult>
                             stub: src/tests/stubs/claudeReviewInvoker.stub.ts (NEW)
```

> `ClaudeReviewResult` mirrors the existing `InvocationResult` fields the block reads:
> `{ success, cancelled?, exitCode, stdout, stderr, durationMs }`. Defined in the port file
> to avoid the use case importing `frameworks/claude`.

---

## CONTROLLERS

No new controllers. Two existing controllers are modified at 4 call sites (see CALL-SITE
CHANGES). Their dependency interfaces gain `executeReview` (the injected use case) and
SHED the now-unused direct imports once all 4 sites are migrated.

```
CONTROLLERS (modified, not created):
  - gitlab.controller.ts
    file: src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
    test: src/tests/units/modules/platform-integration/.../webhook/gitlab.controller.test.ts (update existing)
  - github.controller.ts
    file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
    test: src/tests/units/modules/platform-integration/.../webhook/github.controller.test.ts (update existing)
```

---

## DIVERGENCES TO RECONCILE (verified by reading all 4 blocks)

| # | Divergence | GitLab | GitHub | Reconciled behaviour in `executeReview` |
|---|-----------|--------|--------|------------------------------------------|
| 1 | **Action execution (THE BUG)** | review + followup: primary/fallback (`if context.actions else stdout`) | followup: primary/fallback ✓ ; **review: runs BOTH stdout `executeThreadActions` AND context `executeActionsFromContext`** | Single primary/fallback path. Context actions primary; stdout markers fallback only when no context actions. Fixes GitHub review. |
| 2 | **Fallback executor** | `dispatchConstrainedActions` (provenance + inventory gateway, fail-closed — SPEC-198) | `executeThreadActions` (older, no inventory constraint) | Use the SAFER `dispatchConstrainedActions` for both. GitHub gains the constrained chokepoint. **Needs `inventoryGateway` per platform — inject as `ThreadInventoryGateway` dep, or pass a platform→inventory factory.** (decision flagged) |
| 3 | **Thread fetch strategy** | review: `resolvePinnedThreadFetchTarget` (provenance pin); followup: `resolvePinnedThreads` | both: plain `threadFetchGw.fetchThreads` | Inject the thread-resolution as a strategy fn `resolveThreads(input) => threads` so review keeps the pin and followup keeps plain fetch. Do NOT silently upgrade GitHub to pinning in Stage 1 (out of scope, risk). |
| 4 | **baseUrl for context actions** | review: `extractBaseUrl(repoConfig.remoteUrl)`; followup: `extractBaseUrl(updateRepoConfig.remoteUrl)` | both: `null` | Pass `baseUrl: string \| null` in input; controller resolves it (it owns `findRepositoryByProjectPath` + `extractBaseUrl`). Use case stays config-agnostic. |
| 5 | **syncThreads** | followup only | followup only | `syncThreads` optional in deps; run only when `input.jobType === 'followup'`. |
| 6 | **agents list** | review: `getProjectAgentsOrFocusDefaults`; followup: `getFollowupAgents` | same | Controller resolves the agents list (config read) and passes `agents` in input. Use case does not import `@/config`. |
| 7 | **failure throw** | both throw | review throws ✓ ; followup throws ✓ | Use case returns `{ status: 'failed' }`; caller throws. Uniform. |
| 8 | **notification prefix** | `MR !${n}` | `PR #${n}` | `input.notificationPrefix` ('MR !' \| 'PR #') + `input.isFollowup` decide titles. |
| 9 | **threadResolveCount** | followup computes from context/stdout actions for `threadsClosed` | same | Computed inside use case from executed actions; surfaced in `ExecuteReviewResult.stats`. |
| 10 | **mergeRequestId format** | `gitlab-${projectPath}-${mrNumber}` | `github-${projectPath}-${mrNumber}` | Built inside use case from `platform` + `projectPath` + `mrNumber`. |

---

## DEPENDENCY INTERFACE: `ExecuteReviewDependencies`

Defined in `executeReview.usecase.ts`. Classification per the Dependency Rule:

```
ExecuteReviewDependencies {
  // --- existing gateway CONTRACTS (already in entities/, inject the real impls) ---
  reviewContextGateway: ReviewContextGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  noteCommentPostGateway: NoteCommentPostGateway | null;
  inventoryGateway: ThreadInventoryGateway;        // for the stdout fallback (divergence #2)

  // --- existing USE CASES (composed) ---
  recordCompletion: RecordReviewCompletionUseCase;
  syncThreads?: SyncThreadsUseCase;                // followup only

  // --- NEW injection PORTS (wrap infra side-effects; defined in entities/) ---
  claudeInvoker: ClaudeReviewInvoker;              // wraps invokeClaudeReview (frameworks/claude)
  progressWatcher: ProgressWatcher;                // wraps start/stopWatchingReviewContext (main/websocket)
  updateJobProgress: (jobId, progress, event?) => void;  // injected fn (frameworks/queue)
  sendNotification: (title, message) => void;      // injected fn (frameworks/claude)

  // --- strategy fns (resolve the divergences without leaking platform infra) ---
  resolveThreads: (input: ResolveThreadsInput) => ReviewContextThread[];  // divergence #3
  executeContextActions: typeof executeActionsFromContext-shaped fn;      // reuse existing service
  executeFallbackActions: dispatchConstrainedActions-shaped fn;           // reuse existing service

  logger: Logger;
}
```

**Classification summary (for reviewer):**
- *Already gateway contracts (no new code):* `reviewContextGateway`, `diffStatsFetchGateway`,
  `noteCommentPostGateway`, `inventoryGateway`.
- *Already use cases:* `recordCompletion`, `syncThreads`.
- *NEW interfaces to create:* `ClaudeReviewInvoker`, `ProgressWatcher`.
- *Injected as plain fns (NOT new interfaces — KISS):* `updateJobProgress`, `sendNotification`,
  `resolveThreads`. These are stateless infra calls; a 1-method interface would be ceremony.
- *Reused services passed as fns:* `executeActionsFromContext`, `dispatchConstrainedActions`
  (already exist in `review-execution/services/`; injecting them keeps the use case testable
  and avoids the use case importing `interface-adapters/gateways/cli/*`).

> Open decision (needs your input): two ways to keep the use case clean of `interface-adapters`:
> (A) inject the two action-executor services as fns (above), OR
> (B) wrap them behind one `ReviewActionExecutor` port with `executePrimary`/`executeFallback`.
> (A) is less code now; (B) is cleaner if Stage 2/3 reuse it. Recommend (A) for Stage 1.

---

## INPUT TYPE: `ExecuteReviewInput`

```
ExecuteReviewInput {
  job: ReviewJob;
  signal: AbortSignal;
  platform: Platform;                 // 'gitlab' | 'github'
  isFollowup: boolean;                // drives titles, syncThreads, threadsClosed, agents choice already resolved
  agents: AgentDefinition[];          // resolved by controller (config read kept out of use case)
  baseUrl: string | null;             // resolved by controller via extractBaseUrl (divergence #4)
  notificationPrefix: 'MR !' | 'PR #';
  qualityThreshold: number | null;    // resolved by controller via loadProjectConfig
}
```

Derived inside the use case: `mergeRequestId = \`${platform}-${job.projectPath}-${job.mrNumber}\``;
notification titles; `reviewData.type` ('review' | 'followup'); `threadsClosed`/`threadsOpened`.

---

## TEST FILES

Unit (Detroit, stub gateways — no HTTP, no real infra):

```
TESTS:
  - src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts   (NEW, primary)
      cases:
        * review success → context created, claude invoked, context actions executed (PRIMARY),
          stats recorded, "terminée" notified, result 'completed'
        * review success, no context actions → stdout fallback via dispatchConstrainedActions,
          NOT both (regression guard for the GitHub bug)
        * followup success → syncThreads called, threadsClosed = THREAD_RESOLVE count
        * cancelled → "annulée" notified, NO stats recorded, result 'cancelled'
        * failure (non-zero, not cancelled) → "échouée" notified, result 'failed' (caller throws)
        * thread fetch fails → warn, proceeds, claude still invoked (context best-effort)
        * diff metadata fetch fails → warn, context created without diffMetadata, claude invoked
        * progressWatcher.start/stop called around invoke
  - src/tests/stubs/progressWatcher.stub.ts        (NEW)
  - src/tests/stubs/claudeReviewInvoker.stub.ts     (NEW)
  - src/tests/stubs/diffMetadataFetch.stub.ts       (NEW — none exists today)
  - reuse: reviewContextGateway.stub.ts, threadFetch.stub.ts, diffStatsFetch.stub.ts,
           noteCommentPost.stub.ts, logger.stub.ts
  - factory: reviewJob factory if missing (check src/tests/factories/ — reviewContext.factory.ts exists)
```

Controller tests (update existing) assert each site now delegates to the injected
`executeReview` with the right input, and stops inlining the block.

---

## CALL-SITE CHANGES (4 sites)

All four replace the inlined ~200-line block with: resolve `agents` + `baseUrl` +
`qualityThreshold` + `notificationPrefix`, build `ExecuteReviewInput`, `await deps.executeReview(input)`,
and on `{ status: 'failed' }` → `throw new Error(reason)` (queue retry).

1. **GitLab review processor** — `buildGitLabReviewProcessor`, gitlab.controller.ts ~1057-1249.
   Keep the `repoConfig` guard + `findRepositoryByProjectPath`; pass `baseUrl = extractBaseUrl(repoConfig.remoteUrl)`,
   `agents = getProjectAgentsOrFocusDefaults(...) ?? DEFAULT_AGENTS`, `isFollowup=false`,
   `resolveThreads` = pinned-target strategy.
2. **GitLab followup processor** — inline `followupProcessor`, gitlab.controller.ts ~630-835.
   `agents = getFollowupAgents(...) ?? DEFAULT_FOLLOWUP_AGENTS`, `baseUrl = extractBaseUrl(updateRepoConfig.remoteUrl)`,
   `isFollowup=true`, `syncThreads` provided, `resolveThreads` = `resolvePinnedThreads` strategy.
3. **GitHub review processor** — `buildGitHubReviewProcessor`, github.controller.ts ~927-1102.
   **BUG FIX lands here:** delete the dual `executeThreadActions`+`executeActionsFromContext`;
   the use case does primary/fallback once. `baseUrl=null`, `isFollowup=false`, plain `resolveThreads`.
4. **GitHub followup processor** — inline `followupProcessor`, github.controller.ts ~541-735.
   Already primary/fallback; `baseUrl=null`, `isFollowup=true`, `syncThreads` provided, plain `resolveThreads`.

After migration, remove now-dead imports from both controllers where no other usage remains:
`invokeClaudeReview`, `start/stopWatchingReviewContext`, `parseReviewOutput`,
`executeActionsFromContext`, `dispatchConstrainedActions`, `executeThreadActions`,
`ReviewContextResultFactory`, `updateJobProgress` (verify each is unused elsewhere in the file first).

---

## WIRING

```
WIRING (src/main/routes.ts):
  routes: no new routes.
  dependencies:
    - Build ONE executeReview-deps bundle reused by both platforms' processor builders.
    - NEW adapter instances (composition root only — the "dirty" layer):
        * ProgressWatcher impl wrapping start/stopWatchingReviewContext (@/main/websocket)
        * ClaudeReviewInvoker impl wrapping invokeClaudeReview (@/frameworks/claude/claudeInvoker)
          with deps.claudeInvokerDeps captured
        * updateJobProgress / sendNotification passed as bound fns
        * inventoryGateway: GitLabThreadInventoryGateway / GitHubThreadInventoryGateway per platform
        * executeContextActions/executeFallbackActions: pass the existing service fns
    - buildGitLabReviewProcessor / buildGitHubReviewProcessor now receive `executeReview`
      (or the deps bundle) instead of the granular review-execution deps they hold today.
    - The two followup processors are wired through the controller deps interfaces
      (GitLabWebhookDependencies / GitHubWebhookDependencies gain `executeReview`).
```

---

## IMPLEMENTATION_ORDER

1. `entities/progress/progressWatcher.gateway.ts` + `entities/review/claudeReviewInvoker.gateway.ts`
   — innermost ports; no deps; enables stubs. (Walking-skeleton seam.)
2. `src/tests/stubs/{progressWatcher,claudeReviewInvoker,diffMetadataFetch}.stub.ts` — test doubles.
3. `executeReview.usecase.ts` + its unit test — RED→GREEN the reconciled block incl. bug-fix
   regression case (the core deliverable; everything else is wiring).
4. Migrate **GitHub review processor** first — it carries the bug; proves the fix end-to-end.
5. Migrate GitHub followup, then GitLab review, then GitLab followup processors.
6. Update both controller dependency interfaces; remove dead imports.
7. Wire in `src/main/routes.ts` (composition root) — LAST.
8. `yarn verify`.

---

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
         Focus Stage-1 DoD: (1) one shared executeReview drives all 4 paths; (2) GitHub
         review uses primary/fallback (context primary, stdout fallback — NOT both);
         (3) review failure returns failed → caller throws for retry."
```

---

## REFERENCE_FILES

- `src/modules/review-execution/usecases/triggerReview.usecase.ts` — function-style + deps template
- `src/modules/review-execution/usecases/handleReviewRequestPush.usecase.ts` — composing a use case
- `src/modules/review-execution/services/contextActionsExecutor.ts` — `executeActionsFromContext` (primary)
- `src/modules/review-execution/services/dispatchConstrainedActions.ts` — safe fallback (chosen over executeThreadActions)
- `src/modules/review-execution/services/threadActionsExecutor.ts` — `executeThreadActions` (legacy GitHub fallback, to drop)
- `.../controllers/webhook/gitlab.controller.ts` ~630-835 & ~1057-1249 — 2 GitLab blocks
- `.../controllers/webhook/github.controller.ts` ~541-735 & ~927-1102 — 2 GitHub blocks (review = bug)
- `src/frameworks/claude/claudeInvoker.ts` ~427 (`invokeClaudeReview`), ~273 (`InvocationResult`), ~790 (`sendNotification`)
- `src/main/websocket.ts` ~165/180 — `start/stopWatchingReviewContext` signatures
- `src/main/routes.ts` ~444-467 — current processor-builder wiring
- `src/modules/review-execution/entities/reviewContext/reviewContext.gateway.ts` — contract
- `src/tests/stubs/reviewContextGateway.stub.ts` — stub pattern reference

---

## RESOLVED DECISIONS (locked — implementer MUST follow)

1. **Fallback executor unification (divergence #2).** ✅ RESOLVED: use `dispatchConstrainedActions`
   (provenance + authenticated-inventory, SPEC-198) for BOTH platforms. GitHub's legacy
   `executeThreadActions` fallback is dropped; GitHub gains the constrained chokepoint. Accepted
   behaviour change (fallback path only fires when no context actions exist — rare).
2. **Action-executor injection shape.** ✅ RESOLVED: option (A) — inject the two service fns
   (`executeContextActions`, `executeFallbackActions`) for Stage 1. No `ReviewActionExecutor` port.
3. **`ClaudeReviewInvoker`.** ✅ RESOLVED: small named port carrying `ClaudeReviewResult`
   (mockable). Defined in `entities/review/claudeReviewInvoker.gateway.ts`.
4. **Spec staleness — scoped-down bug claim.** ✅ RESOLVED: confirmed. Only live bug = GitHub-review
   **dual action execution**. Throw-uniformity already holds (both paths throw today). Fix only
   the dual execution; do NOT change throw behaviour.
5. **Thread-fetch pinning (divergence #3).** ✅ RESOLVED: PRESERVE per-site strategy via injected
   `resolveThreads` (GitLab review = pinned target, GitLab followup = pinned threads, GitHub = plain).
   Do NOT upgrade GitHub to pinning (out of scope for Stage 1).
