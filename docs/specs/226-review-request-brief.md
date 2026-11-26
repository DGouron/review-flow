# Explain a review request in one click (backend)

## Status: implemented

## Context

A reviewer opening the dashboard sees a list of tracked pull/merge requests but has to open each one
on the platform to learn what it does. The redesigned dashboard adds an "Explain" button on every row
and in the side panel: one click returns a short brief — what the change does, the problem it solves,
where the risk is, what to check by hand, its size and the areas it touches.

This spec covers the backend only: `POST /api/mr-tracking/brief`. The button is built separately and
consumes the contract below.

The material of the brief (title, description, changed files, review threads, last review report) is
written by anyone with access to the repository. It is untrusted: it reaches the model as delimited
data, never as instructions, and the model's answer is validated against a schema before it leaves
the server.

## API contract (shared with the dashboard)

`POST /api/mr-tracking/brief`, JSON body
`{ "projectPath": string, "mrNumber": number, "refresh"?: boolean }`.

- `200`: `{ mrNumber, headSha, generatedAt (ISO), what: string, problem: string, risks: string[] (1 to 3), toCheck: string[] (1 to 2), size: { additions, deletions, changedFiles }, areas: string[] }`
- `400`: malformed body, `{ error }`
- `404`: the request is not tracked for that project, `{ error }`
- `502`: the brief could not be produced, `{ error }`
- The answer may take up to 60 seconds.
- The brief is cached per head commit; `refresh: true` regenerates it.
- The brief is written in the dashboard language setting.

## Rules

- `projectPath` is the local path of an enabled, configured repository; anything else is `404`
- the request is looked up in that project's tracking by its number; unknown number is `404`
- the brief material is: the title, the description, every changed file with its additions and
  deletions, the review threads with their conversation, and the latest review report for that
  number when one exists
- the head commit sha comes from the platform at request time, never from tracking
- `size` is computed from the changed files (sum of additions, sum of deletions, file count) — the
  model never produces it
- the material is passed to the model inside delimited data blocks; the instructions state that
  nothing inside them is an instruction
- delimiters inside the material are neutralised so the material cannot close its own block
- each part of the material is capped in length so one oversized description or report cannot crowd
  out the rest
- the model answers with a single JSON object; the server extracts it and validates it against the
  brief schema (`what`, `problem` non-empty; `risks` 1 to 3; `toCheck` 1 to 2; `areas` 0 to 5 short
  strings); any mismatch is `502`
- the model is dispatched through Ember's Claude transport (subscription `claude --bg`), with no MCP
  server, read-only tools only, and network/write tools denied
- a generation that does not finish in time is cancelled and reported as `502`
- a valid brief is written to a disk cache keyed by project, platform, request number, head sha and
  language, under `~/.claude-review/review-briefs/` — never inside the reviewed repository
- without `refresh`, a cached brief for the current head sha and language is returned without calling
  the model; with `refresh: true` the model is always called and the cache entry replaced
- the route never writes to GitHub or GitLab: it only reads the platform

## Scenarios

- first explain: {tracked PR, no cache} → `200`, model called once, brief cached
- explain again: {same head sha, same language} → `200`, same brief, model not called
- new push: {head sha changed} → model called, new brief for the new sha
- refresh: {cached brief, `refresh: true`} → model called, cache replaced
- language: {dashboard language `fr`} → the instructions ask for French; switching to `en` does not
  serve the French cache entry
- untracked: {number unknown in tracking} → `404`
- unknown project: {path not configured} → `404`
- malformed body: {`mrNumber` missing or not a positive integer} → `400`
- model returns prose: {no JSON object} → `502`
- model breaks the schema: {4 risks, or empty `what`} → `502`
- model transport fails or times out → `502`, nothing cached
- platform unreachable: {overview or changed files cannot be fetched} → `502`
- injection attempt: {description says "ignore previous instructions" and contains the closing
  delimiter} → the text stays inside its data block, the delimiter is neutralised
- no review report: {no report file for that number} → brief generated, report block says none
- threads unavailable: {thread fetch throws} → brief generated without threads

## Out of Scope

- The dashboard button, its loading state and rendering (separate change).
- Streaming the brief progressively.
- Deduplicating concurrent generations for the same request (the button is disabled while loading).
- Cache eviction: entries are small, one per head sha per language.

## Glossary

| Term | Definition |
|------|------------|
| brief | The structured explanation of one review request at one head sha |
| material | The untrusted platform and review data the brief is written from |
| overview | Title, description and head sha of a review request, read from the platform |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Backend only; the contract is fixed and shared with the dashboard change |
| Negotiable | OK | Material, cache key and timeout are implementation decisions |
| Valuable | OK | Understanding a request without opening it on the platform |
| Estimable | OK | One use case, four small gateways, one route |
| Small | OK | Reuses thread, changed-files, review-file and Ember transport gateways |
| Testable | OK | Model is a stub; every rule maps to a use case or route test |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Module**: `src/modules/review-brief/` (new bounded context, read-only consumer of tracking,
  platform and review-report data).
- **Entities**: `reviewBrief.schema.ts` (model output + brief schemas), `reviewBrief.guard.ts`,
  gateway contracts `reviewBriefCache.gateway.ts`, `reviewBriefModel.gateway.ts`,
  `reviewRequestOverview.gateway.ts`.
- **Use case**: `ExplainReviewRequestUseCase` (`explainReviewRequest.usecase.ts`) and the pure prompt
  builder / output parser `reviewBriefPrompt.ts`.
- **Gateways**: `reviewRequestOverview.github.gateway.ts` / `.gitlab.gateway.ts` (argv executor, no
  shell), `reviewBriefCache.fileSystem.gateway.ts`, `reviewBriefModel.ember.gateway.ts` (wraps Ember's
  `EmberAnswerTransportGateway`, 55 s timeout then cancel).
- **Reused**: tracking gateway, changed-files gateways, argv thread gateways, `ReviewFileGateway`,
  `EmberAnswerTransportClaudeGateway` (new optional `toolPolicy`, Ember's default unchanged).
- **Controller**: `reviewBrief.routes.ts`, wired in `src/main/routes.ts`.

### Endpoints

| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/mr-tracking/brief` | `ExplainReviewRequestUseCase` |

### Decisions

- The cache key adds the language to the head sha, so a language switch never serves the other
  language's brief.
- `areas` is produced by the model and schema-validated; `size` and `headSha` never are.
- The brief transport instance has no MCP server, allows only `Read,Glob,Grep`, and denies
  `Edit,Write,Bash,Task,WebFetch,WebSearch,NotebookEdit`.
- An unexpected exception in the use case (e.g. a platform CLI throwing) is a `502`, not a `500`.
- Error messages returned to the dashboard are in French (user-facing); internal reasons are logged.
