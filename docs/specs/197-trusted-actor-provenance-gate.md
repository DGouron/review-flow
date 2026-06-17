---
title: "SPEC-197: Trusted-actor trigger provenance gate"
status: implemented
labels: [gitlab, webhook, provenance, trigger-gate]
visibility: PRIVATE-UNTIL-P0-SHIPPED
depends_on: [SPEC-201]
sibling_specs: [SPEC-196, SPEC-198, SPEC-199, SPEC-174]
---

# SPEC-197: Trusted-actor trigger provenance gate

## Status: implemented

## Implementation

Shipped on `master` (landed 2026-06-10 with the provenance cluster); SDD outer-loop acceptance test added 2026-06-17 to close the loop. The gate keys on `event.user.username` (per the amendment below), resolving Users API → numeric id → Members API through the authenticated service token, cached per-username and fail-closed. Non-trusted actors never auto-run: the job parks at the existing `gateClaudeInvocation` chokepoint (SPEC-174 `triggerMode`).

| AC | Artifact | Test |
|----|----------|------|
| AC1 — reviewer-added gate | `interface-adapters/controllers/webhook/gitlab.controller.ts` (`resolveActorTrust` → `gateClaudeInvocation` with `actorTrusted`) | `units/.../gitlab.controller.test.ts` (`AC1 - reviewer-added gate`: Reporter parks / Developer enqueues) |
| AC2 — followup / MR-update gate | `interface-adapters/controllers/webhook/gitlab.controller.ts` (followup branch) | `units/.../gitlab.controller.test.ts` (`AC2 - followup / MR-update gate`: two payloads differing only by username) |
| AC3 — note / comment gate | `interface-adapters/controllers/webhook/gitlab.controller.ts` (`handleGitLabNoteHook`, parks 202 `untrusted-actor`) | `units/.../gitlab.controller.test.ts` (`parks a note trigger from a non-trusted actor` + `lets a note trigger from a Developer actor proceed`) |
| AC4 — fail-closed membership resolution | `interface-adapters/gateways/memberAccess.gitlab.cli.gateway.ts` (throw/ambiguous/unknown → `null`); `usecases/isTrustedActor.usecase.ts` (try/catch → false) | `units/.../memberAccess.gitlab.cli.gateway.test.ts`; `units/.../isTrustedActor.usecase.test.ts`; `units/.../gitlab.controller.test.ts` (`AC4 - fail-closed membership resolution`: reviewer + followup + note park on throw) |
| AC5 — cache does not widen trust | `interface-adapters/gateways/memberAccess.gitlab.cli.gateway.ts` (cache key `${projectPath} ${username}`) | `units/.../memberAccess.gitlab.cli.gateway.test.ts` (`does not apply a cached result for one username to another`) |
| AC6 — token-boundary ordering | `interface-adapters/controllers/webhook/gitlab.controller.ts` (`verifyGitLabSignature` is the first statement, returns 401 before any gate) | `units/.../gitlab.controller.test.ts` (`never queries the membership gateway when the token is invalid`) |

Supporting: `entities/memberAccess/memberAccess.ts` (access-level scale + `isDeveloperOrAbove`), `entities/memberAccess/memberAccess.gateway.ts` (contract), `usecases/isTrustedActor.usecase.ts`, `usecases/gateClaudeInvocation.usecase.ts` (`actorTrusted` park branch), `tests/stubs/memberAccess.stub.ts`. DI wiring: `src/main/routes.ts`. Outer-loop acceptance: `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` (six ACs through the controller chokepoint, observable job state only).

## Context

ReviewFlow auto-runs a Claude review when an inbound GitLab webhook is classified
as a trigger (reviewer-added, MR update / followup, or an incoming note/comment).
The originally shipped behaviour ran the review off the payload alone, without ever
asking *who* triggered it. Any actor who can reach the webhook endpoint with a
well-formed payload (and the shared token) can make ReviewFlow burn an
admin-token review run against an arbitrary MR.

This spec borns the **probability** of an illegitimate auto-run by gating Claude
invocation on the trigger actor (`event.user`) being a Developer+ member of the
target project. Non-trusted actors do not auto-run: the job is parked at the
existing `gateClaudeInvocation` pending chokepoint (SPEC-174 `triggerMode`).

This spec does **not** born the *impact* of a trusted run (what verbs a confirmed
diff may execute) — that is owned by sibling specs 196 / 198 / 199. See
Threat-check notes.

### Trust assumption (hard dependency — write it down)

`event.user.id` arrives in the webhook body and is **not signed** by GitLab.com
SaaS. There is no body signature (GitLab signs nothing), and SaaS gives no usable
source-IP allowlist. The **only** thing standing between an attacker and a forged
`event.user.id = <some Developer>` is the secrecy of `gitlabWebhookToken`
(`verifier.ts:14-37`, static `X-Gitlab-Token` compared with `timingSafeEqual`).

Therefore:

> **If `gitlabWebhookToken` leaks, SPEC-197 is inoperative.** A leaked token lets
> an attacker forge `event.user` to any Developer+ identity and pass this gate.
> The confidentiality **and rotation** of `gitlabWebhookToken` is a load-bearing
> trust assumption of this spec. Transport/token hardening lives in SPEC-201;
> 191 depends on it and does not attempt to re-validate provenance below the
> token boundary.

## Current behavior

| Concern | Location | Current state |
|---|---|---|
| Reviewer-added classification | `eventFilter.ts:122-185` `checkGitLabReviewerAdded` | Never inspects `event.user` |
| MR update / followup classification | `eventFilter.ts:191-219` `filterGitLabMrUpdate` | No actor check |
| Note / comment classification | `eventFilter.ts` `filterGitLabNoteEvent` → `gitlab.controller.ts handleGitLabNoteHook` | No actor check (NEW in scope) |
| Token verification | `verifier.ts:14-37` | Static `X-Gitlab-Token`, `timingSafeEqual`, fail-closed |
| GitHub HMAC (for contrast) | `verifier.ts:43-77` | GitLab body is **not** signed |
| Event de-duplication | `verifier.ts:82-85` | `X-Gitlab-Event-UUID` never deduplicated |
| Job construction | `gitlab.controller.ts:716-766` | `ReviewJob` built 100% from payload |
| Invocation chokepoint | `routes.ts` `gateClaudeInvocation` + `triggerMode` (SPEC-174) | Pending park exists; not actor-aware |
| Membership lookup | (this spec) | Membership API, cached, fail-closed |

## Acceptance criteria

> **Codebase note (amendment):** the parsed GitLab webhook event guards expose
> `event.user.username` (`gitlabMergeRequestEvent.guard.ts`, `gitlabNoteEvent.guard.ts`),
> **not** `event.user.id`. Membership resolution therefore keys on `event.user.username`.
> Where the GitLab Members API requires a numeric user id, resolve it first via the
> Users API (`/users?username=<username>`) and then query membership
> (`/projects/:id/members/all/:user_id`); both calls go through the authenticated
> service token. The cache and all ACs below key on `username`.

> Membership resolution: `event.user.username` is resolved against the target
> project's membership via the GitLab membership API (Users API → user id → Members
> API), cached with TTL, **fail-closed** (lookup error / timeout / ambiguous / unknown
> username → treated as non-trusted → park, never auto-run). `Developer+` = access
> level ≥ Developer.

**AC1 — Reviewer-added gate.**
When `checkGitLabReviewerAdded` classifies a trigger and `event.user` resolves to
Developer+, the job proceeds to invocation. Otherwise it is parked pending at
`gateClaudeInvocation`.
*Test (deterministic):* stub membership gateway returning a fixed access level per
`username`; feed a reviewer-added payload with a Reporter `event.user.username`; assert the
job lands in the pending queue and `defaultGitLabExecutor` was never constructed.
Assertion is on observable job state, never on model output.

**AC2 — Followup / MR-update gate.**
Same gate applies to `filterGitLabMrUpdate`. A non-trusted actor's followup update
parks; a Developer+ actor's update proceeds.
*Test:* two MR-update payloads differing only by `event.user.username`; assert trusted →
invocation path reached, non-trusted → pending. State-based.

**AC3 — Note / comment gate (amendment).**
`filterGitLabNoteEvent` / `handleGitLabNoteHook` now applies the identical actor
gate before any auto-run. An incoming note from a non-trusted actor parks pending;
a Developer+ note proceeds.
*Test:* feed a note-event payload with a non-member `event.user.username`; assert the job
is parked and no executor is wired (`gitlab.controller.ts:938-978` not reached).
Then flip `event.user.username` to a Developer member and assert invocation path reached.
Deterministic on job state — does not assert on whether Claude would have obeyed any
comment body.

**AC4 — Fail-closed membership resolution.**
When the membership lookup errors, times out, or returns an indeterminate result,
the actor is treated as non-trusted and the job parks.
*Test:* membership stub set to throw / return undefined; assert park for every
trigger type (reviewer-add, followup, note). No path reaches invocation.

**AC5 — Cache does not widen trust.**
A cached Developer+ result for actor A must never be applied to actor B.
*Test:* prime the cache with `username=A → Developer`; query `username=B` (not primed);
assert B resolves fail-closed (park), proving cache keying is per-username.

**AC6 — Token-boundary assumption is enforced, not assumed away.**
The gate runs strictly *after* `verifier.ts` token validation has passed. A request
failing token validation never reaches the actor gate (it is already rejected).
*Test:* send a trigger payload with an invalid `X-Gitlab-Token`; assert rejection at
the verifier layer, membership gateway never called. This makes explicit that 191
sits *behind* the token boundary and inherits its trust from SPEC-201.

## Out of scope

- **Signing / authenticating `event.user.id`.** GitLab.com SaaS does not sign the
  body; closing forgery is transport/token hardening — owned by **SPEC-201**.
- **`X-Gitlab-Event-UUID` de-duplication / replay** (`verifier.ts:82-85`) — owned by
  **SPEC-200**, not this gate.
- **Impact bornage of a *trusted* run**: target validation of write verbs
  (`THREAD_RESOLVE`, `THREAD_REPLY`, `revoke`), scoping `FETCH_THREADS` to trusted,
  scanning `THREAD_REPLY` content — owned by **SPEC-198 / SPEC-199**.
- **Scoping the ambient executor token** (`routes.ts:58 defaultGitLabExecutor`,
  admin) down to read + `postComment`, and removing `revoke`/`resolve` from the
  auto path — owned by **SPEC-196 / SPEC-174**.

## Test strategy

Detroit style: real stubs, no `vi.fn`. A stub membership gateway returns a fixed
access level keyed by `username`, with a `setShouldFail(true)` switch for AC4. All
assertions observe **job state** (parked-pending vs invocation-path-reached) and
**gateway call records** — never the LLM's compliance with any payload content.
Each trigger type (reviewer-add / followup / note) gets its own payload fixture so a
failure names the exact entry point.

## Implementation order

1. Membership gateway port + cached, fail-closed adapter (TTL, per-`username` key).
2. Shared `isTrustedActor(event, projectPath)` resolver consuming the gateway.
3. Wire the resolver into `checkGitLabReviewerAdded` (AC1), `filterGitLabMrUpdate`
   (AC2), and `filterGitLabNoteEvent` / `handleGitLabNoteHook` (AC3).
4. Route non-trusted outcomes through the existing `gateClaudeInvocation` pending
   park (SPEC-174 `triggerMode`); never construct `defaultGitLabExecutor` for them.
5. AC4/AC5/AC6 tests harden fail-closed, cache keying, and the token-boundary
   ordering.

## Threat-check notes

- **Trou #2 (CRITICAL — `event.user.id` spoofing): this spec closes its share.**
  191 makes provenance a *required* condition for auto-run across all three trigger
  entry points (reviewer-add, followup, note). What 191 **cannot** close is forgery
  *below the token boundary*: in GitLab.com SaaS there is no body signature and no
  usable IP allowlist, so a leaked `gitlabWebhookToken` defeats the gate entirely.
  That residual is **explicitly accepted** here as the load-bearing trust assumption
  (see Context → Trust assumption) and the *closing* of it is delegated to
  **SPEC-201** (token confidentiality + rotation). 191 is inoperative if 195 fails.

- **Trou #1 (CRITICAL — `trusted` is an under-borned blank cheque): NOT closed here,
  delegated.** 191 only borns the *probability* that a run starts; it does not born
  what a trusted (or token-forged-trusted) actor can then do via write verbs. A
  Developer+ unlocking `THREAD_RESOLVE` / `THREAD_REPLY` / `revoke` against arbitrary
  targets — including `THREAD_REPLY` unscanned by 193 — is **owned by SPEC-198**
  (validate the target of write verbs, restrict `FETCH_THREADS` to trusted) and
  **SPEC-199** (scan `THREAD_REPLY`). This spec deliberately does not add a
  probabilistic impact layer (YAGNI); impact bornage is deterministic target/verb
  scoping in the sibling specs.

- **Trou #3 (HIGH — human chokepoint confirms a hostile diff with a possibly-Developer
  token): NOT closed here, delegated.** The non-sanitizable worktree diff
  (`gitlab.controller.ts:849-1031`) confirmed at the SPEC-174 chokepoint with the
  ambient admin token is **owned by SPEC-196 / SPEC-174** (scope the token to
  read + `postComment`, pull `revoke`/`resolve` off the auto path, or document the
  residual). 191 only governs whether the run *starts*, not what the confirmed diff
  may execute.
