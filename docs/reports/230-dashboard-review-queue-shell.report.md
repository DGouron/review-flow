# Report — 230 Dashboard shell: views, review queue by actor, side panel

Spec: [230-dashboard-review-queue-shell](../specs/230-dashboard-review-queue-shell.md) — Plan: [230](../plans/230-dashboard-review-queue-shell.plan.md)

## Status: complete

## Files

Created:
- `src/modules/tracking/usecases/tracking/nudgeAuthors.usecase.ts`
- `src/modules/tracking/interface-adapters/controllers/http/nudgeAuthors.routes.ts`
- `src/dashboard/modules/reviewQueue.js`, `reviewQueueView.js`, `prDetailPanel.js`, `liveReviews.js`, `healthPill.js`, `viewNavigation.js`, `shellTranslations.js`
- `src/dashboard/shell.css`
- tests for each of the above, and `src/tests/acceptance/230-dashboard-review-queue-shell.acceptance.test.ts`

Modified:
- `trackedMr.ts`, `trackAssignment.usecase.ts`, both webhook controllers, `src/main/routes.ts`
- `index.html` (markup rewritten, script reworked around the new modules)
- `settingsModal.js`, `headerCapacityBadge.js`, `overview.js`, `sizeBlockPanel.js`, `emberChat.js`, `tabBar.js`, `i18n.js`
- layout tests superseded by this spec: `dashboardLayout.test.ts` (SPEC-181) and the DOM part of the SPEC-178 acceptance test

## Tests

`yarn verify` green. Acceptance test 230: 10 scenarios GREEN.

## Self-review

- Old layout assertions (focus strip, card counters, project bar, sidebar) were rewritten, not
  deleted silently: they described the layout this spec replaces.
- Modules that the shell no longer calls (`queueLanes.js`, `cardCounters.js`, `assignee.js`) are
  left in place with their tests; removing them is a separate cleanup.
- Headless screenshots checked: queue, selected pull request, dormant tab with confirmation,
  status popover, overview, Escape closing the logs drawer, 390 px width.

## Spec coverage

| Rule | Covered by |
|------|------------|
| Queue by actor, dormant after 30 days | `reviewQueue.test.ts`, acceptance |
| Author filter | `reviewQueue.test.ts`, acceptance |
| Gesture on the row | `reviewQueueView.test.ts`, acceptance |
| Author of the pull request, last activity | `trackAssignment.usecase.test.ts`, `github.controller.test.ts`, `reviewQueue.test.ts`, acceptance |
| Grades only | `reviewQueueView.test.ts`, `prDetailPanel.test.ts`, acceptance |
| Single status pill, capacity | `healthPill.test.ts`, `headerCapacityBadge.test.ts`, acceptance |
| Settings hold model, trigger, timeout | `settingsModal.test.ts`, acceptance |
| Ember context | `emberChat.test.ts`, acceptance |
| Nudge | `nudgeAuthors.usecase.test.ts`, `nudgeAuthors.routes.test.ts`, acceptance |
| Language, no `//` | `shellTranslations.test.ts`, `overview.test.ts`, `dashboardLayout.test.ts` |
| Layout, Escape | `dashboardLayout.test.ts`, headless screenshot |
