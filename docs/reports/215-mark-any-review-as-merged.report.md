# Report — SPEC-215 Mark any review as merged

> Generalization of SPEC-182. Spec: `docs/specs/215-mark-any-review-as-merged.md` — Plan: `docs/plans/215-mark-any-review-as-merged.plan.md`.

## Status: implemented — `yarn verify` GREEN (typecheck + lint + format + 4121 tests)

## Files

### Created
- `src/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.ts` — closure orchestration + state write without archive.
- `src/tests/units/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.test.ts` — unit tests (every-state → merged, idempotent merged, jobCancelled/contextReleased flags, record retained, worktree best-effort, not-found).
- `src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.markAsMerged.routes.test.ts` — route unit tests.
- `src/tests/acceptance/215-mark-any-review-as-merged.acceptance.test.ts` — 12 DSL scenarios at the HTTP boundary (SDD outer loop).

### Modified
- `src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts` — dropped `requireCurrentState`, wired the new use case, `GET` returns the `merged` list.
- `src/main/routes.ts` — hoisted `removeWorktreeAction`, injected closure collaborators into `mrTrackingRoutes`.
- `src/dashboard/index.html` — button on pending-approval + now-lane; `renderMergedReviews` badge block reading `currentData.merged`.
- `src/dashboard/styles.css` — `.badge.merged`, `.merged-review-row`.
- `src/dashboard/modules/i18n.js` — generalized `modal.markMerged.message`; added `badge.merged` (EN/FR).
- `docs/feature-tracker.md` — 215 implemented; 182 superseded by 215.

### Deleted
- `src/tests/acceptance/182-mark-pending-fix-as-merged.acceptance.test.ts` — its assertions (pending-approval/approved/merged → 409 rejected) contradict SPEC-215's generalization. SPEC-215's acceptance test covers the generalized behavior. SPEC-182 marked superseded.

## Tests

- Acceptance: 12/12 scenarios GREEN.
- Suite: **4121 passed (489 files)**, typecheck clean, format clean, lint clean (only pre-existing size warnings = tracked debt).

## Spec coverage

| Rule / Scenario | Covered by |
|---|---|
| Merge from any state (incl. closed) | acceptance scenarios 1-5 + use case unit tests |
| Idempotent when already merged | acceptance scenario 6 |
| Closure cancels job + releases context | acceptance scenario 7 + use case unit tests |
| Record retained + Merged tag | acceptance scenario 8 (GET `merged` list) + dashboard badge |
| Unknown / missing id / missing-invalid path | acceptance scenarios 9-12 |
| Button on every actionable card | dashboard `renderMrItem` (pending-fix + pending-approval) + `renderNowLane` |
| Merged badge in completed area | dashboard `renderMergedReviews` + `.badge.merged` |

## Flagged uncertainties — resolved

1. **`projectPath` === `localPath` at the manual route** — confirmed: the route validates the path starts with `/` and `getById`/`getByState` key on it; the use case passes it as both the tracking key and the context/worktree `localPath`, consistent with the webhook close path. Worktree removal is best-effort, so any edge mismatch degrades gracefully.
2. **Worktree identity uses `projectPath` for both `identity.projectPath` and `sourceCheckoutPath`** — confirmed in the use case (`markReviewAsMerged.usecase.ts`), mirrors the webhook merge path. Best-effort.
3. **Post-confirm live refresh** — confirmed: `confirmMarkAsMerged` → `fetchStatus()` → `fetchMrTracking()` (index.html), which re-pulls the `merged` list and re-renders the badge without a manual reload.
4. **Reuse `deps.reviewContextGateway`** — confirmed in `src/main/routes.ts`: the registration passes `deps.reviewContextGateway` (the same instance the webhook close path uses), not a fresh gateway.

## Notes

- Post-implementation gap closed by the orchestrator: the feature-implementer left `src/dashboard/index.html` and `src/dashboard/styles.css` untouched (button surfacing + Merged badge). These were completed to satisfy the spec's UI rules.
- No new entity, schema, guard, gateway contract/impl, stub, factory, or presenter. Pure generalization.
