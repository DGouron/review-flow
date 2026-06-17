# SPEC-197 — Trusted-actor trigger provenance gate — Implementation Audit & Plan

> Spec: `docs/specs/197-trusted-actor-provenance-gate.md` (status: `draft`)
> Branch base: `8d337bc` (includes the SPEC-201 merge)
> Audit date: 2026-06-17
> All file:line citations below were read directly, not inferred.

## VERDICT

**SUBSTANTIALLY IMPLEMENTED — close the SDD loop, do NOT rebuild the gate.**

The full vertical slice exists and its unit tests pass: entity (`memberAccess.ts`), gateway
contract + cached fail-closed CLI adapter (per-username key, TTL), `IsTrustedActorUseCase`,
the `actorTrusted` park branch in `gateClaudeInvocation.usecase.ts`, all three webhook trigger
entry points gated in `gitlab.controller.ts`, and DI wiring in `routes.ts`. AC1, AC2, AC3, AC5
are COVERED by passing unit tests. AC4 is PARTIAL (only reviewer-added park-on-throw is asserted
at the controller; followup + note fail-closed not directly asserted there — though the shared
`resolveActorTrust` helper makes them structurally identical). AC6 is PARTIAL (ordering is
structurally guaranteed but no test wires a recording membership stub + invalid token to prove
the gateway is never called).

**Two artifacts are missing and constitute the only build work:**

1. The **outer-loop SDD acceptance test** `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` — does not exist (confirmed: no `197-*` file in `src/tests/acceptance/`). This is the spec's deliverable evidence; it should exercise all six ACs through the controller chokepoint with a `StubMemberAccessGateway`.
2. **SDD bookkeeping**: spec status is still `draft`; SPEC-197 is **absent from `docs/feature-tracker.md`** entirely (rows stop at 200/201 at lines 64-65). Add the row and flip to `planned` (then `implemented` once the acceptance test is GREEN).

No new entity, use case, gateway, or controller code is required. Adding the two AC4/AC6 sub-cases
(below) is small TDD hardening within the existing test files, not new production code.

## AC COVERAGE MATRIX

| AC | Concern | Status | Artifact + test (file:line) |
|----|---------|--------|------------------------------|
| **AC1** | Reviewer-added gate (Reporter → park, Developer+ → proceed) | **COVERED** | Prod: `gitlab.controller.ts:978-1027` (gate via `resolveActorTrust` → `gateClaudeInvocation` with `actorTrusted`). Test: `gitlab.controller.test.ts:576-613` — "parks pending and never enqueues when the actor is a Reporter" (asserts `enqueueReview` not called, `pendingGateway.saveCount === 1`, and `memberAccess.calls` keyed on username) + "enqueues when the actor is a Developer". |
| **AC2** | Followup / MR-update gate | **COVERED** | Prod: `gitlab.controller.ts:837-872`. Test: `gitlab.controller.test.ts:615-669` — "parks pending and never enqueues a followup from a non-trusted actor" + "enqueues a followup from a Developer actor". Two payloads differing only by `event.user.username`. State-based. |
| **AC3** | Note / comment gate | **COVERED** | Prod: `gitlab.controller.ts:173-187` (`handleGitLabNoteHook`, parks at 202 `pending-confirmation` / `untrusted-actor`). Test: `gitlab.controller.test.ts:884-900` — "parks a note trigger from a non-trusted actor" (asserts 202, `untrusted-actor`, `mockGateway.update` not called). Positive (Developer note proceeds) sub-case is NOT asserted at controller level — see gap G3. |
| **AC4** | Fail-closed membership resolution (error/timeout/ambiguous/unknown → park) for **every** trigger type | **PARTIAL** | Gateway-level fail-closed exhaustively covered: `memberAccess.gitlab.cli.gateway.test.ts:99-145` (throw, ambiguous, unknown/empty, non-member throw, out-of-scale level → all `null`). Use-case fail-closed: `isTrustedActor.usecase.test.ts:33-45`. Controller park-on-throw covered **only for reviewer-added**: `gitlab.controller.test.ts:671-688`. **Missing**: explicit controller park-on-throw for followup and note triggers — see gap G1. |
| **AC5** | Cache does not widen trust (per-username keying) | **COVERED** | Cache impl: `memberAccess.gitlab.cli.gateway.ts:51,63-73` (key `${projectPath} ${username}`). Test: `memberAccess.gitlab.cli.gateway.test.ts:74-84` — "does not apply a cached result for one username to another (AC5)" (primes `alice → developer`, queries unprimed `mallory`, asserts `null`). |
| **AC6** | Token-boundary ordering — gate runs strictly after verifier; membership gateway never called on invalid token | **PARTIAL** | Ordering is structurally guaranteed: `verifyGitLabSignature` is the first statement of `handleGitLabWebhook` (`gitlab.controller.ts:255`) returning 401 before any gate. Existing test `gitlab.controller.test.ts:713-724` asserts 401 + `enqueueReview` not called on invalid token — **but uses `defaultDeps`, which does NOT wire `isTrustedActor`** (`createDefaultDeps` at line 177 omits it), so it does **not** prove `memberAccess.calls.length === 0`. **Missing**: a test wiring a recording `StubMemberAccessGateway` + invalid token asserting zero membership calls — see gap G2. |

### Amendment compliance (username keying)

CONFIRMED. The implementation keys on `event.user.username`, never `id`:
- Note path passes `parseResult.data.user.username` (`gitlab.controller.ts:178`); MR/followup paths pass `event.user.username` (`:841`, `:982`).
- Gateway resolves Users API → numeric id → Members API: `memberAccess.gitlab.cli.gateway.ts:83-95` (`glab api users?username=`), then `:97-109` (`glab api projects/<encoded>/members/all/<userId>`). Both via the injected authenticated executor.
- Contract documents username keying + fail-closed: `memberAccess.gateway.ts:3-13`.

### NOTE — the two files named "*Provenance.test.ts" do NOT cover SPEC-197 ACs

`gitlabProcessorProvenance.test.ts` and `githubProcessorProvenance.test.ts` pin a *different*
concern: "an unconfigured `projectPath` never reaches `fetchThreads`" (labelled `AC9`, processor
read fail-closed — sibling-spec territory, `gitlabProcessorProvenance.test.ts:65-92`). They do
**not** feed a non-trusted `event.user.username` nor assert park-pending, and must not be counted
toward AC1–AC6.

## EXISTING ARTIFACTS (verified file:line)

| Layer | File | Key lines |
|-------|------|-----------|
| Entity | `src/modules/platform-integration/entities/memberAccess/memberAccess.ts` | levels map `:8-16`; `isDeveloperOrAbove` `:30-32` |
| Entity test | `src/tests/units/modules/platform-integration/entities/memberAccess/memberAccess.test.ts` | (present) |
| Gateway contract | `src/modules/platform-integration/entities/memberAccess/memberAccess.gateway.ts` | `resolve(projectPath, username)` `:11-13` |
| Gateway impl | `src/modules/platform-integration/interface-adapters/gateways/memberAccess.gitlab.cli.gateway.ts` | cache `:51`, TTL default `:17`, `resolve` `:63-73`, Users API `:83-95`, Members API `:97-109` |
| Gateway test | `src/tests/units/modules/platform-integration/gateways/memberAccess.gitlab.cli.gateway.test.ts` | 9 cases `:53-145` (resolve, cache, AC5, TTL expiry, 5 fail-closed) — all green |
| Stub | `src/tests/stubs/memberAccess.stub.ts` | `setAccess` `:23`, `setShouldFail` `:27`, records `calls` `:19` |
| Use case | `src/modules/platform-integration/usecases/isTrustedActor.usecase.ts` | `execute` try/catch fail-closed `:18-25` |
| Use case test | `src/tests/units/modules/platform-integration/usecases/isTrustedActor.usecase.test.ts` | 4 cases `:16-45` |
| Park chokepoint | `src/modules/review-execution/usecases/gateClaudeInvocation.usecase.ts` | `actorTrusted` field `:39`; `actorParks` `:64`; full-auto gate `:66`; park branch `:81-99` |
| Park test | `src/tests/units/modules/review-execution/usecases/gateClaudeInvocation.usecase.test.ts` | "non-trusted actor parks pending even in full-auto (SPEC-197)" `:190-234` |
| Controller (gate) | `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | `resolveActorTrust` helper `:143-152`; AC3 note `:173-187`; AC2 followup `:837-872`; AC1 reviewer `:978-1027`; verifier-first `:255` |
| Controller test (SPEC-197 block) | `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | block `:557-689` (AC1/AC2/AC4) + note `:884-900` (AC3) |
| DI wiring | `src/main/routes.ts` | gateway+use case instantiation `:314-317`; injected into deps `:546` |

## GAPS TO BUILD (small TDD hardening — no new production code)

**G1 — AC4 fail-closed for followup + note triggers (controller).** Add two `it` cases inside the
existing `describe('AC4 - fail-closed membership resolution')` block (`gitlab.controller.test.ts:671`):
one MR-update payload and one note payload with `memberAccess.setShouldFail(true)`, asserting
park (no enqueue / `pendingGateway.saveCount === 1` for followup; 202 `untrusted-actor` for note).
Production code already handles this via the shared `resolveActorTrust` helper — these are pins.

**G2 — AC6 explicit "membership gateway never called on invalid token".** Add an `it` to the
`describe('request gating before payload parsing')` block (`gitlab.controller.test.ts:713`): build
deps with a recording `StubMemberAccessGateway` + `isTrustedActor`, mock `verifyGitLabSignature →
{ valid: false }`, call `handleGitLabWebhook`, assert 401 **and** `memberAccess.calls.length === 0`.
This converts the structural guarantee into a regression-proof assertion.

**G3 — AC3 positive path (optional, completeness).** Add a Developer-note `it` asserting the note
proceeds past the gate (e.g. `recordBypass.execute` reached / no 202 untrusted park). The spec's
AC3 test text calls for flipping the username to a Developer and asserting the invocation path is
reached. Low priority — gate symmetry already proven by AC1/AC2 positive cases.

**G4 — Outer-loop acceptance test (the SDD deliverable).** See ACCEPTANCE_TEST below.

**G5 — SDD bookkeeping.** Flip spec front-matter `status: draft → planned`; add a `docs/feature-tracker.md`
row after line 65 (`| Trusted-actor trigger provenance gate | [197-trusted-actor-provenance-gate](specs/197-trusted-actor-provenance-gate.md) — [plan](plans/197-trusted-actor-provenance-gate.plan.md) | planned | 2026-06-17 |`). Flip to `implemented` once G4 is GREEN.

## ACCEPTANCE_TEST (outer-loop artifact to add)

```
file: src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts
note: "SDD outer loop — written first, RED until the gate is exercised end-to-end, GREEN once all six ACs assert through the controller chokepoint."
```

### Shape (mirrors the single-chokepoint convention of 198 / 201)

The SPEC-197 chokepoint is the webhook controller `handleGitLabWebhook` + `handleGitLabNoteHook`
wired with a real `IsTrustedActorUseCase(StubMemberAccessGateway)` and a real
`GateClaudeInvocationUseCase`. Assert **observable job state** (enqueue called vs pending saved /
202 untrusted), never model output. Detroit style — real stubs, no `vi.fn` for the gateway itself.
Reuse the wiring already proven in `gitlab.controller.test.ts:557-574` (`buildGatedDeps`) as the
acceptance harness shape.

**Fixtures (one per trigger entry point, so a failure names the exact gate):**
- `GitLabEventFactory.createWithReviewerAdded('claude-bot')` with `event.user.username` overridden — reviewer-added (factory `:75`).
- `GitLabEventFactory.createMrUpdate()` with `event.user.username` overridden — followup (factory `:125`), backed by a `TrackedMrFactory` followup MR (`gitlab.controller.test.ts:616-628`).
- local `buildNoteEvent('/bypass-quality "reason"')` with `user.username` overridden — note (pattern at `gitlab.controller.test.ts:884-890`).

**Stub membership gateway:** `StubMemberAccessGateway` — `setAccess('dev-actor', MEMBER_ACCESS_LEVELS.developer)`, `setAccess('reporter-actor', MEMBER_ACCESS_LEVELS.reporter)`, `setShouldFail(true)` for AC4. Records `calls` for AC5/AC6 keying assertions.

**Cases (six ACs):**
- AC1: reviewer-added + Reporter → `enqueueReview` not called, `pendingGateway.saveCount === 1`; + Developer → enqueued.
- AC2: MR-update + Reporter → park; + Developer → enqueued (two payloads differing only by username).
- AC3: note + Reporter → 202 `{ status: 'pending-confirmation', reason: 'untrusted-actor' }`; + Developer → proceeds (no untrusted park).
- AC4: `setShouldFail(true)` → park for **all three** trigger fixtures.
- AC5: prime `dev-actor → developer`, then a second trigger from an unprimed `mallory` → park (per-username keying; gateway-level test already proves cache non-widening, acceptance re-proves at controller).
- AC6: mock `verifyGitLabSignature → { valid: false }` for a reviewer-added trigger → 401 **and** `memberAccess.calls.length === 0` (gate strictly behind the token boundary).

**Job-state assertions:** `enqueueReview` (or the deps' enqueue spy) call count, `StubPendingReviewRequestGateway.saveCount`, and `mockReply.status` / `mockReply.send` for the 202/401 outcomes — exactly the assertions already used at `gitlab.controller.test.ts:590-594, 646-648, 685-686, 895-899, 721-723`.

## REFERENCE_FILES

- `docs/specs/197-trusted-actor-provenance-gate.md` — the six ACs + the username-keying amendment.
- `src/tests/acceptance/198-constrained-action-surface.acceptance.test.ts` — single-chokepoint acceptance convention (service-level, real stub, state assertions).
- `src/tests/acceptance/201-transport-provenance-hardening.acceptance.test.ts` — sibling chokepoint convention (`next()` vs 403, no model output).
- `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts:557-689,884-900` — the existing SPEC-197 controller block to mirror/lift into the acceptance harness; `buildGatedDeps` `:558-574`.
- `src/tests/stubs/memberAccess.stub.ts` — the membership stub for all acceptance cases.
- `src/main/routes.ts:314-317,546` — production wiring (proves the gate is live, not dead code).

## IMPLEMENTATION_ORDER (close-loop only)

1. `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` — write FIRST (SDD outer loop). It will pass immediately against the existing gate (no RED on production), which is the intended evidence that the shipped code satisfies the spec.
2. G1 + G2 (+ optional G3) sub-cases in the two existing unit test files — close the AC4-per-trigger and AC6-no-call gaps. No production edits expected; if any sub-case fails, that is a real defect to fix under TDD.
3. `yarn verify` (typecheck + lint + test:ci) — confirm green.
4. G5 bookkeeping: spec `status → planned`; add the tracker row → flip to `implemented` once green.
