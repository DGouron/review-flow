# Plan — 230 Dashboard shell: views, review queue by actor, side panel

Spec: [230-dashboard-review-queue-shell](../specs/230-dashboard-review-queue-shell.md)

## Layers

| Layer | File | Change |
|-------|------|--------|
| Entity | `src/modules/tracking/entities/tracking/trackedMr.ts` | add `author: MergeRequestAuthor \| null` |
| Use case | `src/modules/tracking/usecases/tracking/trackAssignment.usecase.ts` | record the author, keep a known one |
| Use case | `src/modules/tracking/usecases/tracking/nudgeAuthors.usecase.ts` | new: post one reminder per pull request |
| Controller | `src/modules/platform-integration/.../github.controller.ts` | pass `pull_request.user` as author |
| Controller | `src/modules/platform-integration/.../gitlab.controller.ts` | pass `null` (no author in the payload) |
| Controller | `src/modules/tracking/interface-adapters/controllers/http/nudgeAuthors.routes.ts` | new route |
| Wiring | `src/main/routes.ts` | register the nudge route with the scanned note gateways |
| Dashboard | `modules/reviewQueue.js` | lanes, dormant rule, last activity, author filter |
| Dashboard | `modules/reviewQueueView.js` | tabs, filter chips, rows with their gesture |
| Dashboard | `modules/prDetailPanel.js` | panel tabs and pull request detail |
| Dashboard | `modules/liveReviews.js` | banners for running reviews |
| Dashboard | `modules/healthPill.js` | single status pill and its popover lines |
| Dashboard | `modules/viewNavigation.js` | three views, remembered choice |
| Dashboard | `modules/shellTranslations.js` | FR/EN wording of the shell |
| Dashboard | `modules/settingsModal.js` | global settings section, plain title |
| Dashboard | `modules/headerCapacityBadge.js`, `overview.js`, `sizeBlockPanel.js`, `emberChat.js`, `tabBar.js` | i18n, no `//`, Ember context |
| Dashboard | `index.html`, `shell.css` | new markup, event delegation, styles |

## Order (inside-out)

1. `trackAssignment` author (RED on the use case, then the GitHub controller)
2. `NudgeAuthorsUseCase`, then its route, then the wiring
3. `reviewQueue.js` → `reviewQueueView.js` → `prDetailPanel.js` → `liveReviews.js` → `healthPill.js` → `viewNavigation.js`
4. Adjusted modules (capacity, settings, overview, size blocks, Ember, tab bar)
5. `index.html` and `shell.css`; superseded layout tests (SPEC-178, SPEC-181) rewritten for the new layout
6. Acceptance test `src/tests/acceptance/230-dashboard-review-queue-shell.acceptance.test.ts`
