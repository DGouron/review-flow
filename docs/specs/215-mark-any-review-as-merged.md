# Mark any review as merged

## Status: implemented

See [report](../reports/215-mark-any-review-as-merged.report.md) and [plan](../plans/215-mark-any-review-as-merged.plan.md). Generalizes SPEC-182.

## Implementation

**Artefacts**:
- Use case (new): `src/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.ts` — orchestrates closure (cancel job + release context + best-effort worktree removal) then `update({ state: 'merged', mergedAt })` **without** archive, so the record is retained. Idempotent when already merged; returns `not-found` when the review is unknown.
- HTTP route (modified): `POST /api/mr-tracking/mark-as-merged` in `src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts` — dropped the `requireCurrentState: 'pending-fix'` restriction and the 409 `invalid-current-state` branch; wired to `MarkReviewAsMergedUseCase`. Status mapping: 200 ok / 400 invalid input / 404 not found. The `GET /api/mr-tracking` endpoint now also returns a `merged` list via `getByState`.
- Composition root (modified): `src/main/routes.ts` — hoisted `removeWorktreeAction` above the `mrTrackingRoutes` registration and injected the closure collaborators (`cancelJob`, `createJobId`, `deps.reviewContextGateway`, `removeWorktreeAction`, `deps.logger`) reused from the webhook close path.
- Dashboard (modified): `src/dashboard/index.html` — mark-as-merged button now on `pending-fix`, `pending-approval` and the now-lane card; merged reviews surface in the "completed" area with a green "Merged" badge via `renderMergedReviews`, fed by the new `merged` list. `src/dashboard/styles.css` — `.badge.merged` + `.merged-review-row`. `src/dashboard/modules/i18n.js` — generalized `modal.markMerged.message` (state-agnostic) and added `badge.merged` (EN "Merged" / FR "Mergée").

**Architectural decisions**:
- A dedicated use case rather than reusing `handleClose` (which always archives === deletes the record, erasing the badge target) or `TransitionStateUseCase` (the closure side-effects sit above the state write). Both stay untouched and keep serving the webhook paths.
- The terminal `merged` state already removes the review from the active lanes (`getActiveMrs` excludes `merged`/`closed`); the record is kept so the "Merged" badge has a persistent target.
- Worktree removal is best-effort — a failure logs a warning and never blocks the merge.
- SPEC-182's restrictive acceptance test was removed (its assertions — pending-approval/approved/merged rejected — directly contradict this generalization). SPEC-182 is marked superseded.

**Endpoints**:

| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/mr-tracking/mark-as-merged` | `MarkReviewAsMergedUseCase` |
| GET | `/api/mr-tracking` | now also returns the `merged` list |

## Context

Reviews regularly get merged on GitLab/GitHub but stay stuck in the dashboard because the platform merge event was missed. SPEC-182 added a manual "mark as merged" override, but only for reviews in state `pending-fix`. Reviewers need the same one-click escape from **any** state, and merging should also stop the review process (cancel the running job, free resources) and visibly tag the review as "Merged".

## Rules

- A review can be manually marked as merged regardless of its current state (`pending-review`, `pending-fix`, `pending-approval`, `approved`, `closed`, or already `merged`).
- Marking a review as merged sets it to the terminal `merged` state and records the merge timestamp.
- Marking a review as merged closes its review process: any running or queued review job for that review is cancelled, and its review context and worktree are released.
- Marking a review as merged retains the review record — the review is never deleted, so it can still be shown as merged.
- A merged review carries a visible "Merged" tag.
- A merged review leaves the active lanes and is shown in the completed area with its "Merged" tag, without any reload required.
- Marking an already-merged review is idempotent: it stays merged and returns success.
- The action requires an explicit confirmation step before the change is applied.
- The "mark as merged" action is available on every actionable review card, not only `pending-fix`.
- The action requires a valid project path; missing or invalid path is rejected with a French error message.
- The action requires a valid review identifier; a missing identifier is rejected with a French error message.
- Calling the action on an unknown review returns a 404 with a French error message.
- Releasing the worktree is best-effort: a failure to remove it does not prevent the review from being marked merged.

## Scenarios

- from pending-review: {state: "pending-review", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- from pending-fix: {state: "pending-fix", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- from pending-approval: {state: "pending-approval", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- from approved: {state: "approved", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- from closed: {state: "closed", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- already merged is idempotent: {state: "merged", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged"
- closure cancels a running job: {state: "pending-review", mrId: "mr-42", projectPath: "/home/user/proj", runningJob: true} → status "merged" + jobCancelled true + contextReleased true
- record is retained with the merged tag: {state: "pending-fix", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + recordRetained true + tag "Merged"
- unknown review: {mrId: "ghost", projectPath: "/home/user/proj"} → reject "MR non trouvée"
- missing review id: {mrId: "", projectPath: "/home/user/proj"} → reject "mrId requis"
- missing project path: {mrId: "mr-42", projectPath: ""} → reject "Chemin du projet requis"
- invalid project path: {mrId: "mr-42", projectPath: "../etc"} → reject "Chemin invalide"

## Out of Scope

- Bulk mark-as-merged across multiple reviews.
- Automatic detection of platform-side merges via background polling.
- Undo / revert of the manual mark-as-merged action.
- A symmetric "mark as closed" manual action (separate spec if needed).
- A dedicated archived-reviews browser — merged reviews surface in the existing completed area only.
- Changing the data source of the "Reviews terminées" report-file list.

## Glossary

| Term | Definition |
|------|------------|
| Review | A tracked merge/pull request, in one of the states `pending-review`, `pending-fix`, `pending-approval`, `approved`, `merged`, `closed`. |
| Mark as merged | An explicit user action that transitions a review directly to the terminal `merged` state from any current state. |
| Close the review process | Cancel any running/queued review job for the review and release its review context and worktree, freeing resources. |
| Merged tag | A visible badge rendered on a review whose state is `merged`. |
| Active lanes | The dashboard queue lanes that show non-terminal reviews (`now`, `needs-fix`, `ready-to-approve`); merged/closed reviews are excluded. |
| Completed area | The dashboard section that surfaces terminal reviews; a merged review appears here with its "Merged" tag. |
| Confirmation modal | The same UX pattern used for review cancellation: title with review identifier, back/confirm buttons, French copy. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Generalizes SPEC-182; no dependency on other in-flight specs. |
| Negotiable | OK | Behavior fixed; closure orchestration and badge placement are free. |
| Valuable | OK | One-click escape from any stuck state + frees review resources. |
| Estimable | OK | Reuses the existing transition path + the close-handling cleanup pieces. |
| Small | WARN | Wider than 182: button on all cards, closure side-effects, merged-record surfacing + badge. ~8-10 files. Still one coherent change. |
| Testable | OK | 12 scenarios cover every rule. |

Verdict: **READY** (Small flagged — scope is a deliberate generalization, kept to one feature).

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
