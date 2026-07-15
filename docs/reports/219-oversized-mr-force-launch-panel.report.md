# Implementation Report — spec 219: Surface oversized-MR blocks on the dashboard with a force-launch option

Spec: `docs/specs/219-oversized-mr-force-launch-panel.md`
Plan: `docs/plans/219-oversized-mr-force-launch-panel.plan.md`

## Status

- `yarn verify` (typecheck + lint + test:ci): **PASS clean** (exit 0)
- Test files: **498 passed** — Tests: **4182 passed**
- Acceptance test: **RED → GREEN** (`src/tests/acceptance/219-oversized-mr-force-launch-panel.acceptance.test.ts`, 7 tests)

## Approach

TDD inside-out following the plan's 13-step IMPLEMENTATION_ORDER. The acceptance test was written first
and stayed RED throughout, going GREEN once the composition root (step 13) was wired.

## Files created

| File | Purpose |
|------|---------|
| `src/modules/tracking/usecases/tracking/recordSizeBlock.usecase.ts` | Persists a `sizeBlock` record on the tracked MR (mirror of `RecordBypassUseCase`) |
| `src/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.ts` | Enqueues the review then clears the block; leaves the block untouched on dedup |
| `src/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.ts` | Shapes blocked MRs into a JSON view model (skips null `sizeBlock`) |
| `src/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.ts` | `GET /api/size-blocks` aggregation + `POST /api/mr-tracking/force-start` |
| `src/dashboard/modules/sizeBlockPanel.js` | Dashboard humble object: build/render panel + fetch/force-launch helpers |
| `src/tests/acceptance/219-oversized-mr-force-launch-panel.acceptance.test.ts` | Outer-loop acceptance test (7 scenarios) |
| `src/tests/units/modules/tracking/usecases/tracking/recordSizeBlock.usecase.test.ts` | 2 tests |
| `src/tests/units/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.test.ts` | 4 tests |
| `src/tests/units/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.test.ts` | 3 tests |
| `src/tests/units/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.test.ts` | 6 tests |
| `src/tests/units/dashboard/modules/sizeBlockPanel.test.ts` | 7 tests |

## Files modified

| File | Change |
|------|--------|
| `src/modules/tracking/entities/tracking/trackedMr.ts` | Added `SizeBlockRecord` interface + `sizeBlock: SizeBlockRecord \| null` field |
| `src/modules/tracking/usecases/tracking/trackAssignment.usecase.ts` | `createNew` initialises `sizeBlock: null` |
| `src/tests/factories/trackedMr.factory.ts` | Factory default `sizeBlock: null` |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts` | Widened return to `{ blocked: true; countedLines; budget; message }` |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Persists `sizeBlock` at review-mode block; added `recordSizeBlock` dependency |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Mirror of GitLab |
| `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` | `maxDiffLines` write path (whitelist + validate + merge/omit) |
| `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` | `maxDiffLines` accepted in PATCH body + `extractPatch` |
| `src/dashboard/modules/settingsModal.js` | `maxDiffLines` input + `validateMaxDiffLines` + view model field |
| `src/dashboard/modules/i18n.js` | FR + EN copy for the `settings.maxDiffLines*` keys |
| `src/dashboard/index.html` | Mount `#size-block-section` panel, fetch/render/poll loop, force-launch binding, `validateMaxDiffLines` in the settings submit handler |
| `src/main/routes.ts` | Registered `sizeBlocksRoutes`; injected `recordSizeBlock` into both webhook deps |

### Test files updated for the new required field / dependency

- `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` (+1 test, `recordSizeBlock` dep)
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.test.ts` (+1 test, `recordSizeBlock` dep)
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/gitlabIdempotency.controller.test.ts` (`recordSizeBlock` dep)
- `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` (`recordSizeBlock` dep)
- `src/tests/acceptance/200-webhook-event-idempotency.acceptance.test.ts` (`recordSizeBlock` dep)
- `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.test.ts` (widened-verdict assertion)
- `src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts` (+3 tests)
- `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` (+2 tests)
- `src/tests/units/dashboard/modules/settingsModal.test.ts` (+6 tests, view model literals)
- `src/tests/units/dashboard/dashboardLayout.test.ts` (top-level child order includes `#size-block-section`)
- `src/tests/units/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.test.ts` (`sizeBlock: null` in helper literal)
- `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` (`sizeBlock: null` in helper literal)

## Self-review

Two review-fix iterations, both driven by `yarn verify`:

1. **Typecheck** — the new required `sizeBlock` field and `recordSizeBlock` dependency surfaced missing
   entries in pre-existing test fixtures and webhook-dep builders (idempotency test, spec-197, spec-200
   acceptance tests). Fixed by adding `sizeBlock: null` / `recordSizeBlock` where the full literal is
   constructed. Also typed the dashboard test fixture with the presenter's `SizeBlockViewModel` and used the
   `vi.fn().mockResolvedValue(...)` pattern for fetch mocks to satisfy the `typeof fetch` parameter.
2. **Format + one behavioural test** — ran `oxfmt` on the 4 new files; updated the `dashboardLayout` DOM
   order assertion to include the newly-mounted `#size-block-section`.

Violations found and fixed: import ordering on the two webhook controllers and the idempotency test
(entities import placed before usecases). No `as`/`any`/relative-import violations in the new production
files (verified by grep). Lint reports only pre-existing size/param warnings (tracked debt), none in the
new files.

## Scope adherence

- Only `mode: 'review'` blocks persist a `sizeBlock`; approve-mode and followup-mode block behaviour is
  untouched (the widened guard return simply carries extra fields those callers ignore).
- Force-launch enqueues + clears the block, posting no comment to the author.
- End-user strings (panel copy, force-start rejection, settings labels/hints) are French; code/tests/logs
  stay English.
- No barrel `index.ts`; all imports via `@/` alias + `.js`; no `as Type` assertions.

## Spec coverage

- OK `maxDiffLines` editable from settings modal → `settingsModal.js` input + `updateProjectConfig`/`projectConfig.routes` write path + acceptance round-trip
- OK block persisted on review-mode block → `RecordSizeBlockUseCase` + both controllers + acceptance "block persisted"
- OK dashboard endpoint returns every blocked MR → `GET /api/size-blocks` + `SizeBlockListPresenter` + acceptance "panel populated"
- OK panel visible only when ≥1 block → `renderSizeBlockPanelHtml` returns '' when empty + presenter `isEmpty`
- OK force launch enqueues + clears block → `ForceLaunchBlockedReviewUseCase` + `POST /api/mr-tracking/force-start` + acceptance "force launch"
- OK non-oversized MR unaffected → acceptance "unrelated MR"
- OK force-launch dedup leaves block untouched → acceptance "force launch dedup" + usecase test
