# Plan — Fix the GitLab change-size source (spec-206)

PLAN:
  scope: GitLab diff-stats fetch reads additions/deletions/fileCount from GitLab GraphQL
         `diffStatsSummary` (the REST MR endpoint never returns those fields), and surfaces
         a "no usable diff summary" / fetch error as a logged warning instead of swallowing it.
  is_new_module: false

## Anti-overengineering verdict

This is a localized bug fix, NOT a new capability. Apply YAGNI hard:

- No new entity, use case, controller, presenter, view, factory, or stub.
- `DiffStats` shape (`{ commitsCount, additions, deletions }`) MUST stay stable — `commitsCount`
  is consumed downstream (dashboard `src/dashboard/modules/mrSheet.js:123`, insights/stats
  persistence, GitHub gateway). Do NOT add `fileCount` to the type just because GraphQL exposes it.
- GraphQL gives `fileCount`, not `commitsCount`. The current GitLab gateway makes a 2nd REST call
  to `/merge_requests/:iid/commits` to derive `commitsCount`. KEEP that 2nd call — `commitsCount`
  is a live field and dropping it would silently zero a rendered dashboard column. Only the
  additions/deletions SOURCE changes (REST MR -> GraphQL diffStatsSummary).
- Do NOT thread a logger through the gateway constructor: it has 5 instantiation sites
  (`routes.ts:197,349,422,534` + `claudeInvoker.ts:182`) and the codebase already has a
  centralized warning wrapper (`fetchDiffStatsSafely`). Reuse it.

Conclusion: 1 production file + 1 test file. No structural changes. Verdict: minimal fix justified, no patterns added.

## Layer mapping (Clean Architecture)

| Layer | Touched? | What |
|-------|----------|------|
| Entities (domain) | NO | `DiffStats` type and `DiffStatsFetchGateway` contract unchanged. |
| Use cases | NO | No business workflow change. |
| Interface adapters — Gateway impl | YES | `diffStatsFetch.gitlab.gateway.ts` — swap additions/deletions source REST->GraphQL; stop silent-swallow. |
| Services (statistics-insights) | NO (verify) | `fetchDiffStatsSafely` already logs a warning when the gateway throws. The fix relies on it; do not modify unless a test proves otherwise. |
| Frameworks / Composition root | NO | Gateway constructor signature kept identical (`executor` only) -> zero wiring churn at the 5 sites. |
| Dashboard / views | NO | Rendering additions/deletions is explicitly out of scope. |

## The fix (architectural decisions, no code)

Current gateway (`diffStatsFetch.gitlab.gateway.ts`):
1. `glab api projects/:enc/merge_requests/:iid` (REST) -> reads `additions`/`deletions` **which REST never returns** -> guard returns null every time. ROOT CAUSE.
2. `glab api projects/:enc/merge_requests/:iid/commits` (REST) -> `commitsCount`.
3. Whole body wrapped in `try { ... } catch { return null }` -> failures swallowed silently.

Target gateway behaviour:
1. Replace call #1 with GitLab GraphQL:
   `glab api graphql -f query='query { project(fullPath:"group/proj"){ mergeRequest(iid:"N"){ diffStatsSummary{ additions deletions fileCount } } } }'`
   - `projectPath` is already `group/project` form -> inject as `fullPath`. No `%2F` encoding for GraphQL (it is the `fullPath` argument, not a REST path segment).
   - `iid` is the `mergeRequestNumber`.
   - Response shape: `{ data: { project: { mergeRequest: { diffStatsSummary: { additions, deletions, fileCount } } } } }`.
   - Read `additions`/`deletions` from `data.project.mergeRequest.diffStatsSummary`.
   - `fileCount` is fetched but NOT mapped into `DiffStats` (type stays stable). Mapping it is out of scope (spec: no rendering of files-changed).
2. Keep call #2 (REST `/commits`) for `commitsCount` — unchanged.
3. Warning, not silent swallow (spec rule 3):
   - "No usable diff summary" = `data.project` is null, or `mergeRequest` is null, or `diffStatsSummary` missing, or additions/deletions not numbers.
   - Decision: the gateway THROWS on "no usable diff summary" and on exec/JSON-parse errors, so the existing centralized wrapper `fetchDiffStatsSafely` logs `warn(... 'Failed to fetch diff stats')` and returns null. This keeps the constructor signature stable (no logger injection across 5 sites) and keeps logging in one place.
   - This means REMOVING the gateway's internal `try { } catch { return null }`. The gateway no longer returns `null` for failures; it throws, and the wrapper converts throw -> warn + null. (`null` may still be the resolved value only if a future legitimately-empty summary appears, but per the audit a missing summary should be treated as an error to log.)
   - GitHub gateway stays exactly as-is (spec rule 4 / scenario "github unchanged"). The two gateways are allowed to diverge.

Sync constraint: GraphQL call is still one synchronous `executor(command)` returning a string. Fetch stays synchronous (called sync at `claudeInvoker.ts:290-291` and via stats routes). No async introduced.

ENTITIES:
  - none — `DiffStats` (`src/modules/shared-kernel/entities/diffStats/diffStats.ts`) and
    `DiffStatsFetchGateway` (`.../diffStats/diffStatsFetch.gateway.ts`) unchanged.

USECASES:
  - none.

GATEWAYS:
  - name: GitLabDiffStatsFetchGateway
    contract: src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts (unchanged)
    implementation: src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts (MODIFY)
    stub: src/tests/stubs/diffStatsFetch.stub.ts (unchanged — interface-level stub used by acceptance + use case tests)
    methods: fetchDiffStats(projectPath, mergeRequestNumber): DiffStats | null
    changes:
      - additions/deletions source: REST MR endpoint -> GraphQL diffStatsSummary
      - commitsCount source: REST /commits (KEPT)
      - failure handling: throw instead of swallow (warning logged by fetchDiffStatsSafely)
      - constructor signature: unchanged (executor only)

CONTROLLERS:
  - none.

PRESENTERS:
  N/A — rendering additions/deletions is explicitly out of scope.

VIEWS:
  N/A

WIRING:
  routes: none — gateway constructor signature is unchanged, so the 5 instantiation sites
          (src/main/routes.ts:197, 349, 422, 534 and src/frameworks/claude/claudeInvoker.ts:182)
          need NO edit.
  dependencies: none new.

IMPLEMENTATION_ORDER:
  1. src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts — REWRITE the
     stub-executor expectations FIRST (RED). The existing tests assert REST MR JSON with `additions`/
     `deletions` and command `merge_requests/99`; those become wrong. New tests must:
       a. branch the stub on `command.includes('graphql')` returning the GraphQL envelope
          `{ data: { project: { mergeRequest: { diffStatsSummary: { additions, deletions, fileCount } } } } }`,
          and on `command.includes('/commits')` returning the commits array;
       b. assert the gateway emits a `glab api graphql` command containing `fullPath:"group/project"` and `iid:"<n>"`;
       c. assert mapping: additions/deletions from diffStatsSummary, commitsCount from commits array length;
       d. assert THROW (not null) when project is null / mergeRequest is null / diffStatsSummary missing
          (replaces the old "return null when malformed" expectations);
       e. assert THROW when the graphql executor throws, and when the commits executor throws;
       f. zero-diff case: diffStatsSummary additions 0 / deletions 0 -> returned, not thrown.
  2. src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts — GREEN:
     implement the GraphQL query for additions/deletions, keep the /commits call, remove the swallowing
     try/catch so failures propagate to fetchDiffStatsSafely.
  3. Run the SPEC-206 acceptance test (see ACCEPTANCE_TEST) — GREEN once the gateway behaves.
  4. yarn verify — confirm no regression in the GitHub gateway test, fetchDiffStatsSafely, stats service,
     and the SPEC-47 acceptance test (which uses the interface stub, not the real GitLab gateway, so it
     should stay GREEN throughout).

## RED tests needed (mapping spec scenarios -> assertions)

Unit (`diffStatsFetch.gitlab.gateway.test.ts`), executor stubbed:
  - "gitlab with changes" (scenario 1): graphql stub returns additions 629 / deletions 3 / fileCount 11,
    commits stub returns N commits -> result `{ additions: 629, deletions: 3, commitsCount: N }`.
  - command shape: emitted graphql command contains `fullPath:"group/proj"` and `iid:"5444"`.
  - "gitlab no diff summary" (scenario 2): graphql stub returns `{ data: { project: { mergeRequest: null } } }`
    (and `project: null`) -> gateway THROWS -> (in the acceptance test, surfaces as null + warning).
  - "gitlab fetch error" (scenario 3): graphql executor throws -> gateway THROWS.
  - commits executor throws -> gateway THROWS.
  - malformed graphql JSON -> gateway THROWS.
  - zero-diff: additions 0 / deletions 0 -> returned, not thrown.

Acceptance: see ACCEPTANCE_TEST below — asserts the warning-on-failure rule end to end via
  `fetchDiffStatsSafely` (matching the SPEC-47 pattern of `vi.spyOn(logger, 'warn')`).

ACCEPTANCE_TEST:
  file: src/tests/acceptance/206-fix-gitlab-diff-stats-source.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
         Drive the REAL GitLabDiffStatsFetchGateway with a stub SimpleCommandExecutor through
         fetchDiffStatsSafely + a pino silent logger (mirror SPEC-47 acceptance structure):
           - scenario 'gitlab with changes': graphql+commits stub -> diffStats { additions 629, deletions 3, commitsCount N }, no warning.
           - scenario 'gitlab no diff summary': graphql stub returns null mergeRequest -> fetched null + warn called once.
           - scenario 'gitlab fetch error': executor throws -> fetched null + warn called once.
         GitHub-unchanged is covered by the untouched GitHub gateway test (no new acceptance needed)."

REFERENCE_FILES:
  - docs/specs/206-fix-gitlab-diff-stats-source.md — the spec (rules + scenarios driving the tests).
  - src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts — the file to fix (root cause: REST source).
  - src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts — existing RED-to-rewrite unit test.
  - src/modules/shared-kernel/entities/diffStats/diffStats.ts — DiffStats shape to keep stable (commitsCount lives here, consumed downstream).
  - src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts — the gateway contract (unchanged).
  - src/modules/statistics-insights/services/fetchDiffStatsSafely.ts — centralized warn-on-throw wrapper the fix reuses for spec rule 3.
  - src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.ts — GitHub gateway that MUST stay unchanged (rule 4).
  - src/tests/units/interface-adapters/gateways/diffStatsFetch.github.gateway.test.ts — guard rail: must stay GREEN.
  - src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts — pattern reference for the new acceptance test (warn spy, fetchDiffStatsSafely, statsService).
  - src/shared/foundation/commandExecutor.ts — SimpleCommandExecutor type (sync `(command) => string`); fetch must stay sync.
  - src/dashboard/modules/mrSheet.js:123 — proof commitsCount is rendered (why the /commits call is kept).
  - src/main/routes.ts:197,349,422,534 + src/frameworks/claude/claudeInvoker.ts:179-182,290-291 — instantiation/call sites confirming the constructor must stay (executor)-only and the call stays sync.
