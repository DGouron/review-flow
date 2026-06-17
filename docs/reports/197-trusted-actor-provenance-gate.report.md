# SPEC-197 — Trusted-actor trigger provenance gate — Close-Loop Report

> Task: CLOSE-LOOP (test-only + doc bookkeeping). The gate already shipped on `master`
> (landed 2026-06-10 with the provenance cluster) and its unit tests pass. No new
> production code was expected — and **none was written**.
> Report date: 2026-06-17.

## VERDICT

**Loop closed — GREEN.** The outer-loop acceptance test exercises all six ACs through
the controller chokepoint and passes immediately against the existing gate, which is the
intended SDD evidence that the shipped code satisfies the spec. The AC4-per-trigger and
AC6-no-call gaps are now pinned by controller unit sub-cases. `yarn verify` is fully green.
**Production code changed: none.** **Defects found: none.**

## FILES CREATED

| File | Description |
|------|-------------|
| `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` | G4 — outer-loop SDD acceptance test. Six `it` cases (AC1–AC6) across the three trigger fixtures (reviewer-added, MR-update/followup, note), single chokepoint `handleGitLabWebhook` wired with a real `IsTrustedActorUseCase(StubMemberAccessGateway)` + real full-auto `GateClaudeInvocationUseCase`. Asserts observable job state only (`enqueueReview` count, `StubPendingReviewRequestGateway.saveCount`, `mockReply.status`/`send` for 202/401, `memberAccess.calls`). Never asserts model output. |
| `docs/reports/197-trusted-actor-provenance-gate.report.md` | This report. |

## FILES MODIFIED

| File | Change |
|------|--------|
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | G1 — added 2 `it` cases inside `describe('AC4 - fail-closed membership resolution')`: followup (MR-update) park-on-throw (`saveCount===1`, no enqueue) and note park-on-throw (202 `untrusted-actor`, no `update`). G2 — added 1 `it` to `describe('request gating before payload parsing')`: invalid token with a recording `StubMemberAccessGateway` + `isTrustedActor` wired, asserts 401 **and** `memberAccess.calls.length === 0`. G3 — added 1 `it` to `describe('Note Hook handling')`: Developer note proceeds past the gate (no 202, `status: 'bypass-recorded'`). |
| `docs/specs/197-trusted-actor-provenance-gate.md` | G5 — front-matter `status: draft → implemented`; added `## Status: implemented` + `## Implementation` section (AC→artifact→test matrix, mirroring SPEC-201's style). |
| `docs/feature-tracker.md` | G5 — SPEC-197 row flipped `planned → implemented`, date `2026-06-17 → 2026-06-10`, added `[report]` link. |

## TEST COUNTS

| Suite | Tests | Result |
|-------|-------|--------|
| `197-trusted-actor-provenance-gate.acceptance.test.ts` (new) | 6 | all pass |
| `gitlab.controller.test.ts` (modified) | 47 (was 43; +4: G1×2, G2×1, G3×1) | all pass |
| **`yarn verify` full suite (`vitest --run`)** | **3717 tests / 446 files** | **all pass** |

`yarn verify` = typecheck (pass) + oxlint (only pre-existing warnings in unrelated
`src/dashboard/` & `src/frameworks/` files; **zero** in SPEC-197 files; zero errors) +
oxfmt `--check` (clean) + `vitest --run` (3717 pass).

## AC → TEST COVERAGE CONFIRMATION

| AC | Acceptance test case | Unit-test pin | Status |
|----|----------------------|---------------|--------|
| **AC1** reviewer-added gate | `AC1 — reviewer-added gate` (Reporter parks, `saveCount===1`; Developer enqueues) | `gitlab.controller.test.ts` `AC1 - reviewer-added gate` (pre-existing) | OK |
| **AC2** followup / MR-update gate | `AC2 — followup / MR-update gate` (two payloads differ only by username) | `gitlab.controller.test.ts` `AC2 - followup / MR-update gate` (pre-existing) | OK |
| **AC3** note / comment gate | `AC3 — note / comment gate` (Reporter → 202 `untrusted-actor`; Developer → `bypass-recorded`) | `gitlab.controller.test.ts` note park (pre-existing) + **new** Developer-note positive (G3) | OK |
| **AC4** fail-closed for every trigger | `AC4 — fail-closed membership resolution` (`setShouldFail(true)` parks reviewer + followup + note) | gateway/use-case fail-closed (pre-existing) + **new** controller followup + note park-on-throw (G1) | OK |
| **AC5** cache does not widen trust | `AC5 — cache does not widen trust` (primed `dev-actor`, unprimed `mallory` parks; `memberAccess.calls` keyed per-username) | `memberAccess.gitlab.cli.gateway.test.ts` AC5 (pre-existing) | OK |
| **AC6** token-boundary ordering | `AC6 — token-boundary ordering` (invalid token → 401 **and** `memberAccess.calls.length === 0`) | **new** `never queries the membership gateway when the token is invalid` (G2) | OK |

## DEFECTS FOUND

**None.** Every test written passed against the existing production code on first run
(after one fix to my own *test wiring* — see below — never a production change).

- During authoring, the AC5 acceptance case initially asserted `saveCount` on a
  `StubPendingReviewRequestGateway` that was not the one wired into the
  `GateClaudeInvocationUseCase` actually handling Mallory's trigger (I had reused a stale
  gate instance bound to a different pending gateway). The gate behaviour was correct —
  Mallory was parked (enqueue stayed at 1), and `memberAccess.calls` correctly recorded
  both usernames — but my assertion observed the wrong gateway. Fixed by sharing a single
  `pendingGateway` across both triggers and asserting its `saveCount` transitions 0 → 1.
  This was a test-harness error, **not** a production defect; no `src/` code was touched.

## PRODUCTION CODE CHANGED

**None** (as expected). All work is test files + documentation bookkeeping.

## SELF-REVIEW (Phase 3)

| Criterion | Result |
|-----------|--------|
| Naming | full words, camelCase test file with `.acceptance.test.ts` / `.test.ts` suffix |
| Imports | 100% `@/` alias + `.js`; zero relative imports (grep-verified); no barrel |
| TypeScript | no `any`; the only `as` usages are `as const` (literal narrowing) and the project-sanctioned `as unknown as FastifyRequest/FastifyReply` test-double pattern (identical to the sibling `gitlab.controller.test.ts`) |
| Architecture | dependency rule respected — acceptance imports use cases + stubs, no outward leaks |
| Tests | Detroit style — real `StubMemberAccessGateway` (no `vi.fn` on the gateway), factories (`GitLabEventFactory`, `TrackedMrFactory`), state-based assertions only, never model output |
| Clean Code | zero superfluous comments; one JSDoc on `buildGatedDeps` explaining the chokepoint wiring |
| Domain | `null` for absence (`getById` returns `null`), no `undefined` in domain values |

Review-fix iterations: 1 (the AC5 harness fix above). No outstanding violations.

## ESCALATIONS

None. Loop closed GREEN within the constraints; no production code modified; no defect
surfaced.
