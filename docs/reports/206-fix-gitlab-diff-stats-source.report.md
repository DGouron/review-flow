# Implementation Report — Fix the GitLab change-size source (spec-206)

## Summary

The GitLab diff-stats gateway read `additions`/`deletions` from the REST merge-request
endpoint, which never returns those fields — so every GitLab review recorded empty
change-size data. The fix sources additions/deletions from GitLab GraphQL
`diffStatsSummary`, keeps the REST `/commits` call for `commitsCount` (consumed by the
dashboard), and stops swallowing failures: the gateway now throws so the centralized
`fetchDiffStatsSafely` wrapper logs a warning instead of silently returning null.

Minimal 2-file fix (1 production + 1 unit test) plus the SDD acceptance test. No new
modules, entities, use cases, presenters, or wiring. The gateway constructor signature
is unchanged, so the 5 instantiation sites need no edit.

## Files changed

| Path | Change |
|------|--------|
| `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` | MODIFIED — additions/deletions source REST → GraphQL `diffStatsSummary`; removed swallowing `try/catch`; failures now throw. REST `/commits` call kept for `commitsCount`. |
| `src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts` | REWRITTEN — stub executor branches on `graphql` vs `/commits`; asserts GraphQL command shape, mapping, and THROW on every failure path. |
| `src/tests/acceptance/206-fix-gitlab-diff-stats-source.acceptance.test.ts` | CREATED — drives the real gateway through `fetchDiffStatsSafely` + pino silent logger; covers with-changes (no warn), no-summary (null + 1 warn), fetch-error (null + 1 warn). |
| `docs/feature-tracker.md` | UPDATED — spec-206 status planned → implemented. |

## Behaviour change

- additions/deletions now read from
  `glab api graphql -f query='query { project(fullPath:"group/project") { mergeRequest(iid:"N") { diffStatsSummary { additions deletions fileCount } } } }'`.
  `fullPath` uses the raw `group/project` path (GraphQL takes the raw path — no `%2F`).
- `commitsCount` still comes from the REST `/commits` call (`%2F`-encoded project path) — `DiffStats` shape unchanged, dashboard `mrSheet.js:123` keeps working.
- `fileCount` is requested in the query but NOT mapped into `DiffStats` (rendering files-changed is out of scope; `DiffStats` type stays stable).
- A missing `project`, `mergeRequest`, or `diffStatsSummary`, non-numeric additions/deletions, an executor error, or malformed JSON now THROWS. The throw propagates to the existing consumers, all of which already convert throw → warn + null:
  - `claudeInvoker.ts` via `fetchDiffStatsSafely`
  - `gitlab.controller.ts:782` and `:1210` via local `try/catch`
  - `mrTrackingAdvanced.routes.ts:336` and `backfillDiffStats.usecase.ts:51` via local `try/catch`

## TDD cycle

1. Phase 0 — acceptance test written first → RED (3/3 failing).
2. RED — unit test rewritten for GraphQL behaviour → 11/11 failing.
3. GREEN — gateway reimplemented → unit 11/11 passing.
4. Outer loop GREEN — acceptance 3/3 passing.
5. REFACTOR — extracted `readField` (`Reflect.get`, no `as`) to drop the verbose `in`-narrowing chain and clear the `max-lines-per-function` warning; tests stayed green.

## Test results

| Suite | Count | Result |
|-------|-------|--------|
| GitLab gateway unit | 11 | PASS |
| SPEC-206 acceptance | 3 | PASS |
| Full suite (`yarn test:ci`) | 3860 (464 files) | PASS |
| `yarn typecheck` | — | PASS |
| `yarn lint` | — | exit 0 (no errors; pre-existing tracked warnings only; zero warnings on the gateway impl) |

## Self-review

| Criteria | Status |
|----------|--------|
| Naming — full words, camelCase, domain suffix | OK |
| Imports — `@/` alias + `.js`, no relative, no barrel | OK |
| TypeScript — no `any`, no `as`, no `!` | OK (`unknown` + narrowing + `Reflect.get`) |
| Architecture — dependency rule, gateway implements entity contract | OK |
| Domain — throw over silent null; `null` only via the wrapper | OK |
| Clean code — zero comments, reads as prose | OK |

Review-fix iterations: 1 (REFACTOR pass to clear the function-length warning).
Violations found: 1 (function-length warning on the parser). Fixed: 1.

## Deviations from plan

- The plan's gateway method signature is `fetchDiffStats(...): DiffStats | null`. The
  implementation narrows the return type to `DiffStats` (it now always returns stats or
  throws — it never returns `null` itself). This is a valid covariant implementation of
  the unchanged `DiffStatsFetchGateway` contract (which keeps `DiffStats | null`) and more
  honestly expresses the new "throw, don't swallow" behaviour. No consumer is affected —
  they already handle both the throw and a possible null from the interface type.
- The plan put the unit test at `.../units/modules/statistics-insights/...`; the existing
  test (and the file rewritten) actually lives at
  `src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts`.
  Rewrote in place rather than relocating (out of scope).

## Spec coverage

- OK — GitLab change-size from diff summary → GraphQL `diffStatsSummary` (unit + acceptance "gitlab with changes").
- OK — MR with diff summary yields real additions/deletions → unit "should read additions/deletions…" (629/3), acceptance "gitlab with changes".
- OK — no usable diff summary → throw → warn + null, never silent → unit throw cases + acceptance "gitlab no diff summary" / "gitlab fetch error" (warn called once).
- OK — GitHub unchanged → GitHub gateway untouched; its unit test stays green in the full suite.
- N/A — historical backfill (spec-207), dashboard rendering, webhook payload → explicitly out of scope.

## Status

OK Clean — all tests green, typecheck + lint pass, acceptance GREEN.
