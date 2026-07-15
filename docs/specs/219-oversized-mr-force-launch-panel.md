# Surface oversized-MR blocks on the dashboard with a force-launch option

## Status: implemented

## Context

Spec [209-mr-size-guard](209-mr-size-guard.md) added a per-project `maxDiffLines` budget that
blocks a review request when a merge request is oversized (posts a French split comment, no
review job enqueued). That spec explicitly left "dashboard surfacing of blocked-for-size state"
out of scope. This feature closes that gap: it exposes `maxDiffLines` in the dashboard settings
UI, persists the block on the tracked MR so it survives across projects, surfaces every blocked
MR in a panel at the top of the dashboard (above the project list), and lets an operator force
the review to run anyway despite the size.

Scope is intentionally limited to the **initial review-request block** (`applyDiffSizeGuard`
`mode: 'review'`). Follow-up blocks (anti-spam, silent) and approval-revocation blocks are
untouched — persisting/forcing those is a separate follow-up if ever needed.

## Rules

- `maxDiffLines` is editable from the project settings modal, as a positive integer, alongside
  the existing `qualityThreshold` / `maxConcurrentReviews` fields
- when `applyDiffSizeGuard` blocks a review request (`mode: 'review'`), the block is persisted on
  the corresponding `TrackedMr` as a `sizeBlock` record (`countedLines`, `budget`, `message`,
  `blockedAt`) — the tracked MR must already exist at this point (assignment tracking runs before
  the guard in both platform controllers)
- a dashboard endpoint returns every currently-blocked MR (non-null `sizeBlock`) across all
  enabled projects, with enough data to render project name, MR title/url, counted lines, budget
- the dashboard renders a panel above the project list, visible only when at least one MR is
  blocked, listing each blocked MR with a "Force launch" action
- forcing a blocked MR enqueues a real review job (`jobType: 'review'`) for that MR, bypassing the
  diff-size guard only, then clears the `sizeBlock` record
- a non-oversized MR is unaffected (no `sizeBlock`, nothing shown, no behavior change from spec 209)
- if a project already has a fresh review in progress or recently completed for that MR, the
  force-launch request is rejected the same way a duplicate enqueue is rejected today (existing
  dedup logic in `enqueueReview`) — no double-run

## Scenarios

- config UI: {maxDiffLines input in settings modal, value 1500} → saved, `GET /api/project-config`
  reflects `maxDiffLines: 1500`
- config UI invalid: {maxDiffLines input, value "-5"} → rejected client + server side, same
  pattern as `qualityThreshold` validation
- block persisted: {oversized MR review request, counted 2500, budget 2000} → `TrackedMr.sizeBlock`
  set with `countedLines: 2500`, `budget: 2000`, `blockedAt` timestamp, `message`
- panel populated: {2 blocked MRs across 2 different projects} → `GET /api/size-blocks` returns
  both, dashboard panel renders both with project name, MR title, counted/budget
- panel empty: {no MR has a non-null `sizeBlock`} → panel not rendered / hidden
- force launch: {blocked MR, operator clicks "Force launch"} → review job enqueued for that MR,
  `sizeBlock` cleared, panel no longer lists it after refresh
- force launch dedup: {blocked MR, a review job for that MR is already running} → force-launch
  request rejected, `sizeBlock` left untouched, existing job unaffected
- unrelated MR: {non-oversized MR reviewed normally} → no `sizeBlock` written, no panel entry,
  behavior identical to before this feature

## Out of Scope

- Persisting/forcing follow-up blocks or approval-revocation blocks (only initial `mode: 'review'`
  blocks are tracked and forceable)
- Auto-splitting the MR or any author-facing self-service action
- Per-file or per-language budgets
- Changing the excluded-file list (`package.json`, lockfiles) from spec 209
- Notifying the author when a block is force-launched (no new comment posted)
- Historical/audit log of past force-launches beyond what `TrackedMr` already stores

## Glossary

| Term | Definition |
|------|------------|
| size block | The persisted record on a `TrackedMr` describing why/when its review was blocked for size |
| force launch | Operator action from the dashboard that enqueues the review despite the size block |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Builds on spec 209's guard/config, adds persistence + one endpoint + one usecase + UI |
| Negotiable | OK | Panel copy/layout left to implementation |
| Valuable | OK | Turns a silent block into an actionable operator workflow |
| Estimable | OK | 1 entity field, 1 usecase (record), 1 usecase (force), 1 endpoint, 1 UI field, 1 panel |
| Small | OK | Scoped to review-mode blocks only; ~12-15 files |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity (modified)**: `src/modules/tracking/entities/tracking/trackedMr.ts` — `SizeBlockRecord` interface (`countedLines`, `budget`, `message`, `blockedAt`) + `TrackedMr.sizeBlock: SizeBlockRecord | null`, sibling of the existing `bypass` field.
- **Use cases (new)**: `RecordSizeBlockUseCase` (`src/modules/tracking/usecases/tracking/recordSizeBlock.usecase.ts`) persists the block; `ForceLaunchBlockedReviewUseCase` (`.../forceLaunchBlockedReview.usecase.ts`) enqueues then clears the block, leaving it untouched on dedup.
- **Guard (modified)**: `diffSizeGuard.helper.ts` widened return to `{ blocked: true; countedLines; budget; message }` so the block details can be persisted.
- **Controllers (modified)**: `gitlab.controller.ts` + `github.controller.ts` call `recordSizeBlock` at the `mode: 'review'` block site only.
- **Presenter + routes (new)**: `SizeBlockListPresenter` + `sizeBlocks.routes.ts` — `GET /api/size-blocks` (cross-project aggregation) and `POST /api/mr-tracking/force-start`.
- **Config write path (modified)**: `updateProjectConfig.usecase.ts` + `projectConfig.routes.ts` — `maxDiffLines` was read-only before this feature; now accepted through the PATCH endpoint.
- **Dashboard**: `src/dashboard/modules/sizeBlockPanel.js` (new humble object) mounted in `index.html` above the overview, visible only when ≥1 block; `settingsModal.js` gained the `maxDiffLines` input + validator; `i18n.js` gained the FR/EN copy.
- **Wiring**: `src/main/routes.ts` registers `sizeBlocksRoutes` (reusing `enqueueReview` + the existing `dashboard-manual`/`review` processor registry entry) and injects `recordSizeBlock` into both webhook dependency objects.

### Decisions

- Only the initial review-request block (`mode: 'review'`) is persisted/forceable — follow-up (anti-spam, silent) and approval-revocation blocks are untouched, per Out of Scope.
- Force-launch posts no comment to the author — enqueue + clear only.
- `ForceLaunchBlockedReviewUseCase` returns a `Promise` as its use case output (precedent: `ConfirmPendingReviewUseCase`).
- No new Zod schema/guard for `SizeBlockRecord` — `TrackedMr` has no schema today and the sibling `BypassRecord` follows the same bare-interface pattern.

Full report: [docs/reports/219-oversized-mr-force-launch-panel.report.md](../reports/219-oversized-mr-force-launch-panel.report.md).
