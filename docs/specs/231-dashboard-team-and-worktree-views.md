# Dashboard Team and Worktrees views

## Status: implemented

## Context

Spec [230](230-dashboard-review-queue-shell.md) gave the dashboard three views. The Team and
Worktrees views still reused the old panels: a team tab cut off from the queue, a worktree table
that overflowed the page, and report cleanup in a separate section. This spec restyles both views
after the validated mockup and links the team to the queue.

## Rules

- the Team view shows the team health (one meter per category), one card per member and the team
  analysis
- a member card shows what waits for that member now (to fix, to approve, dormant), first-pass
  rate, blocking findings per review, average size, review count, the four category levels with
  their trend and the focus area
- clicking a member card opens the review queue filtered on that member, on the first lane that
  needs them (to fix, then to approve, then dormant)
- the developer sheet stays reachable from each card
- the team analysis says when it was generated, how old it is, which members it leaves out and
  whether new reviews arrived since; it offers to regenerate it and to export the report
- levels show as meters and plain numbers, never as a score out of 10
- the Worktrees view shows five counters (total, active, idle, stale, disk space), one row per
  worktree with its pull request, status, size, last write and path
- the worktree table never makes the page scroll sideways: it scrolls inside its card and long
  paths are shortened, the full path on hover
- the sweep, the next sweep, the report retention and the purge of old reports sit in one card;
  the purge asks for a confirmation click
- worktrees in error are listed with a force cleanup; otherwise the view says none is in error
- every label goes through i18n, in French and English

## Scenarios

- member link: {dave has one pull request to approve} → dave's card reads "1 to approve" and opens
  the queue filtered on dave, on the approval tab
- developer sheet: {any card} → a separate button opens the developer sheet
- stale analysis: {analysis generated 59 days ago, covering carol only, French} → "il y a 2 mois",
  "dave n'y figure pas", regenerate and export buttons
- no score: {team view} → no "/10"
- worktree table: {path longer than the column} → table scrolls inside its card, path shortened
  to its last segment, full path in the tooltip
- sweep card: {retention 14 days} → sweep now, purge old reports and "14 days" in one card
- healthy pool: {no worktree in error} → "No worktree in error"

## Out of Scope

- an average grade per member (insights expose no grade average; the card shows the review count)
- deleting a single healthy worktree from its row
- changing the report retention from the dashboard (stays at 14 days)

## Implementation

### Artefacts

- `src/dashboard/modules/teamView.js` — team view model and rendering
- `src/dashboard/modules/worktreeView.js` — worktree view rendering
- `src/dashboard/modules/shellTranslations.js` — team and worktree wording
- `src/dashboard/index.html` — wiring, `src/dashboard/shell.css` — styles

### Decisions

- Members are matched to queue rows by username: insights group reviews by the person who
  requested them, the queue by pull request author. For most teams they are the same person;
  when they differ the card shows no waiting count rather than a wrong one.
- The card body filters the queue; the developer sheet has its own button, so both gestures stay.
- The report purge moved into the Worktrees view, next to the sweep and the retention, and uses
  a confirmation click instead of a browser dialog.
- `teamTab.js`, `worktreePanel.js` rendering and `cleanup.js` are no longer called by the shell;
  they stay with their tests for a separate cleanup. `formatBytes` is still reused.
