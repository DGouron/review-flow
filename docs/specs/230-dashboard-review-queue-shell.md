# Dashboard shell: three views, a review queue by actor and a side panel

## Status: implemented

## Context

The dashboard stacks three rows of counters, seven panels and four status badges. The person who
opens it must work out which pull requests wait on them, on an author or on Claude. The validated
mockup (`.audit/refonte-dashboard/Main.dc.html`) replaces this with three views, one queue per
actor with the gesture on the row, and a side panel that explains a pull request or talks to
Ember. This spec covers the shell, the navigation, the queue and the panel. The Team and Worktrees
views are restyled in [231](231-dashboard-team-and-worktree-views.md); the "Explain" button is
[232](232-dashboard-explain-pull-request.md). Syncing the queue with GitHub (closed pull requests
still listed) belongs to another feature.

## Rules

- the header holds three views: review queue, team, worktrees; nothing the old page offered is lost
  (Ember chat, worktree pool and cleanup, team insights, logs, Claude check, Claude costs, stats page)
- model, trigger mode and review timeout move from the header to the settings dialog, which also
  opens on the "all projects" tab (global settings only)
- one status pill folds Claude CLI, the platform CLI, live updates, worktrees and version; its
  popover lists each one and offers to check Claude again and to update ReviewFlow
- the capacity reads `running/total in parallel`
- the queue has four tabs, the only counters left on the page: to approve (you), to fix (the
  author), in review (Claude), dormant (more than 30 days without activity)
- a merge request under review sits in "in review" whatever its tracking state; one idle for more
  than 30 days sits in "dormant"
- an author filter narrows every tab; tabs count what the filter keeps
- each row carries its gesture: approve (opens the platform review page), run the follow-up,
  cancel the running review, nudge the author; dormant pull requests can be nudged together
- nudging posts a reminder comment on the pull request, in the dashboard language, after a
  confirmation click
- the side panel has two tabs: the selected pull request (verdict, grade, counts, next step,
  actions, full history) and Ember; Ember is reachable from the three views and receives the
  selected pull request as context
- the row and the panel show the pull request author, never who requested the review, and the age
  of the last activity, never the creation date
- every label goes through the existing i18n (French and English), without `//` prefixes nor forced
  capitals; Geist for text, Geist Mono for numbers; orange marks the main action, violet what Ember
  writes
- grades A to E only; no score out of 10 anywhere
- the "recent reviews" rows of the overview no longer overlap, and a drawer closed with Escape is
  fully hidden

## Scenarios

- queue by actor: {1 pull request ready, 1 with open threads, 1 job running, 1 idle for 45 days} →
  tabs read 1 / 1 / 1 / 1
- author filter: {pull requests by carol and dave, filter dave} → only dave's rows, counts follow
- row gestures: {approval row} → approve link; {fix row} → run the follow-up; {dormant row} →
  nudge the author, and nudge all on the tab
- author and age: {review requested by "requester" on carol's pull request, created 50 days ago,
  pushed 3 days ago} → row shows carol, "3 days ago"
- no score: {review event with score 7 and grade C} → C shown, no "/10"
- status pill: {every service answers} → "Operational", five lines
- capacity: {1 running, capacity 5} → "1/5 in parallel"
- settings: {settings dialog} → model, trigger and timeout controls
- Ember context: {pull request #7 selected, question asked} → the question sent names #7
- grouped nudge: {two dormant pull requests, French dashboard} → two comments, the first mentions
  the author, both in French
- Escape: {logs drawer open, Escape} → drawer hidden

## Out of Scope

- syncing the queue with GitHub and the banner that summarises it
- approving on the platform from the dashboard (the approve gesture opens the platform page)
- restyling the Team and Worktrees views (spec 231) and the "Explain" button (spec 232)
- keyboard shortcuts shown in the mockup footer
- the GitLab pull request author (the GitLab webhook does not carry it; see Implementation)

## Glossary

| Term | Definition |
|------|------------|
| lane | One tab of the review queue: approve, fix, review or dormant |
| dormant | A tracked merge request without activity for more than 30 days |
| last activity | The most recent of creation, last push, last review and approval |
| nudge | A reminder comment posted on a dormant pull request |

## Implementation

### Artefacts

- Entity: `TrackedMr.author` (`MergeRequestAuthor | null`) — `src/modules/tracking/entities/tracking/trackedMr.ts`
- Use cases: `TrackAssignmentUseCase` records the author; `NudgeAuthorsUseCase` posts the reminders
- Controller: `nudgeAuthorsRoutes` — `src/modules/tracking/interface-adapters/controllers/http/nudgeAuthors.routes.ts`
- Dashboard modules: `reviewQueue.js` (model), `reviewQueueView.js`, `prDetailPanel.js`,
  `liveReviews.js`, `healthPill.js`, `viewNavigation.js`, `shellTranslations.js`
- Dashboard shell: `src/dashboard/index.html`, `src/dashboard/shell.css`

### Endpoints

| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/mr-tracking/nudge` `{ projectPath, mrIds, language }` | `NudgeAuthorsUseCase` |

### Decisions

- The approve gesture opens the platform review page (`/files` on GitHub) instead of approving
  through the API: ReviewFlow already moves the pull request out of the queue when the platform
  approval arrives, and approving on someone's behalf is an outward action the spec did not ask for.
- The author comes from the GitHub webhook (`pull_request.user`). The GitLab merge request webhook
  only carries the actor, which is the very bug being fixed, so GitLab records no author and the
  row reads "Author unknown". Merge requests tracked before this change also read "Author unknown"
  until their next webhook.
- Nudging needs a confirmation click (the button turns into "Confirm" for six seconds) because it
  posts on the platform.
- Shell wording lives in `shellTranslations.js`, merged into `i18n.js`, to keep the new copy in one
  place and away from concurrent edits of `i18n.js`.
- `shell.css` is loaded after `styles.css` by `index.html` only, so `stats.html` and `setup.html`
  keep their look.
