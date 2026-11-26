# Report: 226 — Explain a review request in one click (backend)

Spec: `docs/specs/226-review-request-brief.md` — Plan: `docs/plans/226-review-request-brief.plan.md`

```
FINAL_REPORT:
  STATUS: OK Clean (one inherited lint warning noted below)
  FILES_CREATED: 23
  FILES_MODIFIED: 8 (+ feature tracker, spec status)
  TESTS_TOTAL (feature): 140 across 10 files — all pass
  TESTS_TOTAL (suite): 4785 across 548 files — all pass
  REVIEW_ITERATIONS: 2
  VIOLATIONS_FOUND: 5
  VIOLATIONS_FIXED: 4
  ACCEPTANCE_TEST:
    file: src/tests/acceptance/226-review-request-brief.acceptance.test.ts
    status: GREEN (21/21; RED at start because the modules did not exist)
```

## Files created

Production (`src/modules/review-brief/`):
- `entities/reviewBrief/reviewBrief.schema.ts`: the model output schema and brief schema (what/problem non-empty and trimmed, risks 1 to 3, toCheck 1 to 2, areas 0 to 5 strings of at most 60 characters; size and headSha are not produced by the model)
- `entities/reviewBrief/reviewBrief.guard.ts`: `reviewBriefModelOutputGuard` and `reviewBriefGuard` (built with `createGuard`)
- `entities/reviewBrief/reviewBriefCache.gateway.ts`: cache contract keyed by localPath, platform, mrNumber, headSha and language
- `entities/reviewBrief/reviewBriefModel.gateway.ts`: model contract `generate(request) → completed{text} | failed{reason}`
- `entities/reviewBrief/reviewRequestOverview.gateway.ts`: read-only overview contract (title, description, headSha)
- `usecases/explainReviewRequest/reviewBriefPrompt.ts`: pure prompt builder (delimited data blocks, delimiters neutralised, length caps, "data, not instructions", single JSON object, French or English) and `parseReviewBriefModelOutput`
- `usecases/explainReviewRequest/explainReviewRequest.usecase.ts`: `ExplainReviewRequestUseCase`
- `interface-adapters/gateways/reviewRequestOverview.github.gateway.ts`: `gh api repos/<p>/pulls/<n>` over the argv executor, Zod-validated, any error → null
- `interface-adapters/gateways/reviewRequestOverview.gitlab.gateway.ts`: `glab api projects/<encoded>/merge_requests/<n>` over the argv executor, same rules
- `interface-adapters/gateways/reviewBriefCache.fileSystem.gateway.ts`: `~/.claude-review/review-briefs/<project-slug>/<platform>-<n>-<sha>-<lang>.json`; a corrupted or invalid file counts as a miss; the sha and path segments are sanitised
- `interface-adapters/gateways/reviewBriefModel.ember.gateway.ts`: wraps `EmberAnswerTransportGateway`, concatenates chunks, times out after 55 s (configurable) and then cancels
- `interface-adapters/controllers/http/reviewBrief.routes.ts`: `POST /api/mr-tracking/brief` (400/404/502/200)

Tests:
- `src/tests/acceptance/226-review-request-brief.acceptance.test.ts`
- `src/tests/units/modules/review-brief/entities/reviewBrief/reviewBrief.schema.test.ts`
- `src/tests/units/modules/review-brief/usecases/explainReviewRequest/reviewBriefPrompt.test.ts`
- `src/tests/units/modules/review-brief/usecases/explainReviewRequest/explainReviewRequest.usecase.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/gateways/reviewRequestOverview.github.gateway.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/gateways/reviewRequestOverview.gitlab.gateway.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/gateways/reviewBriefCache.fileSystem.gateway.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/gateways/reviewBriefModel.ember.gateway.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/controllers/http/reviewBrief.routes.test.ts`
- `src/tests/factories/reviewBrief.factory.ts`, `src/tests/factories/reviewRequestOverview.factory.ts`
- `src/tests/stubs/reviewBriefModel.stub.ts`, `src/tests/stubs/reviewBriefCache.stub.ts`, `src/tests/stubs/reviewRequestOverview.stub.ts`

## Files modified

- `src/main/routes.ts`: adds a dedicated `EmberAnswerTransportClaudeGateway` for briefs (MCP config `{"mcpServers":{}}`, allowed `Read,Glob,Grep`, disallowed `Edit,Write,Bash,Task,WebFetch,WebSearch,NotebookEdit`), the use case wiring (read-only gateways only) and the route registration after `mrTrackingAdvancedRoutes`
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts`: adds an optional `toolPolicy` option. The default is the same as Ember's previous policy, and an existing test pins it
- `src/tests/units/modules/ember-chat/gateways/emberAnswerTransport.claude.gateway.test.ts`: adds 1 test that checks a custom tool policy reaches the dispatch flags
- `src/tests/stubs/emberAnswerTransport.stub.ts`: adds `cancelCount`, `startedWith` and `neverAnswer()` (additive)
- `src/tests/stubs/threadFetch.stub.ts`: adds `setFailure(error)` (additive)
- `src/tests/factories/githubApiResponse.factory.ts`: adds `createPullRequestOverviewResponse` (additive)
- `src/tests/factories/gitlabApiResponse.factory.ts`: adds `createMergeRequestResponse` (additive)
- `docs/feature-tracker.md` and the spec status: changed to `implemented`

## Spec coverage

| Rule / scenario | Covered by |
|---|---|
| projectPath must be an enabled configured repository, else 404 | acceptance "unknown project"; route "404 when the project is not configured / disabled" |
| lookup by number in tracking, unknown → 404 | acceptance "untracked"; use case "tracking lookup" |
| material = title, description, changed files, threads with conversation, latest report | acceptance "threads", "latest review report"; use case "material"; prompt "data blocks" |
| head sha from the platform at request time | use case "takes the head sha from the platform"; acceptance "new push" |
| size computed from changed files | acceptance "first explain: exact keys + size"; use case "computes the size" |
| delimited data blocks + "not instructions" statement | prompt "instructions"; acceptance "injection attempt" |
| delimiters neutralised | prompt "injection" (3 tests); acceptance "injection attempt" |
| per-part length caps | prompt "length caps" (7 tests) |
| single JSON object, schema-validated, mismatch → 502 | schema tests (18); prompt `parseReviewBriefModelOutput`; acceptance "prose", "4 risks", "empty what" |
| Ember transport, no MCP, read-only tools, network/write denied | routes.ts wiring; transport test "dispatches with the tool policy given in the options" |
| timeout → cancelled + 502 | model gateway "cancels the run and fails when it does not finish in time"; acceptance "transport fails or times out" |
| cache under ~/.claude-review/review-briefs keyed by project, platform, number, sha, language | cache gateway tests (12) |
| cache hit without refresh, refresh replaces | acceptance "explain again", "refresh"; use case "cache" |
| language fr/en, no cross-language cache hit | acceptance "language"; route "writes the brief in the dashboard language" |
| malformed body → 400 | acceptance (2); route (6 cases) |
| platform unreachable → 502 | acceptance (overview, changed files); route "reading the material throws" |
| no report → block says none | acceptance "no review report"; prompt "says none when there is no review report" |
| threads unavailable → brief still generated | acceptance + use case "threads cannot be fetched" |
| never writes to GitHub or GitLab | only read gateways are injected (overview, changed files, threads, review files) |

## Self-review findings

1. Fixed: `promise/no-multiple-resolved` lint error in the model gateway. Rewritten with `Promise.race` and one resolver per promise.
2. Fixed: `consistent-function-scoping` warnings caused by placeholder resolver functions.
3. Fixed: `max-lines-per-function` in the use case (`generate`, 39 lines). Split into `generate` and `askModel`.
4. Fixed: `max-lines-per-function` in the route handler (32 lines). Extracted `isEnabledRepository`.
5. Not fixed: `emberAnswerTransport.claude.gateway.ts` now has 208 counted lines against a limit of 200, so it gets a new `max-lines` warning. Its `max-params` warning existed before and goes from 6 to 7. This file is the humble-glue transport, which already carried warnings. Shrinking it means refactoring Ember's runner, which is outside this scope. A follow-up could merge `mcpConfigJson` and `toolPolicy` into one dispatch-access object.

## Deviations from the plan

- Additive test-infrastructure changes to existing stubs and factories (listed above) were needed to observe cancellation, start options, thread failures and platform responses. Production behaviour is unchanged.
- The route catches unexpected exceptions from the use case (for example a gateway that throws) and returns `502 { error }` with an error log. Without this they would surface as 500. The plan did not mention it, but the spec says "platform unreachable → 502".
- The 400/404/502 error strings are in French, because the project rule says user-facing text is French. Internal reasons such as `overview-unavailable`, `changed-files-unavailable`, `invalid-model-output` and `review-brief-timeout` are logged, not returned.
- The GitLab overview gateway encodes the project path with `encodeURIComponent`. This gives the same `%2F` result as the existing thread gateway, and other special characters are encoded as well.
- The real `claude --bg` path is not exercised: the model is simulated in every test, as the plan says under Risks.

## verify (tail)

```
$ oxfmt --check src
All matched files use the correct format.
$ vitest --run
 Test Files  548 passed (548)
      Tests  4785 passed (4785)
Done in 16.53s.
```
