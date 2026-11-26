# Explain a pull request from the dashboard

## Status: implemented

## Context

Before approving or nudging, the reviewer wants to know what a pull request does without opening
it. A parallel feature, spec 226 (review request brief), delivers the brief endpoint
`POST /api/mr-tracking/brief`. This spec adds the dashboard side: an "Explain" button on every
queue row and a large one in the side panel of the redesigned dashboard
([230](230-dashboard-review-queue-shell.md)).

## Contract consumed

`POST /api/mr-tracking/brief` with `{ projectPath, mrNumber, refresh? }`.

- 200: `{ mrNumber, headSha, generatedAt, what, problem, risks[1..3], toCheck[1..2], size: { additions, deletions, changedFiles }, areas[] }`
- 404: pull request not tracked; 502: generation failed, `{ error }`
- up to 60 s; cached by head commit; `refresh: true` regenerates; language follows the dashboard setting

## Rules

- every queue row has an "Explain" button; the side panel has a large "Explain this pull request"
  button
- explaining selects the pull request and opens its detail in the side panel
- the brief has four states: rest (the large button and what it will tell), loading (Ember reads
  the description, the diff and the threads), ready, error (the reason and a retry)
- a ready brief shows: what it does, problem solved, risky parts, what to check by hand, size
  (additions, deletions, files, areas)
- a ready brief offers "Dig deeper with Ember", copy, and regenerate (`refresh: true`)
- "Dig deeper with Ember" switches the panel to Ember and asks about the risky parts, with the
  pull request as context
- the row button shows that a brief is being written
- the client gives up after 75 s (the server may take 60 s) and says so
- a brief already written or being written is not requested again unless regenerated
- what Ember writes is shown in violet; labels go through i18n

## Scenarios

- row button: {pull request in the queue} → "Explain" on its row
- rest: {pull request selected, no brief} → "Explain this pull request"
- loading: {request sent} → loading skeleton, row button busy
- ready: {200 with the contract body} → five sections, dig deeper, copy, regenerate
- regenerate: {ready brief, regenerate} → request with `refresh: true`
- error: {404} → "ReviewFlow does not track this pull request." and retry; {502} → "The brief
  could not be written." and the server message
- dig deeper: {ready brief} → Ember receives the risky parts

## Out of Scope

- the brief endpoint itself (spec 226)
- the "E" keyboard shortcut from the mockup

## Implementation

### Artefacts

- `src/dashboard/modules/prBrief.js` — request, response reading, rendering, copy text, Ember question
- `src/dashboard/modules/reviewQueueView.js` — row button
- `src/dashboard/index.html` — brief state per pull request, actions; `src/dashboard/shell.css` — styles
- `src/dashboard/modules/shellTranslations.js` — wording

### Decisions

- The endpoint is simulated in every test with a fetch stub following the contract; no backend
  code from spec 226 is used.
- `projectPath` is the local project path, as the other routes of the dashboard send it.
- The brief state lives in the page, per pull request, and is cleared when the project changes;
  the server cache (by head commit) keeps briefs across reloads.
- A malformed 200 answer is shown as an error rather than a half-filled brief.
