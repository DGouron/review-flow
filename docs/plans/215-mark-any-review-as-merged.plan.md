# Plan — SPEC-215 Mark any review as merged

> Generalization of the already-shipped SPEC-182. Reuse existing artefacts; do not reinvent.
> Spec: `docs/specs/215-mark-any-review-as-merged.md`

```
PLAN:
  scope: mark-any-review-as-merged
  is_new_module: false
```

## Anti-overengineering verdict

SPEC-182 already shipped the route, the confirmation modal, the i18n keys, the toast,
and the dashboard JS path. SPEC-215 is a **generalization**, not a new feature. The
only genuinely new business behavior is the **closure orchestration** (cancel job +
release context + remove worktree, but RETAIN the record as `merged`). That single
piece of orchestration warrants one new use case — it coordinates 4 collaborators and
has the inverted-from-`handleClose` invariant (no archive). Everything else is MODIFY
of existing files. No new entity, no new gateway contract, no presenter class, no value
object. The merged-record surfacing is a 2-line endpoint extension + a render block, not
a redesign. File count target ~8-11 — honest.

We deliberately do **not** reuse `handleClose` directly: it always calls
`trackingGateway.archive()` (=== delete), which would erase the record. SPEC-215 rule
(line 12) mandates retention. A thin dedicated use case is clearer than parameterizing
`handleClose` with a "don't archive" flag (flag-on-boolean smell).

---

## ENTITIES

None created, none modified. `TrackedMr` already carries `state: 'merged'` and
`mergedAt` (`src/modules/tracking/entities/tracking/trackedMr.ts:16,24`). The
`'merged'` state already exists in the state union — no schema change.

---

## USECASES

```
- name: markReviewAsMerged
  file: src/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.ts          [CREATE]
  test: src/tests/units/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.test.ts  [CREATE]
  layer: Application (Use Case)
  type: command
  input:  { projectPath: string; mrId: string }
  output: MarkReviewAsMergedResult =
            | { ok: true; jobCancelled: boolean; contextReleased: boolean; recordRetained: true }
            | { ok: false; reason: 'not-found' }
  dependencies (injected, all EXISTING collaborators — no new contracts):
    - trackingGateway: Pick<ReviewRequestTrackingGateway, 'getById' | 'update'>
    - reviewContextGateway: Pick<ReviewContextGateway, 'delete'>
    - cancelJob: (jobId: string) => boolean                              // frameworks/queue/pQueueAdapter.cancelJob
    - buildJobId: (platform, projectPath, mrNumber) => string            // frameworks/queue/pQueueAdapter.createJobId
    - removeWorktree: RemoveWorktreeAction                               // same removeWorktreeAction wired for handleClose
    - logger: Logger
```

### Use case algorithm (orchestration)

1. `mr = trackingGateway.getById(projectPath, mrId)`. If `null` → `{ ok: false, reason: 'not-found' }`.
   (This single load gives us `platform`, `mrNumber`, and current `state` — no string parsing of `mrId`.)
2. **Idempotency**: if `mr.state === 'merged'` → still run closure best-effort is unnecessary; just
   re-affirm `update({ state: 'merged' })` is a no-op-safe write. Simplest: skip closure, return
   `{ ok: true, jobCancelled: false, contextReleased: false, recordRetained: true }`. (Scenario
   "already merged is idempotent" only asserts status "merged" — no side effects required.)
3. Closure (any non-merged state):
   - `jobCancelled = cancelJob(buildJobId(mr.platform, projectPath, mr.mrNumber))`
   - `contextReleased = reviewContextGateway.delete(projectPath, mrId).deleted`
     — NOTE: context + worktree are keyed by `localPath` + the stored `TrackedMr.id`. The manual
       route's `projectPath` IS the local checkout path (validated to start with `/`), and `mrId`
       IS the stored `TrackedMr.id`. So pass `projectPath` as localPath and `mr.id` as the
       mergeRequestId. This mirrors the webhook where `event.localPath === projectPath`.
   - `removeWorktree({ identity: { platform: mr.platform, projectPath, mrNumber: mr.mrNumber }, sourceCheckoutPath: projectPath })`
     wrapped in try/catch + `status === 'failed'` warn — **best-effort**, never blocks (rule line 21).
4. Transition WITHOUT archive: `trackingGateway.update(projectPath, mrId, { state: 'merged', mergedAt: new Date().toISOString() })`.
   The record stays in the store; `getActiveMrs` already excludes `merged`
   (`reviewRequestTracking.fileSystem.ts:121`) so it leaves the active lanes automatically.
5. Return `{ ok: true, jobCancelled, contextReleased, recordRetained: true }`.

> Decision: do NOT route through `TransitionStateUseCase`. It would work for the state write,
> but the closure side-effects (cancel/delete/worktree) live above it and the new use case
> already owns `update`. Keeping the whole command in one use case avoids a two-call dance and
> keeps the closure + transition atomic from the caller's view. `TransitionStateUseCase` stays
> untouched and continues to serve the webhook `merge`/`approve`/`close` paths.

---

## GATEWAYS

No new gateway contracts, no new implementations, no new stubs.

Reused contracts (all already implemented + stubbed):
```
- ReviewRequestTrackingGateway  (getById, update, getByState) — entities/tracking/reviewRequestTracking.gateway.ts
- ReviewContextGateway          (delete)                       — entities/reviewContext/reviewContext.gateway.ts
- RemoveWorktreeAction          (type)                         — entities/worktree/worktree.schema.ts
- cancelJob / createJobId       (frameworks/queue/pQueueAdapter.ts)
```

Reused test doubles:
```
- InMemoryReviewRequestTrackingGateway  src/tests/stubs/reviewRequestTracking.stub.ts
- StubReviewContextGateway              src/tests/stubs/reviewContextGateway.stub.ts
- createCapturingLogger                 src/tests/stubs/capturingLogger.stub.ts
- cancelJob/buildJobId/removeWorktree   vi.fn() spies (pattern from handleClose.usecase.test.ts)
```

---

## CONTROLLERS

```
- name: mrTrackingRoutes (existing Fastify plugin)
  file: src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts   [MODIFY]
  test: src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.markAsMerged.routes.test.ts  [CREATE]
  layer: Interface Adapter (HTTP controller)
```

### Route change — `POST /api/mr-tracking/mark-as-merged` (lines 110-158)

- DROP `requireCurrentState: 'pending-fix'`; DROP the `TransitionStateUseCase` call and its
  `invalid-current-state` (409) branch — it no longer applies (any state is allowed).
- Keep the existing input validation verbatim: empty `mrId` → 400 `"mrId requis"`; missing path
  → 400 `"Chemin du projet requis"`; `..`/non-`/` path → 400 `"Chemin invalide"`
  (reuse `validateProjectPath`, lines 16-29).
- Instantiate and call `MarkReviewAsMergedUseCase` with `{ projectPath, mrId }`.
- Map result branches:
  - `{ ok: false, reason: 'not-found' }` → 404 `{ success: false, error: 'MR non trouvée' }`
  - `{ ok: true, ... }` → 200 `{ success: true, mrId, message: 'MR marquée comme mergée' }`
- The use case needs the closure collaborators (cancelJob/buildJobId/reviewContextGateway/
  removeWorktree/logger) that the plugin does NOT currently receive. **Extend
  `MrTrackingRoutesOptions`** (lines 10-14) with these, supplied at the composition root (see WIRING).
  Use a factory `createMarkReviewAsMerged?: (deps) => MarkReviewAsMergedUseCase`-style OR pass the
  raw collaborators — prefer passing the collaborators on `opts` to match the existing plugin
  style (it already receives `reviewRequestTrackingGateway` and builds use cases inline, e.g.
  `new TransitionStateUseCase(...)` at line 81).

### GET `/api/mr-tracking` change (lines 38-63) — merged-record surfacing

- Add a third list: `const merged = reviewRequestTrackingGateway.getByState(validation.path, 'merged');`
- Return it through the existing presenter: `merged: mrDiffStatsPresenter.present(merged, stats)`.
- Response shape becomes `{ success, pendingFix, pendingApproval, merged }`. Backward compatible
  (additive field). This is the SMALLEST viable surfacing: `getByState` already exists, the
  presenter already handles a `TrackedMr[]`, no new query path.

> Covered by the same route test file (assert `merged` list is returned after a mark-as-merged).

---

## PRESENTERS

None created. The existing `MrDiffStatsPresenter`
(`src/modules/tracking/interface-adapters/presenters/mrDiffStats.presenter.ts`) already maps a
`TrackedMr[]` → view rows and is reused for the `merged` list. No view-model class needed.

---

## VIEWS (Dashboard — `src/dashboard/index.html` + `src/dashboard/modules/i18n.js`)

```
- file: src/dashboard/index.html        [MODIFY]
- file: src/dashboard/modules/i18n.js   [MODIFY]
  layer: Interface Adapter (Humble Object views)
```

Dashboard is a humble-object view; logic stays minimal. Browser JS is not unit-tested here
(no view-model module extracted — keeping it tight). The behavior is exercised end-to-end by the
acceptance test at the HTTP boundary; the DOM render is a thin string template.

### 1. Show `markMergedBtn` on every actionable card

- `renderMrItem(mr, type)` (line 1554): the `markMergedBtn` is currently gated to
  `type === 'pending-fix'` (line 1567). Change so it is built for BOTH `pending-fix` AND
  `pending-approval`, and include it in the `pending-approval` actions branch (currently the
  `showFollowupActions` path only adds it via the shared `actions` string when followup actions
  show). Ensure the button appears whenever the card is actionable (needs-fix + ready-to-approve).
- `renderNowLane(mr)` (line 1704): the now-lane actions (line 1730-1733) currently have only
  Followup + Open. Add a mark-as-merged button calling `showMarkMergedModal(encodedMrId, mr.mrNumber)`,
  reusing the existing `git-merge` icon + `t('button.markAsMerged')`.

### 2. Surface merged records with a "Merged" badge in the completed area

- `fetchMrTracking` (line 1963-1969): read `data.merged` into a new `currentData.merged = data.merged || []`.
- Add a render block in the completed area (`completed-reviews-section`, line 265) — a small
  list of merged review rows, each carrying a `<span class="badge merged">…Merged</span>`
  (mirror the existing `badge completed` pattern at line 991). Render via a new tiny
  `renderMergedReviews(currentData.merged)` helper appended into the completed section, guarded
  to render nothing when empty. This is additive; it does NOT touch the report-file list
  (out of scope, spec line 45).
- After `confirmMarkAsMerged` success (line 3018-3022): keep `card.remove()` (leaves active lane)
  and `fetchStatus()`; the next `fetchMrTracking` will pull the record into the merged list and
  render the badge — satisfies "without any reload required" (rule line 14) since `fetchStatus`
  already triggers the refresh cycle. Confirm `confirmMarkAsMerged` triggers an `fetchMrTracking`
  (it calls `fetchStatus()`; verify that path re-runs `fetchMrTracking` — if not, add an explicit
  `fetchMrTracking()` call).

### 3. Confirmation step

Already present: `#mark-merged-modal` (index.html:302), `showMarkMergedModal` (~2984),
`confirmMarkAsMerged` (~3000). No change to the confirmation UX — it already satisfies rule
line 16. The modal copy `modal.markMerged.message` mentions "Corrections requises" (pending-fix
specific) — see i18n note below.

---

## i18n (EN + FR, both required)

```
file: src/dashboard/modules/i18n.js   [MODIFY]
```

- `modal.markMerged.message` (EN line 283-284 / FR line 755-756) currently says the card leaves
  "Corrections requises" / `"Corrections requises"`. Generalize the copy so it is state-agnostic
  (e.g. EN: "This manually marks the review as merged and closes its review process." / FR:
  "Marque manuellement la review comme mergée et clôt son processus de review."). Keep keys.
- NEW keys for the merged badge / completed block:
  - `badge.merged` → EN "Merged" / FR "Mergée"
  - (optional) `section.mergedReviews` heading if a sub-label is rendered → EN "Merged" / FR "Mergées"
- All other keys (`button.markAsMerged`, `modal.markMerged.{title,back,confirm}`,
  `success.markedAsMerged`, `error.markAsMerged`) already exist EN+FR — reuse as-is.

---

## WIRING

```
file: src/main/routes.ts   [MODIFY]
layer: Composition root (DI)
```

Extend the `mrTrackingRoutes` registration (lines 251-256) to supply the closure collaborators
the new use case needs. These ALREADY exist at the composition root and are wired identically for
the webhook close path — reuse the same instances:

- `cancelJob` — imported (line 21).
- `createJobId` — imported (line 27) → pass as `buildJobId`.
- `reviewContextGateway` — `deps.reviewContextGateway` (used by `handleClose` wiring, line 576/658).
- `removeWorktreeAction` — defined at lines 542-549; reuse the SAME closure.
- `logger` — `deps.logger`.

> Note: `removeWorktreeAction` is currently declared at line 542, AFTER the `mrTrackingRoutes`
> registration at line 251. The implementer must either (a) hoist `removeWorktreeAction` above the
> `mrTrackingRoutes` registration, or (b) move the `mrTrackingRoutes` registration below line 549.
> Option (a) is cleaner — `removeWorktreeAction` only closes over `deps.worktreeGateway`. Flag for
> the implementer; trivial reorder, no behavior change.

---

## IMPLEMENTATION_ORDER (inside-out, TDD inner loop; acceptance is outer loop written FIRST)

1. `src/tests/acceptance/215-mark-any-review-as-merged.acceptance.test.ts` — **outer loop, written first, RED.**
   Covers all 12 DSL scenarios at the HTTP boundary (Fastify + InMemory gateways + stub context +
   spy cancelJob/removeWorktree). Stays RED until the slice is GREEN.
2. `markReviewAsMerged.usecase.ts` (+ unit test) — **walking-skeleton vertical slice core.** Domain-
   adjacent application logic first: load → closure → update-without-archive → result. Mirror
   `handleClose.usecase.test.ts` harness (vi.fn spies + InMemory + Stub). Asserts: every-state →
   merged + mergedAt; idempotent merged; jobCancelled/contextReleased flags; recordRetained
   (record still in `getById`, NOT archived); worktree failure is best-effort (still ok:true);
   not-found → reason 'not-found'.
3. `mrTracking.routes.ts` route change (+ unit test) — drop requireCurrentState, wire the use case,
   map not-found→404 / ok→200, keep input validation + French messages. Extend GET to return `merged`.
4. `routes.ts` wiring — inject the closure collaborators into `mrTrackingRoutes`; hoist
   `removeWorktreeAction`. (No new test — exercised by acceptance.)
5. `i18n.js` — generalize modal message, add `badge.merged` EN+FR.
6. `index.html` — `markMergedBtn` on pending-approval card + now-lane; `renderMergedReviews` block;
   read `currentData.merged`; ensure post-confirm refresh pulls the merged list.
7. Run acceptance → GREEN. `yarn verify`.

> Walking skeleton (step 1+2) = the first vertical slice crossing Use Case → Controller →
> acceptance for the new closure behavior. Steps 3-6 widen it to the full spec surface.

---

## REFERENCE_FILES

```
- docs/specs/215-mark-any-review-as-merged.md                                          — the spec (12 scenarios, 13 rules)
- docs/specs/182-mark-pending-fix-as-merged.md                                         — the predecessor being generalized
- src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts        — route to MODIFY (lines 110-158 + GET 38-63)
- src/modules/tracking/usecases/tracking/transitionState.usecase.ts                    — current merged transition (NOT reused, but the pattern)
- src/modules/review-execution/usecases/handleClose.usecase.ts                         — closure reference (cancel/delete/worktree); we copy the shape, drop archive
- src/tests/units/modules/review-execution/usecases/handleClose.usecase.test.ts        — test harness pattern to mirror (spies + stubs)
- src/main/routes.ts                                                                    — composition root; reuse removeWorktreeAction (542-549), cancelJob (21), createJobId (27)
- src/modules/tracking/entities/tracking/trackedMr.ts                                   — TrackedMr fields (state, mergedAt, platform, mrNumber, id)
- src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts              — getById/update/getByState contract
- src/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.ts — archive===remove===delete (137-139); getActiveMrs excludes merged (121)
- src/modules/review-execution/entities/reviewContext/reviewContext.gateway.ts         — delete() contract
- src/modules/worktree-management/entities/worktree/worktree.schema.ts                 — RemoveWorktreeAction + WorktreeIdentity
- src/tests/stubs/reviewRequestTracking.stub.ts                                         — InMemory gateway (archive deletes — assert we DON'T call it)
- src/tests/stubs/reviewContextGateway.stub.ts                                          — context delete stub
- src/tests/stubs/capturingLogger.stub.ts                                               — capturing logger for warn assertions
- src/tests/factories/trackedMr.factory.ts                                              — TrackedMrFactory.create (seed states)
- src/tests/acceptance/182-mark-pending-fix-as-merged.acceptance.test.ts                — acceptance skeleton to adapt
- src/dashboard/index.html                                                              — renderMrItem (1554), renderNowLane (1704), renderQueueLanes (1739), modal (302), confirmMarkAsMerged (3000), fetchMrTracking (1963), completed section (265)
- src/dashboard/modules/i18n.js                                                         — markMerged keys (258-309 EN / 730-781 FR)
```

---

## ACCEPTANCE_TEST

```
file: src/tests/acceptance/215-mark-any-review-as-merged.acceptance.test.ts
note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
```

Adapt `182-mark-pending-fix-as-merged.acceptance.test.ts`. `buildApp` must now also pass the
closure collaborators (cancelJob/buildJobId/reviewContextGateway/removeWorktree/logger) into the
plugin registration. 12 scenarios:

1. from pending-review → 200, state merged, mergedAt set
2. from pending-fix → 200, state merged, mergedAt set
3. from pending-approval → 200, state merged, mergedAt set
4. from approved → 200, state merged, mergedAt set
5. from closed → 200, state merged, mergedAt set
6. already merged is idempotent → 200, state merged (record still present)
7. closure cancels a running job → cancelJob spy called with buildJobId(platform, projectPath, mrNumber); response/body reflect jobCancelled true + contextReleased true (seed context in stub)
8. record retained with merged tag → after success, `getById` still returns the MR with state 'merged' (NOT archived); GET /api/mr-tracking `merged` list contains it
9. unknown review → 404 "MR non trouvée"
10. missing review id → 400 "mrId requis"
11. missing project path → 400 "Chemin du projet requis"
12. invalid project path ("../etc") → 400 "Chemin invalide"

---

## OPEN QUESTIONS / WIRING UNCERTAINTIES (flagged, not hand-waved)

1. **localPath vs projectPath at the manual route.** The webhook close/merge path uses
   `event.localPath` for context/worktree keys and treats it as equal to the tracking projectPath.
   The dashboard sends only `projectPath` (the local checkout path, validated to start with `/`).
   PLAN ASSUMPTION: `projectPath` === localPath for the manual route (same as webhook). This holds
   because the dashboard's `currentProjectPath` is the repository's `localPath`. **Risk:** if a
   project's tracking is ever keyed by a slug different from its checkout path, worktree removal
   would target the wrong identity. This is best-effort (rule 21) so a miss degrades gracefully —
   acceptable. Implementer should confirm `currentProjectPath` is the `localPath` (it is the value
   passed to GET `/api/mr-tracking?path=` which `getByState`/`getById` key on, so consistent).

2. **`removeWorktree` identity uses `projectPath` not the slug.** `handleClose` passes
   `event.projectPath` (slug) into the worktree identity but `event.localPath` as
   `sourceCheckoutPath`. For the manual route we only have one value (`projectPath` = checkout path).
   We pass it as BOTH `identity.projectPath` and `sourceCheckoutPath`. This matches the webhook
   merge path (`processWebhook.routeMerge` uses `event.projectPath` for identity and `event.localPath`
   for sourceCheckoutPath, which are the same in practice). Low risk; best-effort. Flag for review.

3. **Post-confirm live refresh.** `confirmMarkAsMerged` calls `fetchStatus()` (index.html:3022).
   Must verify `fetchStatus` re-runs `fetchMrTracking` so the merged list/badge appears without a
   manual reload (rule 14). If `fetchStatus` does NOT chain into `fetchMrTracking`, add an explicit
   `fetchMrTracking()` after `card.remove()`. Implementer to verify the call graph.

4. **`reviewContextGateway` instance reuse.** The composition root already constructs
   `new ReviewContextFileSystemGateway()` in a couple of places (e.g. line 354 for
   `mrTrackingAdvancedRoutes`) and `deps.reviewContextGateway` exists. Reuse `deps.reviewContextGateway`
   (the same one handleClose uses) — do NOT spin a fresh instance.
```
