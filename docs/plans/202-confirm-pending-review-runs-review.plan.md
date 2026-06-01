# Plan — Run the real review when a parked request is confirmed (spec-202)

> Status: PLANNED. Source spec: `docs/specs/202-confirm-pending-review-runs-review.md`.
> Worktree: `.claude/worktrees/spec-202-confirm-pending-review`. All paths below are repo-root-relative.
> **User decision (2026-06-01): GitLab AND GitHub in the SAME iteration. No split.**

## Summary

The confirmation path is fully built EXCEPT the `resolveProcessor` seam in the composition
root, which is currently a no-op stub (`routes.ts:277-281`). The fix is to **instantiate the
already-present `ProcessorRegistry` at the composition root**, register BOTH a GitLab and a
GitHub `ProcessorBuilder` at boot, and replace the stub with `(pending) => registry.resolve(pending)`.

Two pieces of genuinely NEW code:
1. **The "project no longer configured" reject** (scenario `project no longer available`),
   enforced at confirm time BEFORE enqueue and BEFORE deleting the pending entry. New
   `ConfirmPendingReviewResult` variant + an injected `isProjectRunnable` predicate.
2. **`buildGitHubReviewProcessor`** — extract the inline GitHub processor closure
   (`github.controller.ts:789-961`) into a curried builder mirroring `buildGitLabReviewProcessor`
   (`gitlab.controller.ts:955`). The full-auto webhook path then calls the extracted builder,
   keeping behaviour byte-for-byte identical.

The two GitHub risks flagged earlier are RESOLVED concretely (see dedicated sections below):
- **Extraction**: the inline closure only reads `j.*` (the job) and `deps.*` — it never closes
  over `event`/`repoConfig`, so it lifts cleanly into `(deps, logger)(job)` exactly like GitLab.
- **clone_url at confirm time**: NOT needed. The persisted `job.projectPath` for GitHub is
  `event.repository.full_name` = `owner/repo` (eventFilter.ts:338), and
  `findRepositoryByProjectPath` already matches GitHub configs because it derives `owner/repo`
  from `repo.remoteUrl` (configLoader.ts:360-364). **Chosen approach = (a), no schema change.**

---

## PLAN (single iteration — GitLab + GitHub)

```
PLAN:
  scope: confirm-pending-review-runs-review (GitLab + GitHub, one iteration)
  is_new_module: false

  ENTITIES / SCHEMA:
    - (NO schema change) PendingReviewRequest snapshot already sufficient for BOTH platforms.
      reviewJobSnapshotSchema is NOT modified — clone_url/remoteUrl deliberately NOT added
      (see "GitHub repo resolution" — option (a) chosen). This means ZERO migration impact on
      already-parked GitHub requests: existing pending-*.json files remain valid and confirmable.

  USECASES:
    - name: confirmPendingReview (MODIFY existing)
      file: src/modules/review-execution/usecases/confirmPendingReview.usecase.ts
      test: src/tests/units/modules/review-execution/usecases/confirmPendingReview.usecase.test.ts
      type: command
      input: { pendingId: string }
      output: ConfirmPendingReviewResult
              | { status: 'confirmed'; jobId }
              | { status: 'not-found' }
              | { status: 'already-running'; message }
              | { status: 'project-not-configured'; message }   <-- NEW
      change:
        - Add dependency `isProjectRunnable: (pending: PendingReviewRequest) => boolean`,
          checked AFTER not-found and already-running, BEFORE resolveProcessor + enqueue + delete.
        - On false → return { status: 'project-not-configured',
                              message: "Le projet associé n'est plus configuré" }.
        - Pending entry is NOT deleted on reject (stays on the waiting list).
        - Platform-agnostic: the use case never branches on platform. Platform resolution lives
          entirely in the injected `isProjectRunnable` (config lookup) and `resolveProcessor`
          (registry keyed by platform). Keeps the application layer clean.

  SERVICES:
    - name: ProcessorRegistry (EXISTING — instantiate, do not modify)
      file: src/modules/review-execution/services/processorRegistry.ts
      role: maps {triggerSource, platform, jobType} → ProcessorBuilder; resolve(pending)
            keys on pending.platform / pending.jobType / pending.triggerSource and returns the
            matching builder, then calls builder(pending.job). Already throws on missing key
            (processorRegistry.ts:34-39).
      test: src/tests/units/modules/review-execution/services/processorRegistry.test.ts (NEW)
      note: registry currently has NO unit test. Add one covering: gitlab resolve hit, github
            resolve hit, and resolve miss throws. Production-critical now.

  CONTROLLERS — processor builder extraction (GitHub):
    - name: buildGitHubReviewProcessor (NEW export, extracted — no behaviour change)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
      test: src/tests/units/modules/platform-integration/controllers/githubProcessorProvenance.test.ts (NEW)
            — mirror gitlabProcessorProvenance.test.ts: assert fail-closed when projectPath is
              not configured (fetchThreads never called, processor rejects).
      signature: export function buildGitHubReviewProcessor(deps: GitHubReviewProcessorDeps,
                   logger: Logger): ProcessorBuilder
                 where ProcessorBuilder = (job) => (job, signal) => Promise<void>
      WHAT MOVES (out of handlePullRequestEvent, into the module-level builder):
        - The entire inline `const reviewProcessor = async (j, signal) => { ... }`
          body at github.controller.ts:789-961 becomes the inner returned function.
        - It already reads ONLY `j.*` and `deps.*` (reviewContextGateway, threadFetchGateway,
          diffMetadataFetchGateway, diffStatsFetchGateway, claudeInvokerDeps, noteCommentPostGateway,
          recordCompletion) plus module-level helpers (invokeClaudeReview, sendNotification,
          startWatchingReviewContext/stopWatchingReviewContext, getProjectAgentsOrFocusDefaults,
          DEFAULT_AGENTS, parseReviewOutput, parseThreadActions, executeThreadActions,
          executeActionsFromContext, ReviewContextResultFactory, loadProjectConfig,
          updateJobProgress). None of these depend on `event` or `repoConfig` from the outer scope.
        - GitHubReviewProcessorDeps = Pick<GitHubWebhookDependencies,
            'reviewContextGateway' | 'threadFetchGateway' | 'diffMetadataFetchGateway'
            | 'diffStatsFetchGateway' | 'recordCompletion' | 'claudeInvokerDeps'
            | 'noteCommentPostGateway'>   (mirror GitLabReviewProcessorDeps, gitlab.controller.ts:945)
      WHAT STAYS in handlePullRequestEvent (unchanged behaviour):
        - All steps up to job construction: parse, filter, findRepositoryByRemoteUrl(clone_url),
          trackAssignment, job build (lines ~690-764), budget enforcement (766-787).
        - The gate/enqueue dispatch (963-991): change ONLY the source of `reviewProcessor` to
          `const reviewProcessor = buildGitHubReviewProcessor(deps, logger)(job);` (mirrors
          gitlab.controller.ts:875). Everything else byte-for-byte identical.
      ADD fail-closed parity (NEW, behaviour-preserving for full-auto):
        - At the TOP of the returned inner function, add the same guard GitLab has
          (gitlab.controller.ts:960-963):
            const repoConfig = findRepositoryByProjectPath(j.projectPath);
            if (!repoConfig) throw new Error(`No GitHub repository configured for projectPath "${j.projectPath}"`);
          Full-auto is unaffected (repo was just resolved upstream, so it is configured);
          confirm-time gets defense-in-depth behind the use-case-level isProjectRunnable reject.
      REGRESSION GUARD: existing github.controller tests must stay green. The extraction is a pure
        "extract function" refactor; run the full github.controller.test.ts suite after.

  WIRING (composition root — the core of this spec):
    file: src/main/routes.ts
    additions:
      1. SEQUENCING: move the pending-review wiring block (confirmPendingReview etc., currently
         260-312) to AFTER claudeInvokerDeps (built at 314) AND after the GitLab + GitHub
         framework gateways are available. The webhook gateways are constructed inline inside the
         route handlers today (threadFetchGw at 397, gitHubThreadFetchGw at 470, plus per-handler
         diff/note gateways). For the registry builders we construct ONE shared instance of each
         platform's gateways at boot (they are stateless CLI gateways) and reuse them.
      2. Instantiate registry + register BOTH builders at boot:
           const processorRegistry = new ProcessorRegistry();

           const gitLabReviewProcessorDeps = {
             reviewContextGateway: deps.reviewContextGateway,
             threadFetchGateway: new GitLabThreadFetchGateway(defaultGitLabExecutor),
             diffMetadataFetchGateway: new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
             diffStatsFetchGateway: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
             recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
             claudeInvokerDeps,
             noteCommentPostGateway: new EgressScannedNoteCommentPostGateway(
               new GitLabNoteCommentPostCliGateway(defaultGitLabExecutor), egressScanner, egressTraceGateway),
           };
           const gitHubReviewProcessorDeps = {
             reviewContextGateway: deps.reviewContextGateway,
             threadFetchGateway: new GitHubThreadFetchGateway(defaultGitHubExecutor),
             diffMetadataFetchGateway: new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor),
             diffStatsFetchGateway: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
             recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
             claudeInvokerDeps,
             noteCommentPostGateway: new EgressScannedNoteCommentPostGateway(
               new GitHubNoteCommentPostCliGateway(defaultGitHubExecutor), egressScanner, egressTraceGateway),
           };
           const gitLabBuilder = buildGitLabReviewProcessor(gitLabReviewProcessorDeps, deps.logger);
           const gitHubBuilder = buildGitHubReviewProcessor(gitHubReviewProcessorDeps, deps.logger);

           for (const triggerSource of ['webhook-initial','webhook-followup','dashboard-manual'] as const)
             for (const jobType of ['review','followup'] as const) {
               processorRegistry.register({ triggerSource, platform:'gitlab', jobType }, gitLabBuilder);
               processorRegistry.register({ triggerSource, platform:'github', jobType }, gitHubBuilder);
             }
         NOTE on egressScanner/egressTraceGateway: today these are built at routes.ts:399-400,
         AFTER the pending wiring. The pending/registry block must sit below line 400. Confirm exact
         final ordering during implementation; the goal is one cohesive block after all boot
         gateways + claudeInvokerDeps + egress scanner exist.
      3. Replace routes.ts:277-281 stub:
           resolveProcessor: (pending) => processorRegistry.resolve(pending),
      4. Inject the project-availability predicate (BOTH platforms via the SAME lookup):
           isProjectRunnable: (pending) =>
             findRepositoryByProjectPath(pending.job.projectPath) !== undefined
         Works for GitHub because job.projectPath = owner/repo and findRepositoryByProjectPath
         derives owner/repo from remoteUrl. Works for GitLab (path_with_namespace). Both fail
         closed on disabled/removed (configLoader.ts:358-359 filters on repo.enabled).

  ROUTES:
    - name: pendingReviewsRoutes (MODIFY existing)
      file: src/modules/review-execution/interface-adapters/controllers/http/pendingReviews.routes.ts
      test: src/tests/units/.../http/pendingReviews.routes.test.ts (verify exact path; add if missing)
      change: map 'project-not-configured' → HTTP 409 with { status, message }. Platform-agnostic.

  IMPLEMENTATION_ORDER (TDD inside-out; GitLab slice GREEN first, then GitHub):
    1. confirmPendingReview.usecase.test.ts (+usecase) — RED then GREEN:
       add 'project-not-configured' variant + isProjectRunnable dependency + branch.
       Platform-agnostic; no infra. (Foundation for BOTH platforms.)
    2. processorRegistry.test.ts — RED/GREEN: resolve gitlab hit, github hit, miss throws.
    3. pendingReviews.routes.test.ts (+route) — map 'project-not-configured' → 409.
    4. routes.ts wiring for GITLAB ONLY first: instantiate registry, register gitLabBuilder,
       swap resolveProcessor, inject isProjectRunnable.
    5. Acceptance test GitLab scenarios GREEN (confirmed/survives-restart/followup/already-running/
       unknown/project-not-configured on GitLab). << GitLab slice fully GREEN here >>
    6. githubProcessorProvenance.test.ts (RED) → extract buildGitHubReviewProcessor from the
       inline closure (github.controller.ts:789-961); wire the full-auto call site to the builder.
       Run full github.controller.test.ts to prove no regression on full-auto.
    7. routes.ts: register gitHubBuilder in the registry (same loop).
    8. Acceptance test GitHub scenarios GREEN (mirror the six on GitHub, incl. owner/repo
       projectPath resolution + a GitHub disabled-repo reject). << Both platforms GREEN >>
    9. routes.ts wiring is the LAST structural edit per house rule (covered by acceptance, no unit).

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/202-confirm-pending-review-runs-review.acceptance.test.ts
    note: "SDD outer loop — written FIRST by implementer, RED during impl, GREEN at the end."
    scenarios (run for BOTH platforms — parametrize platform where the assertion is identical):
      - confirmed runs review (gitlab + github): pending exists + project configured + no active
          run → 'confirmed' AND the registered processor actually runs (recording stub / spy on
          invokeClaudeReview).
      - survives restart (gitlab + github): construct registry + use case anew, load pending from
          a freshly-instantiated filesystem/stub gateway (no carried-over closure) → 'confirmed' +
          processor runs. For github: assert resolution works from the persisted owner/repo
          projectPath WITHOUT any clone_url in the snapshot.
      - follow-up preserved (gitlab + github): pending.jobType='followup' → builder resolves the
          followup variant → 'confirmed' + followup run.
      - already running (platform-agnostic): hasActiveJob → true → reject
          "Cette review est déjà en cours".
      - unknown request (platform-agnostic): unknown pendingId → reject
          "Cette review en attente est introuvable" (see Open Question 1 on where the message lives).
      - project no longer available (gitlab + github): findRepositoryByProjectPath returns
          undefined (missing OR disabled) → reject "Le projet associé n'est plus configuré".
          GitHub case: pending has projectPath=owner/repo whose config is disabled/removed.

  REFERENCE_FILES:
    - src/main/routes.ts:260-312 (wiring to move/replace), 314-348 (claudeInvokerDeps order),
      397/399-400/470 (gateway + egress construction order), 421-517 (both webhook DI blocks).
    - src/modules/review-execution/usecases/confirmPendingReview.usecase.ts — use case to modify.
    - src/modules/review-execution/services/processorRegistry.ts:27-41 — resolve keys on
      platform/jobType/triggerSource; the intended seam for BOTH platforms.
    - src/modules/review-execution/usecases/gateClaudeInvocation.usecase.ts — processor type +
      EnqueueReviewFunction; how the run path is shaped.
    - gitlab.controller.ts:875 (full-auto call site), :945-953 (GitLabReviewProcessorDeps Pick),
      :955-963 (builder signature + fail-closed guard to mirror), :955-1148 (full processor body).
    - github.controller.ts:689-764 (stays: repo resolve + job build), :789-961 (inline processor
      to EXTRACT), :963-991 (gate/enqueue dispatch — only the processor source changes).
    - eventFilter.ts:338 — GitHub filterResult.projectPath = event.repository.full_name (owner/repo).
    - configLoader.ts:31 (RepositoryConfig has `platform`), :340-351 (findRepositoryByRemoteUrl),
      :353-366 (findRepositoryByProjectPath derives owner/repo from remoteUrl; filters on enabled).
    - pendingReviewRequest.schema.ts — proves snapshot sufficiency; NOT modified.
    - pendingReviews.routes.ts — result→HTTP mapping to extend.
    - src/tests/units/modules/platform-integration/controllers/gitlabProcessorProvenance.test.ts
      — template for the new githubProcessorProvenance.test.ts.
    - src/tests/factories/pendingReviewRequest.factory.ts — add a GitHub variant + a
      disabled-project variant for the reject scenarios.
    - src/tests/stubs/pendingReviewRequest.stub.ts — gateway stub used by the unit test.
```

---

## resolveProcessor replacement strategy (the heart of the spec)

**Current (routes.ts:277-281):** a no-op that logs and skips Claude.

**Target:**
```
resolveProcessor: (pending) => processorRegistry.resolve(pending),
```

`processorRegistry.resolve(pending)` keys on `pending.platform` (gitlab|github), `pending.jobType`
(review|followup) and `pending.triggerSource`, looks up the registered `ProcessorBuilder`, then
calls `builder(pending.job)` to rebuild the real processor (processorRegistry.ts:27-41). The
builder closes over **framework gateways created at boot** (CLI gateways + claudeInvokerDeps),
which are re-created on every server start — so the rebuilt processor is valid regardless of when
the pending entry was parked. Only the persisted `pending.job` snapshot drives the run; nothing
session-specific is captured.

### Registry keying — confirmed
- `ProcessorKey = { triggerSource, platform, jobType }` (processorRegistry.ts:10-14); the GitHub
  builder is registered under `platform:'github'`, the GitLab builder under `platform:'gitlab'`.
- `resolve` reads `pending.platform` / `pending.jobType` / `pending.triggerSource`
  (processorRegistry.ts:28-32) → correct builder per platform. Missing key throws (covered by the
  unit test + the use-case-level isProjectRunnable reject which runs first for the "no config" case).

---

## GitHub processor extraction — what moves, what stays (risk #1 resolved)

**Verified**: the inline `reviewProcessor` (github.controller.ts:789-961) references only `j.*`
(the job) and `deps.*` + module-level helpers. It does NOT capture `event` or the upstream
`repoConfig`. Therefore it lifts into a module-level curried builder with zero semantic change.

- **Moves** → into `buildGitHubReviewProcessor(deps, logger)`: the whole closure body (context
  file creation, threads/diff fetch, invokeClaudeReview, action execution, recordCompletion,
  notifications, the final `throw` on failure).
- **Stays** in `handlePullRequestEvent`: parse → filter → `findRepositoryByRemoteUrl(clone_url)`
  → trackAssignment → job build → budget → gate/enqueue dispatch. The ONLY edit at the call site
  is `const reviewProcessor = buildGitHubReviewProcessor(deps, logger)(job);` (mirroring
  gitlab.controller.ts:875).
- **Added** (behaviour-preserving): the same fail-closed `findRepositoryByProjectPath` guard at
  the top of the inner function that GitLab already has (gitlab.controller.ts:960-963). Harmless
  in full-auto (repo is configured), defense-in-depth at confirm time.
- **Full-auto stays identical**: same processor body, same dispatch, same HTTP responses. Proven
  by keeping github.controller.test.ts green (run after extraction).

---

## GitHub repo resolution at confirm time — option (a), NO schema change (risk #2 resolved)

**Decision: (a) resolve by `job.projectPath` at confirm time. Do NOT persist clone_url.**

Rationale (all verified against source):
- GitHub's persisted `job.projectPath` = `filterResult.projectPath` = `event.repository.full_name`
  = `owner/repo` (github.controller.ts:749 ← eventFilter.ts:338).
- `findRepositoryByProjectPath(projectPath)` strips `https?://host/` and `.git` from each
  configured `repo.remoteUrl`, lowercases, and compares to the lowercased input
  (configLoader.ts:356-364). For a GitHub repo configured with `remoteUrl =
  https://github.com/owner/repo(.git)` this yields `owner/repo` — an exact match to `full_name`.
- `RepositoryConfig` carries `platform` (configLoader.ts:31), so resolution is inherently
  platform-correct; a stray GitLab/GitHub path collision is the SAME risk already accepted by the
  GitLab webhook path, which uses this exact function.
- The reject ("disabled or removed") is covered: `findRepositoryByProjectPath` returns undefined
  when `repo.enabled === false` or the repo is absent (configLoader.ts:358-359).

**Why NOT (b) persist remoteUrl/clone_url:**
- It would require a `reviewJobSnapshotSchema` change → a migration concern for already-parked
  GitHub `pending-*.json` files (older snapshots lack the field; the schema would need it
  optional + a fallback to (a) anyway). Option (a) needs no schema change and confirms existing
  parked requests with ZERO migration. YAGNI: do not add a persisted field when an existing,
  trusted lookup already resolves it.

**Migration impact: NONE.** No schema field added; existing parked GitHub requests stay valid and
confirmable via `findRepositoryByProjectPath(job.projectPath)`.

---

## isProjectRunnable / project-not-configured — both platforms (risk #4 resolved)

Single injected predicate, identical for both platforms:
```
isProjectRunnable: (pending) => findRepositoryByProjectPath(pending.job.projectPath) !== undefined
```
- GitLab: `job.projectPath` = `path_with_namespace` → matches (existing GitLab webhook behaviour).
- GitHub: `job.projectPath` = `owner/repo` → matches per the resolution analysis above.
- Both fail closed on disabled/removed. Checked in the use case BEFORE resolveProcessor/enqueue/
  delete so the pending entry survives the reject (rule: a rejected parked review stays on the
  waiting list).

---

## INVEST / Scope — revised file count (single iteration)

Files touched (verified plan):
1. confirmPendingReview.usecase.ts (variant + predicate) — MODIFY
2. confirmPendingReview.usecase.test.ts — MODIFY (add reject test)
3. processorRegistry.test.ts — NEW
4. pendingReviews.routes.ts — MODIFY (409 mapping)
5. pendingReviews.routes.test.ts — MODIFY/NEW
6. github.controller.ts — MODIFY (extract buildGitHubReviewProcessor + fail-closed guard + call site)
7. githubProcessorProvenance.test.ts — NEW
8. main/routes.ts — MODIFY (registry + both builders + resolveProcessor + isProjectRunnable + sequencing)
9. acceptance/202-...acceptance.test.ts — NEW
10. tests/factories/pendingReviewRequest.factory.ts — MODIFY (GitHub + disabled variants)

**Total: ~10 files. Comfortably under the 15-file INVEST "Small" bound.** No new entity, no new
gateway contract, no new presenter/view, NO schema change. The registry already exists; GitLab
already has its builder. The single net-new production unit is `buildGitHubReviewProcessor`, and
it is a pure extract-function refactor of code that already exists and runs.

**Does it still fit one iteration? YES.** The earlier split recommendation was driven by the two
GitHub risks; both are now resolved with concrete, low-risk choices (clean extraction + existing
lookup, no schema/migration). The one thing to watch is the routes.ts sequencing (moving the
pending-review block below claudeInvokerDeps + egress scanner) and keeping github.controller.test.ts
green after extraction — both are mechanical, not estimation grey zones. **No split advised.**

Anti-overengineering check: do NOT add a ProcessorBuilder factory abstraction, a config-snapshot
entity, or persist clone_url. Two `buildXxxReviewProcessor` functions + one registry + one
predicate is the minimum that satisfies all six scenarios on both platforms.

---

## Open questions to confirm with the user before implementation

1. **`not-found` French message.** Spec wants "Cette review en attente est introuvable" for the
   unknown-request reject, but the use case returns `{ status:'not-found' }` with no message and
   the route returns `{ status:'not-found' }` (no message). Recommend adding the message at the
   route body (404 + message), minimal change. Confirm the dashboard surfaces `body.message`.
2. **HTTP status for `project-not-configured`** — recommend 409 (parity with already-running, both
   are "cannot run now"); 422 is the alternative.
```
