# Plan — Surface oversized-MR blocks on the dashboard with a force-launch option

Spec: `docs/specs/219-oversized-mr-force-launch-panel.md`
Builds on spec 209 (`docs/plans/209-mr-size-guard.plan.md`).

## Scope challenge (/anti-overengineering)

- No new module, no new Zod schema/guard. `TrackedMr` is a plain interface with no schema
  today (`BypassRecord` is a precedent sub-record with no factory/guard). `SizeBlockRecord`
  follows that exact shape — a bare interface field, no value object, no guard. Justified.
- Two genuine use cases (write domain state with rules): `RecordSizeBlockUseCase` (mirror of
  `RecordBypassUseCase`) and `ForceLaunchBlockedReviewUseCase` (dedup rule: clear block only
  after a successful enqueue). Both are unit-testable in isolation → justified.
- One presenter (`SizeBlockListPresenter`) mirrors the existing `OverviewPresenter` JSON-viewmodel
  pattern for a cross-project aggregation endpoint. Kept because rendering data shaping is real.
- Job construction (URL building from repo config, processor resolution) stays in the route,
  matching the existing `/api/mr-tracking/followup` precedent — NOT pushed into a use case.

## Corrections to the briefing (verified against source)

1. **WRONG in briefing**: "`maxDiffLines` already fully supported ... in the project-config HTTP
   route/usecase — ONLY the dashboard settings modal UI is missing the input." Verified false.
   - `src/config/projectConfig.ts` DOES support it (read/parse: `parseMaxDiffLines` +
     `ProjectConfig.maxDiffLines`, lines 37/71-79/262-265). ✅
   - But the WRITE path does NOT: `updateProjectConfig.usecase.ts` omits `maxDiffLines` from
     `EDITABLE_PROJECT_CONFIG_KEYS` (7-15), `ProjectConfigPatch` (24-32), and `mergeConfig`
     (91-129). And `projectConfig.routes.ts` omits it from `patchBodySchema` (25-35) and
     `extractPatch` (60-114). So the dashboard→PATCH→config.json path silently drops it today.
   - Consequence: this feature must extend BOTH the update use case AND the HTTP route, not just
     the modal. (Follow the `qualityThreshold` / `maxConcurrentReviews` handling already there.)
2. Confirmed: `trackAssignment.execute(...)` runs before the review-mode guard in both controllers
   (gitlab.controller.ts:691 vs guard 731; github.controller.ts:651 vs guard 693) → the `TrackedMr`
   exists when the block fires. ✅
3. Confirmed: `TrackedMr.bypass: BypassRecord | null` precedent (trackedMr.ts:38/41-45). ✅
4. Confirmed: tracked-MR key convention — tracking file is keyed by `repoConfig.localPath`, the
   record id is `createTrackedMrId(platform, filterResult.projectPath, mrNumber)` (= remote project
   path, NOT localPath). Both controllers already have these values at the block site. ✅
5. Confirmed: `enqueueReview(job, processor)` returns `false` on dedup (mrTrackingAdvanced.routes.ts:402-405)
   → reuse for the force-launch dedup rule. ✅
6. Gap in briefing: `applyDiffSizeGuard` currently returns only `{ blocked: boolean }`
   (diffSizeGuard.helper.ts:66-98) — it does NOT expose `countedLines/budget/message`. To persist
   the block, its return type must be widened to carry the verdict details (see WIRING).

---

```
PLAN:
  scope: oversized-mr-force-launch-panel
  is_new_module: false

  ENTITIES:
    - name: SizeBlockRecord (new interface) + sizeBlock field on TrackedMr
      file: src/modules/tracking/entities/tracking/trackedMr.ts
      schema: (none — TrackedMr has no Zod schema; sibling BypassRecord has none)
      guard: (none)
      gateway_contract: src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js
                        (UNCHANGED — .update(projectPath, id, Partial<TrackedMr>) already
                        accepts the new field; no signature change needed)
      test: covered via use case + factory tests (no standalone entity test — pure interface)
      factory: src/tests/factories/trackedMr.factory.ts (add `sizeBlock: null` default +
               a `withSizeBlock(overrides)` helper)
      shape:
        SizeBlockRecord { countedLines: number; budget: number; message: string; blockedAt: string }
        TrackedMr.sizeBlock: SizeBlockRecord | null

  USECASES:
    - name: recordSizeBlock
      file: src/modules/tracking/usecases/tracking/recordSizeBlock.usecase.ts
      test: src/tests/units/modules/tracking/usecases/tracking/recordSizeBlock.usecase.test.ts
      type: command
      input: { projectPath: string; mrId: string; countedLines: number; budget: number; message: string; now: () => string }
      output: { kind: 'recorded'; sizeBlock: SizeBlockRecord } | { kind: 'mr-not-found' }
      note: mirror of RecordBypassUseCase; getById → update({ sizeBlock }). Constructor takes
            ReviewRequestTrackingGateway only.

    - name: forceLaunchBlockedReview
      file: src/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.ts
      test: src/tests/units/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.test.ts
      type: command (async — TOutput is a Promise)
      input: { projectPath: string; mrId: string; job: ReviewJob; processor: (job, signal) => Promise<void> }
      output: Promise<'launched' | 'rejected-duplicate' | 'not-blocked' | 'mr-not-found'>
      deps: { reviewRequestTrackingGateway; enqueue: (job, processor) => Promise<boolean>; logger }
      rules:
        - getById; null → 'mr-not-found'
        - sizeBlock null → 'not-blocked'
        - enqueue returns false → 'rejected-duplicate' (leave sizeBlock untouched — dedup rule)
        - enqueue true → update({ sizeBlock: null }); 'launched'
      note: job building + processor resolution happen in the ROUTE, not here.

  GATEWAYS:
    - name: ReviewRequestTrackingGateway (existing — NO change)
      contract: src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts
      implementation: src/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.ts
      stub: src/tests/stubs/reviewRequestTracking.stub.ts (InMemory... — no change: update() already
            spreads Partial<TrackedMr>, sizeBlock flows through automatically)
      methods: getById, update (used); loadTracking (used by the size-blocks aggregation route)

  CONTROLLERS:
    - name: sizeBlocksRoutes (new — GET aggregation + POST force-start)
      file: src/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.ts
      test: src/tests/units/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.test.ts
      endpoints:
        - GET /api/size-blocks
            loops getRepositories().filter(enabled) → loadTracking(localPath) →
            mrs.filter(mr.sizeBlock !== null) → presenter.present(entries) → JSON viewmodel
            (project name, mrId, mrNumber, title, url, platform, countedLines, budget, blockedAt,
             projectPath). Mirrors overview.routes.ts:63-95 loop shape.
        - POST /api/mr-tracking/force-start  Body: { mrId, projectPath }
            parse mrId `^(gitlab|github)-(.+)-(\d+)$`; validateProjectPath (reuse helper pattern
            from mrTrackingAdvanced.routes.ts:60-73); find enabled repo; getByNumber → 404 if none;
            resolve reviewSkill from loadProjectConfig (fallback 'review'); build gitProjectPath +
            mrUrl (same as followup route); build ReviewJob { jobType:'review', skill:reviewSkill,
            sourceBranch/targetBranch from trackedMr }; resolveReviewProcessor(job); delegate to
            forceLaunchBlockedReview.execute({ projectPath, mrId, job, processor }); map result →
            {success:true} / 409-style {success:false,error:'...déjà en cours...'} for
            'rejected-duplicate' / 404 for 'mr-not-found' / 200 no-op for 'not-blocked'.
      dependencies:
        - getRepositories: () => RepositoryConfig[]
        - reviewRequestTrackingGateway: ReviewRequestTrackingGateway
        - sizeBlockListPresenter: SizeBlockListPresenter
        - forceLaunchBlockedReview: ForceLaunchBlockedReviewUseCase
        - resolveReviewProcessor: (job: ReviewJob) => (job, signal) => Promise<void>
        - logger: Logger

    - name: gitlab.controller (MODIFY — persist block in review mode)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
      change: at the review-mode block site (~744) call deps.recordSizeBlock.execute({
              projectPath: repoConfig.localPath,
              mrId: createTrackedMrId('gitlab', filterResult.projectPath, mergeRequestNumber),
              countedLines/budget/message from the widened guard verdict, now }) BEFORE the reply.
              Add `recordSizeBlock` to the webhook Dependencies interface.
      test: existing gitlab.controller test file — add a "persists sizeBlock on review-mode block" case

    - name: github.controller (MODIFY — mirror of gitlab)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
      change: same treatment at review-mode block site (~705), platform 'github'.
      test: existing github.controller test file — add mirror case

    - name: diffSizeGuard.helper (MODIFY — widen return)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts
      change: return type `{ blocked: false } | { blocked: true; countedLines; budget; message }`
              (already computed in `verdict` at lines 70-85; just surface them). Approve/followup
              callers ignore the extra fields — no behavior change there.
      test: src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.test.ts
            (update assertions to the widened shape)

    - name: updateProjectConfig.usecase (MODIFY — enable maxDiffLines write path)
      file: src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts
      change: add 'maxDiffLines' to EDITABLE_PROJECT_CONFIG_KEYS; add `maxDiffLines?: number | null`
              to ProjectConfigPatch; add validateMaxDiffLines (positive integer, mirrors
              projectConfig.ts parseMaxDiffLines); handle in mergeConfig (null/undefined → omit key,
              else set) exactly like maxConcurrentReviews.
      test: src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts

    - name: projectConfig.routes (MODIFY — accept maxDiffLines in PATCH)
      file: src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts
      change: add `maxDiffLines: z.unknown().optional()` to patchBodySchema; extract in extractPatch
              (null / '' → null, numeric string → Number, number → number) like maxConcurrentReviews.
      test: existing projectConfig.routes test (add maxDiffLines round-trip case)

  PRESENTERS:
    - name: SizeBlockListPresenter
      file: src/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.ts
      test: src/tests/units/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.test.ts
      input: { entries: Array<{ mr: TrackedMr; projectName: string; projectPath: string }> }
      output: { blocks: SizeBlockViewModel[]; isEmpty: boolean }
              SizeBlockViewModel { mrId; mrNumber; title; url; platform; projectName; projectPath;
                                   countedLines; budget; blockedAt }
      note: only maps mrs whose sizeBlock is non-null; pure, no I/O. Mirrors OverviewPresenter.

  VIEWS:
    - name: sizeBlockPanel (dashboard humble object)
      file: src/dashboard/modules/sizeBlockPanel.js
      test: src/tests/units/dashboard/modules/sizeBlockPanel.test.ts
      exports: buildSizeBlockPanelModel(input) + renderSizeBlockPanelHtml(viewModel)
      behavior: renders nothing / hidden when blocks empty (Rule: panel visible only when ≥1 block);
                each row shows projectName, MR title(+link), counted/budget, a
                data-action="force-launch" button carrying data-mr-id + data-project-path.
                Follows managePanel.js / worktreePanel.js structure + escapeHtml + i18n `t()`.

    - name: settingsModal (MODIFY — add maxDiffLines input)
      file: src/dashboard/modules/settingsModal.js
      test: src/tests/units/dashboard/modules/settingsModal.test.ts
      change: add 'maxDiffLines' to EDITABLE_KEYS; add to viewmodel (String or ''); render a
              type=number min=1 step=1 input next to maxConcurrentReviews (176-185); add
              validateMaxDiffLines(value) (empty ok = clear; else positive integer) mirroring
              validateQualityThreshold; wire it into the submit handler in index.html.

    - name: index.html (MODIFY — mount panel + fetch/render loop + wire modal validator)
      file: src/dashboard/index.html
      change:
        - add `<section id="size-block-section" ...>` above the project-list/overview
          (`overview-section`, line 183 area — place before it, after the focus-strip).
        - import buildSizeBlockPanelModel/renderSizeBlockPanelHtml from ./modules/sizeBlockPanel.js
          (near the managePanel/worktreePanel imports ~392/422).
        - add refreshSizeBlockSection(): fetch GET /api/size-blocks → render → bind
          data-action="force-launch" buttons → POST /api/mr-tracking/force-start → on success
          re-fetch (block disappears). Mirror refreshWorktreeSection (3626-3645) incl. poll interval.
        - hook validateMaxDiffLines into the settings submit handler where
          validateQualityThreshold/validateMaxConcurrentReviews are already called.
      test: (index.html glue is exercised by the humble-object + presenter unit tests + acceptance)

  WIRING:
    routes: src/main/routes.ts
      - register new sizeBlocksRoutes with:
          getRepositories: () => deps.config.repositories,
          reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
          sizeBlockListPresenter: new SizeBlockListPresenter(),
          forceLaunchBlockedReview: new ForceLaunchBlockedReviewUseCase({
            reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
            enqueue: enqueueReview, logger: deps.logger }),
          resolveReviewProcessor: (job) => processorRegistry.resolve({
            triggerSource: 'dashboard-manual', platform: job.platform, jobType: 'review' })(job)
            — NOTE: processorRegistry already registers dashboard-manual/review for both platforms
            (routes.ts:509-524); reuse it. Register sizeBlocksRoutes AFTER processorRegistry is built.
          logger: deps.logger
      - add `recordSizeBlock: new RecordSizeBlockUseCase(deps.reviewRequestTrackingGateway)` to the
        GitLab and GitHub webhook controller dependency objects.
    dependencies: no new gateway instances (reuse deps.reviewRequestTrackingGateway + enqueueReview
      + processorRegistry). New: SizeBlockListPresenter, RecordSizeBlockUseCase,
      ForceLaunchBlockedReviewUseCase.

  IMPLEMENTATION_ORDER:
    1. src/modules/tracking/entities/tracking/trackedMr.ts — add SizeBlockRecord + sizeBlock field;
       update trackAssignment.usecase.ts createNew to set sizeBlock: null; update
       trackedMr.factory.ts. WALKING SKELETON foundation (domain field first, inside-out).
    2. src/modules/tracking/usecases/tracking/recordSizeBlock.usecase.ts (+ test) — first vertical
       write path. Uses in-memory tracking stub.
    3. diffSizeGuard.helper.ts widen return (+ test) — surface countedLines/budget/message.
    4. gitlab.controller.ts + github.controller.ts — call recordSizeBlock at review-mode block;
       add recordSizeBlock to webhook deps (+ controller tests). COMPLETES the walking skeleton:
       Entity → UseCase → Controller → acceptance "block persisted" scenario goes GREEN.
    5. SizeBlockListPresenter (+ test) — shape the aggregation viewmodel.
    6. sizeBlocks.routes.ts GET /api/size-blocks (+ test) — cross-project aggregation.
    7. forceLaunchBlockedReview.usecase.ts (+ test) — dedup + clear-block rules.
    8. sizeBlocks.routes.ts POST /api/mr-tracking/force-start (+ test) — wire job build + processor.
    9. updateProjectConfig.usecase.ts + projectConfig.routes.ts (+ tests) — maxDiffLines write path.
    10. src/dashboard/modules/sizeBlockPanel.js (+ test) — panel humble object.
    11. settingsModal.js maxDiffLines input + validator (+ test).
    12. index.html — mount panel, fetch/render/poll loop, force-launch binding, modal validator hook.
    13. src/main/routes.ts — register sizeBlocksRoutes + inject recordSizeBlock into webhook deps.
        (Composition root LAST.)

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/219-oversized-mr-force-launch-panel.acceptance.test.ts
    note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
           Covers: block persisted on review-mode block; GET /api/size-blocks aggregates across
           projects; POST /api/mr-tracking/force-start enqueues + clears sizeBlock; force-launch
           dedup leaves sizeBlock untouched; maxDiffLines round-trips through PATCH /api/project-config.
           Model after src/tests/acceptance/209-mr-size-guard.acceptance.test.ts (same guard wiring)."

  REFERENCE_FILES:
    - docs/specs/219-oversized-mr-force-launch-panel.md — the spec (Rules/Scenarios/Out of Scope)
    - docs/plans/209-mr-size-guard.plan.md + docs/reports/209-mr-size-guard.report.md — guard layout
    - src/modules/tracking/entities/tracking/trackedMr.ts — BypassRecord precedent for SizeBlockRecord
    - src/modules/tracking/usecases/tracking/recordBypass.usecase.ts — RecordSizeBlockUseCase template
    - src/modules/tracking/usecases/tracking/trackAssignment.usecase.ts — createNew must init sizeBlock
    - src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts — gateway contract
    - src/tests/stubs/reviewRequestTracking.stub.ts — in-memory gateway for use case tests
    - src/tests/factories/trackedMr.factory.ts — factory to extend
    - src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts — widen return
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts:691,731 — block site + trackAssignment order
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts:651,693 — mirror site
    - src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts:95-411 — force-launch/job-build/enqueue precedent
    - src/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.ts:63-95 — cross-project aggregation loop
    - src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts — presenter pattern
    - src/modules/review-execution/entities/job/reviewJob.ts:5-35 — ReviewJob shape
    - src/config/projectConfig.ts:71-79,262-265 — maxDiffLines read/parse (already present)
    - src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts — write path to extend
    - src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts — PATCH to extend
    - src/dashboard/modules/settingsModal.js:15-23,79-84,176-235 — modal keys/viewmodel/validators
    - src/dashboard/modules/worktreePanel.js + managePanel.js — panel humble-object convention
    - src/dashboard/index.html:183,392,422,3626-3645 — mount point + panel fetch/render/poll loop
    - src/main/routes.ts:232,365,425,501-524 — registration + processorRegistry (dashboard-manual/review)
    - src/shared/foundation/usecase.base.ts — UseCase<Input,Output> interface
```

## Notes for the implementer

- `UseCase<I,O>` is synchronous by signature; `ForceLaunchBlockedReviewUseCase` returns a Promise as
  its `O` (allowed — `ConfirmPendingReviewUseCase` sets the async precedent). If preferred, skip the
  base interface for that one use case rather than fight the signature.
- Do NOT touch approve-mode / followup-mode block behavior (Out of Scope). Only `mode: 'review'`
  persists a `sizeBlock`.
- Force-launch posts NO comment to the author (Out of Scope) — just enqueue + clear.
- French end-user strings only in UI/error messages (panel copy, force-start rejection message);
  code/tests/logs stay English.
- No barrel `index.ts`. All imports via `@/` alias + `.js`.
```
