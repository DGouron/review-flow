# Plan — Guard oversized merge requests (SPEC-209)

> Source spec: `docs/specs/209-mr-size-guard.md`
> Status: planned

PLAN:
  scope: oversized merge request guard (diff-size gate, fail-open, FR split comment)
  is_new_module: false (extends `shared-kernel`, `platform-integration`, `config`)

## Architecture summary (inside-out)

```
config (maxDiffLines parse + resolver)
        │
entities/diffSizeGate  (pure gate)            entities/changedFilesFetch.gateway (port)
        │                                               │
        └──────────────► usecase guardDiffSize ◄────────┘ (+ FR comment builder)
                                   │
              gateways: changedFilesFetch.{gitlab,github}  (per-file impls)
                                   │
              controllers: gitlab + github  (one shared helper, 3 gated sites each)
                                   │
                              main/routes.ts  (DI wiring — LAST)
```

The guard is a single use case `guardDiffSize` that: resolves budget → fetches per-file changes (fail-open) → runs the pure gate → returns a verdict (`{ blocked, countedLines, budget, message }`). Controllers call it at each gated site and act on the verdict (skip enqueue / revoke + comment).

## CONFIG CHANGES (modify, not create)

### Per-project config — `src/config/projectConfig.ts`
- ADD `maxDiffLines?: number` to `ProjectConfig` interface (after `qualityThreshold?`).
- ADD `parseMaxDiffLines(value: unknown): number | undefined` — mirror `parseQualityThreshold`: positive integer (`Number.isInteger && value >= 1`), throw `'Invalid maxDiffLines: must be a positive integer'` on invalid, `undefined` on absent/null.
- WIRE in `parseProjectConfig` (after the `qualityThreshold` block ~line 241): `const maxDiffLines = parseMaxDiffLines(parsed.maxDiffLines); if (maxDiffLines !== undefined) config.maxDiffLines = maxDiffLines;`
- Test: extend `src/tests/units/config/projectConfig.test.ts` (verify file exists; if not, the new cases live wherever the existing projectConfig tests are — see REFERENCE_FILES).

### Global config — `src/frameworks/config/configLoader.ts`
- ADD optional `maxDiffLines?: number` to the `Config` interface (top-level, alongside `triggerMode`).
- PARSE in `validateAndEnrichConfig`: read `config.maxDiffLines`, validate positive integer when present (throw FR message on invalid, mirror `triggerMode`/`jobHistoryRetentionDays` style), include in returned object only when defined.
- Re-export already covered by `src/config/loader.ts` (`Config` type is re-exported).
- Test: extend the configLoader test (see REFERENCE_FILES).

DESIGN NOTE — keep budget resolution OUT of these files. Resolution (per-project → global → 2000) is a one-liner closure built in `routes.ts` (mirrors `getQualityThreshold`), injected as `getMaxDiffLines`.

## ENTITIES

### 1. Pure gate — `evaluateDiffSizeGate`
  name: DiffSizeGate (pure function, NO class — mirrors `resolveProjectIdentifier`)
  file: src/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.ts
  test: src/tests/units/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.test.ts
  signature: `evaluateDiffSizeGate(input: { files: ChangedFile[]; budget: number }) → { oversized: boolean; countedLines: number; budget: number }`
  logic:
    - EXCLUDED set (hardcoded basenames): `package.json`, `yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`
    - match by basename (`path.split('/').pop()`)
    - countedLines = Σ (additions + deletions) over non-excluded files
    - oversized = countedLines > budget (strictly greater)
  type `ChangedFile = { path: string; additions: number; deletions: number }` — declare here (this is the canonical changed-file shape, also used by the gateway port).
  NO schema/guard needed: input comes from our own gateways (typed), not from an external webhook boundary. (anti-overengineering: a Zod guard here would validate data we already typed — YAGNI. Boundary validation happens inside each gateway impl when parsing the API JSON.)

## GATEWAYS

### 2. Per-file changed-files port (NEW — existing diffStats is TOTALS only, insufficient)
  name: ChangedFilesFetchGateway
  contract: src/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.ts
  method: `fetchChangedFiles(projectIdentifier: string, mergeRequestNumber: number): ChangedFile[] | null`
  returns `null` on fetch failure (fail-open signal) — same contract style as `DiffStatsFetchGateway`.
  stub: src/tests/stubs/changedFilesFetch.stub.ts  (mirror `diffStatsFetch.stub.ts`: `setResponse`, `setFailure`, `fetchCallCount`, `lastProjectIdentifier`)

### 3a. GitLab impl
  implementation: src/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.gitlab.gateway.ts
  transport: GraphQL via `glab api graphql -f query='…'` (SimpleCommandExecutor — same pattern as `diffStatsFetch.gitlab.gateway.ts`)
  query: `query { project(fullPath:"<path>") { mergeRequest(iid:"<iid>") { diffStats { path additions deletions } } } }`
  parse: read `data.project.mergeRequest.diffStats` (array). On any structural mismatch or executor throw → return `null` (fail-open at gateway level too; wrap in try/catch like the github diffStats impl).
  test: src/tests/units/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.gitlab.gateway.test.ts

### 3b. GitHub impl
  implementation: src/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.github.gateway.ts
  transport: `gh api repos/<owner>/<repo>/pulls/<n>/files` → array of `{ filename, additions, deletions }`
  map: `filename → path`. NOTE: GitHub paginates `/files` at 30 per page; for the size gate the first page is acceptable for v1 (see RISKS). Use `--paginate` if the executor supports it — verify before relying on it.
  parse: try/catch → return `null` on throw or non-array (fail-open).
  test: src/tests/units/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.github.gateway.test.ts

## USECASES

### 4. guardDiffSize
  name: guardDiffSize
  file: src/modules/platform-integration/usecases/guardDiffSize.usecase.ts
  test: src/tests/units/modules/platform-integration/usecases/guardDiffSize.usecase.test.ts
  type: query (no state mutation; pure orchestration + side-effect-free verdict)
  shape (mirror `handlePlatformApproval` verdict + free `buildSplitMessage()`):
    input: `{ projectIdentifier: string; mergeRequestNumber: number; budget: number }`
    deps: `{ changedFilesFetchGateway: ChangedFilesFetchGateway }`
    output:
      | `{ kind: 'allowed' }`                         // not oversized OR fetch failed (fail-open)
      | `{ kind: 'blocked'; countedLines; budget; message }`
  logic:
    1. `const files = gateway.fetchChangedFiles(...)` inside try/catch → on null/throw return `{ kind: 'allowed' }` (fail-open, scenario "fetch failure")
    2. `const { oversized, countedLines } = evaluateDiffSizeGate({ files, budget })`
    3. if not oversized → `{ kind: 'allowed' }`
    4. if oversized → `{ kind: 'blocked', countedLines, budget, message: buildSplitMessage(countedLines, budget) }`
  `buildSplitMessage(countedLines, budget)` — free function in the usecase file (mirrors `buildRevertMessage`):
    concise FR comment stating `countedLines` vs `budget` + 2-3 split tips. NOT verbose. Draft:
    > « Revue refusée : cette MR fait <countedLines> lignes comptées (budget <budget>). Pour faciliter la revue, découpez-la : 1) séparez refactorings et nouvelles fonctionnalités, 2) extrayez les changements indépendants dans des MR dédiées, 3) limitez chaque MR à une seule intention. »
    (tips wording left negotiable per spec.)

## SHARED HELPER (controller-level, DRY across 6 sites)

A single async helper applied at every gated site, kept in a controller-adjacent file (NOT a usecase — it does I/O orchestration of comment/revoke which are interface-adapter concerns):
  name: applyDiffSizeGuard
  file: src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts
  test: src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.test.ts
  signature:
    ```
    applyDiffSizeGuard(input: {
      projectIdentifier; localPath; mergeRequestNumber;
      mode: 'review' | 'followup' | 'approve';
      deps: { guardDiffSize; getMaxDiffLines; noteCommentPostGateway; approvalRevocationGateway };
      revokeArgs?: { reviewId?; dismissalMessage? };   // github approve passes reviewId
      logger;
    }) → Promise<{ blocked: boolean }>
    ```
  behavior:
    - budget = `deps.getMaxDiffLines(localPath)`
    - verdict = `await deps.guardDiffSize.execute({ projectIdentifier, mergeRequestNumber, budget })` (usecase is sync over a sync gateway today — confirm; if sync, no await needed)
    - if `kind === 'allowed'` → `{ blocked: false }`
    - if `kind === 'blocked'`:
        - mode `approve`: best-effort `revoke(...)` (try/catch warn) THEN best-effort `postComment(message)` (try/catch warn)
        - mode `review`: best-effort `postComment(message)` (try/catch warn)
        - mode `followup`: NO comment (anti-spam, spec rule) — block silently
        - return `{ blocked: true }`
  RATIONALE for a helper vs use case: revoke + comment are interface-adapter side effects (ACL), and the per-mode comment/anti-spam policy is presentation/UX policy, not a domain rule. Keeping it in interface-adapters respects the Dependency Rule and avoids leaking gateways into the usecase layer beyond the one fetch gateway.

## CONTROLLERS (modify — 3 gated sites each)

Add to BOTH `GitLabWebhookDependencies` and `GitHubWebhookDependencies`:
  - `guardDiffSize: GuardDiffSizeUseCase`
  - `getMaxDiffLines: (localPath: string) => number`
(`noteCommentPostGateway` and `approvalRevocationGateway` already present in both.)

### `gitlab.controller.ts`
  - APPROVE site (~line 344-438, `filterGitLabMrApprove` block): BEFORE the existing quality-gate transition, call `applyDiffSizeGuard({ mode: 'approve', ... })`. If `blocked` → reply `{ status: 'unapproved', reason: 'oversized' }` and return (skip quality-gate path).
  - REVIEW enqueue site (~line 644-741): AFTER budget check (~665-686), BEFORE `gateClaudeInvocation`/`enqueueReview` (~688). If `blocked` → reply `{ status: 'rejected', reason: 'oversized' }` and return.
  - FOLLOWUP site (~line 488-592): AFTER followup budget check (~515-536), BEFORE followup gate/enqueue (~556). mode `followup` → if `blocked` → reply `{ status: 'rejected', reason: 'oversized' }` and return (no comment).

### `github.controller.ts`
  - APPROVE site (`handleGitHubPullRequestReviewHook` ~line 122-227): BEFORE quality-gate transition (~158). mode `approve`, pass `revokeArgs: { reviewId: filterResult.reviewId, dismissalMessage: 'oversized' }`. If `blocked` → reply `{ status: 'unapproved', reason: 'oversized' }`.
  - REVIEW enqueue site (~line 582-659): AFTER budget check (~604-625), BEFORE `gateClaudeInvocation`/`enqueueReview`.
  - FOLLOWUP site (~line 435-512): AFTER followup budget check, BEFORE gate/enqueue. mode `followup`, no comment.

Both controllers resolve `projectIdentifier` from the existing `filterResult.projectPath` / `approveResult.projectPath` (the `group/project` or `owner/repo` form already used for revoke + comment gateways at these sites — verified identical to what `approvalRevocationGateway.revoke` receives).

## WIRING — `src/main/routes.ts` (LAST step)

For EACH of the GitLab and GitHub `handle*Webhook` deps objects (~lines 578-619 and ~652-691):
  - `guardDiffSize: new GuardDiffSizeUseCase({ changedFilesFetchGateway: new GitLab|GitHubChangedFilesFetchGateway(defaultGitLab|GitHubExecutor) })`
  - `getMaxDiffLines: (localPath) => loadProjectConfig(localPath)?.maxDiffLines ?? globalConfig.maxDiffLines ?? 2000`
    - `globalConfig` = the already-loaded `deps.config` / `loadConfig()` result available in routes (verify the in-scope variable name; `deps.config` is used at line 602/676 `getRepositories: () => deps.config.repositories`).
  - import the two new gateways + the use case at top of routes.ts (mirror existing `GitLabDiffStatsFetchGateway` import lines 133-134).

## TEST MAPPING (spec rule/scenario → test)

| Spec rule / scenario | Test file | Test |
|---|---|---|
| counted size excludes package.json + lockfiles | diffSizeGate.test.ts | "lockfiles excluded" → counted 30; "package.json excluded" → counted 10 |
| oversized = counted strictly > budget | diffSizeGate.test.ts | counted == budget → not oversized; counted == budget+1 → oversized |
| under budget gitlab | guardDiffSize.usecase.test.ts | files counted 60, budget 2000 → `{ kind: 'allowed' }` |
| over budget review | guardDiffSize.usecase.test.ts | counted 2500, budget 2000 → `{ kind: 'blocked', countedLines:2500, message contains 2500/2000 }` |
| FR split comment content | guardDiffSize.usecase.test.ts | message is FR, mentions counted + budget, has split tips |
| fail-open: fetch throws | guardDiffSize.usecase.test.ts | stub `setFailure` → `{ kind: 'allowed' }`, no message |
| fail-open: fetch returns null | guardDiffSize.usecase.test.ts | stub null → `{ kind: 'allowed' }` |
| per-repo override 500 → counted 800 oversized | projectConfig.test.ts (parse) + guardDiffSize (budget 500, counted 800 → blocked) | |
| global fallback 1000 → counted 1200 oversized | configLoader.test.ts (parse) + routes resolver (covered by acceptance) | |
| default budget 2000 → counted 2100 oversized | guardDiffSize (budget 2000, counted 2100 → blocked) | |
| GitLab per-file fetch parses diffStats | changedFilesFetch.gitlab.gateway.test.ts | parses array; null on throw/malformed |
| GitHub per-file fetch parses /files | changedFilesFetch.github.gateway.test.ts | maps filename→path; null on throw/non-array |
| approve oversized → revoke + comment | diffSizeGuard.helper.test.ts | mode approve blocked → revoke called + comment called |
| review oversized → comment, no revoke | diffSizeGuard.helper.test.ts | mode review blocked → comment called, revoke NOT called |
| followup oversized → no comment (anti-spam) | diffSizeGuard.helper.test.ts | mode followup blocked → revoke NOT called, comment NOT called |
| revoke/comment failure is best-effort | diffSizeGuard.helper.test.ts | gateway throws → still returns `{ blocked: true }`, warn logged |
| end-to-end both platforms | 209-mr-size-guard.acceptance.test.ts | over-budget review blocked + comment; under-budget enqueued; approve revoked |

## REUSE — NOT REINVENT

| Need | Reuse | Do NOT create |
|---|---|---|
| Approval revocation | `ApprovalRevocationGateway` (`deps.approvalRevocationGateway`, both impls wired) | new revoke gateway |
| FR comment posting | `NoteCommentPostGateway` (`deps.noteCommentPostGateway`, egress-scanned in routes) | new comment gateway |
| Verdict + FR message pattern | `handlePlatformApproval.usecase.ts` (`buildRevertMessage` free fn) | new pattern |
| Pure-function entity | `resolveProjectIdentifier` (no class) | a class for the gate |
| Per-project resolver closure | `getQualityThreshold` precedent in routes (3 sites) | resolver inside config files |
| Stub shape | `diffStatsFetch.stub.ts` | bespoke stub style |
| Factory style | `diffStats.factory.ts` | hardcoded test data |
| Command executor | `SimpleCommandExecutor` + `defaultGitLab/GitHubExecutor` | new executor |
| Config parse style | `parseQualityThreshold` | new validation lib |

EXPLICITLY NOT reused: `DiffStatsFetchGateway` — it returns TOTALS (`additions/deletions/commitsCount`) with no per-file paths, so it cannot exclude lockfiles/package.json. A new per-file gateway is mandatory. (verified: `diffStats.ts` shape + both impls.)

## IMPLEMENTATION_ORDER (inside-out; step 1 = walking skeleton)

1. `diffSizeGate.ts` + test — pure gate, the heart of the feature. Walking-skeleton domain core; everything else depends on its `ChangedFile` type. No external deps → fastest RED→GREEN.
2. `changedFilesFetch.gateway.ts` (port) + `changedFilesFetch.stub.ts` — contract the usecase will depend on.
3. `guardDiffSize.usecase.ts` + test (uses stub) — orchestration + FR message; covers fail-open + budget scenarios.
4. `projectConfig.ts` `maxDiffLines` parse + test — per-project budget.
5. `configLoader.ts` global `maxDiffLines` + test — global fallback.
6. `changedFilesFetch.gitlab.gateway.ts` + test — real GraphQL parse.
7. `changedFilesFetch.github.gateway.ts` + test — real `/files` parse.
8. `diffSizeGuard.helper.ts` + test — DRY controller helper, per-mode comment/revoke/anti-spam policy.
9. `gitlab.controller.ts` — wire deps interface + 3 gated sites.
10. `github.controller.ts` — wire deps interface + 3 gated sites.
11. `main/routes.ts` — DI wiring for both webhooks (composition root, LAST).
12. `209-mr-size-guard.acceptance.test.ts` — written FIRST by implementer (RED), GREEN here.

## REFERENCE_FILES

- `docs/specs/209-mr-size-guard.md` — the spec (rules + scenarios)
- `src/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.ts` — pure-function entity precedent (no class)
- `src/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.ts` — verdict + `buildRevertMessage` free-fn pattern to mirror
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` — GraphQL executor pattern
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.ts` — `gh api` executor + try/catch null pattern
- `src/tests/stubs/diffStatsFetch.stub.ts` — stub shape to mirror
- `src/tests/factories/diffStats.factory.ts` — factory style
- `src/config/projectConfig.ts` — `parseQualityThreshold` to mirror for `maxDiffLines`
- `src/frameworks/config/configLoader.ts` — global `Config` interface + validation style
- `src/main/routes.ts` (lines 133-134, 250-251, 578-619, 652-691) — DI wiring + `getQualityThreshold` resolver precedent
- `gitlab.controller.ts` / `github.controller.ts` — gated sites + existing revoke/comment usage to mirror
- Locate config tests: `src/tests/units/config/projectConfig.test.ts` and the configLoader test (run `Glob src/tests/**/*config*`) before editing — verify exact paths.

## RISKS / CONCERNS

- FILE COUNT: ~10 new files + ~5 modified = ~15 touched. Spec claims "<16 files" — within budget but at the edge. No room for scope creep.
- GitHub `/files` PAGINATION: `gh api repos/.../pulls/{n}/files` returns 30 files/page by default. A large MR with >30 changed files would undercount unless `--paginate` is used. For v1, fail-open semantics make undercounting "safe" (never a false block) but could let a genuinely-huge MR slip through. RECOMMENDATION: use `gh api --paginate` if the executor passes it through; otherwise accept the v1 limitation and note it. FLAG to user — confirm acceptable.
- GitLab GraphQL `diffStats` field: VERIFIED the existing gitlab diffStats gateway already calls `diffStatsSummary` successfully via `glab api graphql`; the per-file `diffStats { path additions deletions }` field is the documented sibling. Implementer must validate the exact GraphQL field name against a real MR before trusting it (anti-hallucination) — do a manual `glab api graphql` probe.
- `projectIdentifier` vs `projectPath`: at the gated sites controllers already pass `*.projectPath` to `revoke`/`postComment`. The new per-file gateways must accept the SAME identifier form (`group/project` for GitLab, `owner/repo` for GitHub). VERIFIED both revoke and comment use `projectPath` at these sites → reuse it directly, do not re-resolve.
- usecase sync vs async: existing fetch gateways are SYNCHRONOUS (`fetchDiffStats` returns, not Promise). `guardDiffSize` can therefore be sync; the helper stays async only for the revoke/comment awaits. Keep the usecase sync to match the gateway contract (do not gratuitously make it async).
- ANTI-OVERENGINEERING VERDICT: scope is justified. One new pure entity, one new gateway (2 impls), one usecase, one controller helper. NO Zod schema/guard for `ChangedFile` (typed internal data, not a webhook boundary), NO new module, NO value object, NO presenter/view (dashboard surfacing is explicitly out of scope). Helper is a plain function, not a strategy hierarchy despite 3 modes.

## ACCEPTANCE_TEST

  file: src/tests/acceptance/209-mr-size-guard.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
  covers: over-budget review (no enqueue + FR comment), over-budget approve (revoke + FR comment), under-budget (normal enqueue, no comment), fail-open (fetch failure → normal), both GitLab and GitHub.
