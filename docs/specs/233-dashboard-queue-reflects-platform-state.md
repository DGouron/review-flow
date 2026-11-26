# The dashboard queue reflects the real platform state

## Status: implemented

## Context

Measured on 2026-11-26 on a GitHub project (`practivizio-app`):

- `GET /api/mr-tracking` listed 61 pull requests to handle (7 to fix, 54 to approve). 36 of them
  were already closed or merged on GitHub.
- The `merged` bucket was empty while `closed` held 449 entries: a merged pull request was never
  filed as merged.
- 40 open pull requests of the repository were not tracked at all.

Two root causes:

1. GitHub reports a merge as `pull_request` action `closed` with `pull_request.merged = true`. The
   payload guard dropped `merged` and the close filter archived every merged pull request as
   `closed`.
2. Tracking only ever changed through webhooks. A missed webhook (server down, delivery failure)
   left the pull request in an active bucket forever: nothing read the platform state back.

The 40 untracked open pull requests are **by design**: a pull request enters tracking on the first
review request (or `needs-review` label) aimed at the configured reviewer. This spec does not change
that; it exposes the count so the dashboard can say it.

## Rules

- a GitHub `closed` event with `merged = true` moves the tracked pull request to `merged` and sets
  `mergedAt`; a `closed` event without merge keeps archiving it as `closed`
- a reconciliation reads the platform state of the tracked pull requests of an enabled GitHub
  repository:
  - one listing call returns the open pull requests of the repository
  - each actively tracked pull request missing from that list is fetched individually
  - `merged` on the platform → tracked state `merged`, `mergedAt` set to the sync time
  - `closed` on the platform → tracked state `closed`
  - `open` on the platform (reopened between the two calls) → untouched
  - pull requests already `merged` or `closed` in tracking are not re-examined
- the reconciliation runs at server start, every 5 minutes, and on every full sync
  (`POST /api/mr-tracking/sync` without `mrId`)
- a reconciliation failure is logged and never blocks the thread sync of the full sync
- the sync summary `{ syncedAt, removedClosed, untrackedOpen }` is kept per repository:
  - `removedClosed`: pull requests that left the active buckets during that sync (closed or merged)
  - `untrackedOpen`: pull requests open on the platform that are not actively tracked
- `GET /api/mr-tracking` returns the last summary as `sync`, `null` before the first sync or for a
  repository the reconciliation does not support
- the full sync response carries the same `sync` field

## Out of scope

- GitLab reconciliation: GitLab merge events are already filed as merged by the webhook; a GitLab
  state gateway can plug into the same use case later
- back-filling the historical `closed` entries that were in fact merged
- the dashboard banner itself (`src/dashboard` is being redesigned separately)
- persisting the summary across restarts: the first scheduled sync rebuilds it at start

## Scenarios

```gherkin
Scenario: a merged GitHub pull request is filed as merged
  Given pull request 123 is tracked as pending-approval
  When GitHub sends action "closed" with merged = true
  Then pull request 123 is tracked as merged with a merge date

Scenario: a pull request merged while the webhook was missed leaves the queue
  Given pull request 1924 is tracked as pending-approval
  And GitHub reports pull request 1924 as merged
  When a full sync runs
  Then GET /api/mr-tracking lists 1924 in merged and not in pendingApproval

Scenario: a pull request closed while the webhook was missed leaves the queue
  Given pull request 1394 is tracked as pending-fix
  And GitHub reports pull request 1394 as closed
  When a full sync runs
  Then GET /api/mr-tracking lists 1394 in closed and not in pendingFix

Scenario: an open pull request stays in its bucket
  Given pull request 1536 is tracked as pending-approval and open on GitHub
  When a full sync runs
  Then GET /api/mr-tracking still lists 1536 in pendingApproval

Scenario: the sync summary counts removed and untracked pull requests
  Given 1394 merged, 1435 closed and 1536 open on GitHub, all three tracked as active
  And 2001 and 2002 open on GitHub but not tracked
  When a full sync runs at 2026-11-26T09:30:00Z
  Then GET /api/mr-tracking returns sync { syncedAt: "2026-11-26T09:30:00.000Z", removedClosed: 2, untrackedOpen: 2 }

Scenario: no summary before the first sync
  Given no sync ran for the repository
  Then GET /api/mr-tracking returns sync null
```
