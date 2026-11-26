# Plan: 226 — Explain a review request in one click (backend)

Spec: `docs/specs/226-review-request-brief.md`
Module: `src/modules/review-brief/` (new bounded context — explaining a review request; it reads
tracking, platform and review-report data but owns none of them)

## Key architectural decisions

1. **New module, not `tracking`.** Tracking owns the lifecycle state of a request. Explaining it is a
   read-only consumer of tracking + platform + review files. The route keeps the
   `/api/mr-tracking/` prefix because that is the shared contract.
2. **Reuse Ember's transport instead of a new Claude transport.** The model gateway
   (`reviewBriefModel.ember.gateway.ts`) wraps `EmberAnswerTransportGateway`: it starts a run,
   concatenates chunks, resolves on `onDone`, and cancels on timeout. The composition root builds a
   dedicated `EmberAnswerTransportClaudeGateway` instance for briefs with an empty MCP config and a
   tighter tool policy. To allow that, `EmberAnswerTransportClaudeGatewayOptions` gains an optional
   `toolPolicy: { allowedTools; disallowedTools }`; the default stays exactly Ember's current policy.
3. **Brief tool policy.** `allowedTools: 'Read,Glob,Grep'` (the proven value; an empty list is not
   verified against the CLI), `disallowedTools: 'Edit,Write,Bash,Task,WebFetch,WebSearch,NotebookEdit'`,
   MCP config `{"mcpServers":{}}`. No write tool, no network tool, no MCP tool: an injected instruction
   has nowhere to send data and nothing to modify.
4. **Untrusted material as delimited data.** `reviewBriefPrompt.ts` (use case layer, pure) builds a
   system prompt with the instructions and output schema, and a question made only of data blocks
   `<<<NAME>>> ... <<<END NAME>>>`. Any `<<<` / `>>>` inside the material is replaced with `‹‹‹` /
   `›››` so it cannot close its block. Each part is capped (title 300, description 6 000, files list
   200 entries, threads 40 × 1 500, report 8 000 chars) with a visible `[truncated]` marker.
5. **Output validation.** `parseReviewBriefModelOutput` extracts the first `{` … last `}` (tolerates
   a code fence), `JSON.parse`, then `reviewBriefModelOutputGuard.safeParse`. Any failure → the use
   case returns `{ status: 'generation-failed', reason }` → `502`.
6. **`size` and `headSha` are never produced by the model.** `size` is summed from changed files;
   `headSha` comes from the platform overview fetched at request time.
7. **`areas` comes from the model** (0 to 5 strings ≤ 60 chars), like the validated mockup's briefs
   (top-level packages/modules). It is schema-validated like the other fields.
8. **Cache key includes the language.** The contract says "cached by headSha"; the language is added to
   the key so switching the dashboard language never serves a brief in the other language. Stored under
   `~/.claude-review/review-briefs/<project-slug>/<platform>-<mrNumber>-<headSha>-<language>.json`,
   never inside the reviewed repository (same convention as Ember memory). A corrupted file is a miss.
9. **Timeout 55 s** inside the model gateway, below the 60 s the contract allows, so the route answers
   `502` before the client gives up.
10. **Read-only on platforms.** New overview gateways run `gh api repos/<p>/pulls/<n>` and
    `glab api projects/<encoded>/merge_requests/<n>` through the **argv** executor (no shell). Threads
    use the existing argv thread gateways; changed files use the existing changed-files gateways. No
    gateway with a write capability is injected into the route.

## Artifacts

### ENTITY LAYER — `src/modules/review-brief/entities/reviewBrief/`

- `reviewBrief.schema.ts`
  - `reviewBriefModelOutputSchema = z.object({ what: nonEmptyTrimmed(≤600), problem: nonEmptyTrimmed(≤600), risks: z.array(nonEmpty ≤300).min(1).max(3), toCheck: z.array(nonEmpty ≤300).min(1).max(2), areas: z.array(nonEmpty ≤60).max(5) })`
  - `reviewBriefSchema` = output + `mrNumber` (int > 0), `headSha` (non-empty), `generatedAt` (ISO
    string), `size: { additions, deletions, changedFiles }` (ints ≥ 0)
  - types `ReviewBriefModelOutput`, `ReviewBrief`, `ReviewBriefSize`
- `reviewBrief.guard.ts` — `reviewBriefModelOutputGuard`, `reviewBriefGuard` via `createGuard`
- `reviewBriefCache.gateway.ts` — `ReviewBriefCacheKey { localPath; platform; mrNumber; headSha; language }`,
  `interface ReviewBriefCacheGateway { load(key): Promise<ReviewBrief | null>; save(key, brief): Promise<void> }`
- `reviewBriefModel.gateway.ts` — `ReviewBriefModelRequest { systemPrompt; material; localPath }`,
  `ReviewBriefModelResult = { status: 'completed'; text } | { status: 'failed'; reason }`,
  `interface ReviewBriefModelGateway { generate(request): Promise<ReviewBriefModelResult> }`
- `reviewRequestOverview.gateway.ts` — `ReviewRequestOverview { title; description: string; headSha }`,
  `interface ReviewRequestOverviewFetchGateway { fetchOverview(projectPath, mrNumber): ReviewRequestOverview | null }`

### USE CASE LAYER — `src/modules/review-brief/usecases/explainReviewRequest/`

- `reviewBriefPrompt.ts` — `buildReviewBriefPrompt(material, language): { systemPrompt; material }`
  and `parseReviewBriefModelOutput(text): ReviewBriefModelOutput | null`
- `explainReviewRequest.usecase.ts` — class `ExplainReviewRequestUseCase`
  - deps: `trackingGateway: ReviewRequestTrackingGateway`, `overviewFetchFor(platform)`,
    `changedFilesFetchFor(platform)`, `threadFetchFor(platform)`, `reviewFileGateway: ReviewFileGateway`,
    `modelGateway`, `cacheGateway`, `now: () => Date`
  - input `{ localPath; mrNumber; refresh; language }`
  - output `{ status: 'explained'; brief } | { status: 'not-tracked' } | { status: 'generation-failed'; reason }`
  - flow: tracking lookup (any platform, by number) → overview (null → failed) → cache (unless
    refresh) → changed files (null → failed) → threads (throw → []) → latest report (listReviews
    filtered by number, newest first; none → null) → prompt → model → parse/validate → brief → save

### INTERFACE ADAPTERS

- `interface-adapters/gateways/reviewRequestOverview.github.gateway.ts` (argv executor, zod-validated
  `{ title, body: string|null, head: { sha } }`, any error → null)
- `interface-adapters/gateways/reviewRequestOverview.gitlab.gateway.ts` (argv executor, zod-validated
  `{ title, description: string|null, sha }`, any error → null)
- `interface-adapters/gateways/reviewBriefCache.fileSystem.gateway.ts` (homeDir option)
- `interface-adapters/gateways/reviewBriefModel.ember.gateway.ts` (wraps `EmberAnswerTransportGateway`,
  `timeoutMs` option, default 55 000)
- `interface-adapters/controllers/http/reviewBrief.routes.ts` — Fastify plugin; options:
  `getRepositories`, `explainReviewRequest` (Pick<…,'execute'>), `getLanguage`, `logger`; zod body
  schema (`projectPath` string, `mrNumber` positive int, `refresh` optional boolean) → 400; unknown or
  disabled repo → 404; `not-tracked` → 404; `generation-failed` → 502 `{ error }`; `explained` → 200
  with the brief (exact contract keys)

### EXISTING CODE (modified)

- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` —
  optional `toolPolicy` option; default unchanged
- `src/main/routes.ts` — wiring (brief transport instance, gateways, use case, route registration)

### TESTS

- `src/tests/acceptance/226-review-request-brief.acceptance.test.ts` — route-level scenarios from the
  spec with stub model/platform and a temp-dir cache
- `src/tests/units/modules/review-brief/entities/reviewBrief/reviewBrief.schema.test.ts`
- `src/tests/units/modules/review-brief/usecases/explainReviewRequest/reviewBriefPrompt.test.ts`
- `src/tests/units/modules/review-brief/usecases/explainReviewRequest/explainReviewRequest.usecase.test.ts`
- `src/tests/units/modules/review-brief/interface-adapters/gateways/*.test.ts` (overview gateways with
  fake executor, cache with temp dir, ember model gateway with `StubEmberAnswerTransportGateway`)
- `src/tests/units/modules/review-brief/interface-adapters/controllers/http/reviewBrief.routes.test.ts`
- `src/tests/factories/reviewBrief.factory.ts`, `src/tests/stubs/reviewBriefModel.stub.ts`,
  `src/tests/stubs/reviewBriefCache.stub.ts`, `src/tests/stubs/reviewRequestOverview.stub.ts`

## Risks

- The Ember transport is humble glue validated manually; the brief path inherits its behaviour. The
  real `claude --bg` call is not exercised by tests (the model is simulated, as asked).
- 55 s may be short for very large requests; the 502 is explicit and `refresh` retries.
