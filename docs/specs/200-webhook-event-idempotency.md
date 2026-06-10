---
title: "SPEC-200: Webhook event idempotency and replay protection"
status: implemented
labels: [webhook, gitlab, reliability, controller]
visibility: PRIVATE-UNTIL-P0-SHIPPED
---

# SPEC-200: Webhook event idempotency and replay protection

## Status: implemented

Inner loop delivered on master in commit `5bf5e9a` (feat: deduplicate redelivered gitlab webhook events by event uuid). Outer-loop acceptance test added on branch `worktree-spec-200-finalize` (2026-06-10): `src/tests/acceptance/200-webhook-event-idempotency.acceptance.test.ts` GREEN (4/4), covering the core spec promise — an event is acted upon at most once within the TTL window — through the real `handleGitLabWebhook` entry point with the real `InMemoryIdempotencyStore` and an injected clock. Existing unit + controller-integration tests (25) remain green.

## Implementation

### Artefacts

| Layer | Artefact | Responsibility | AC |
|---|---|---|---|
| Entity (port) | `src/modules/platform-integration/entities/idempotency/idempotencyStore.gateway.ts` | `IdempotencyStore` — single-method port `recordIfAbsent(eventKey): Promise<boolean>`. TTL/clock absent from the surface. | AC2, AC3, AC8 |
| Gateway (impl) | `src/modules/platform-integration/interface-adapters/gateways/inMemoryIdempotencyStore.gateway.ts` | `InMemoryIdempotencyStore` — `Map<string, expiry>` + injected `clock` + `ttlMs`, synchronous check-and-set, lazy purge on write. | AC3, AC7, AC8 |
| Security | `getGitLabEventUuid` in `src/security/verifier.ts` | Pure header extraction of `X-Gitlab-Event-UUID`, symmetric to `getGitLabEventType`; `undefined` when absent. | AC1 |
| Controller | `handleGitLabWebhook` in `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Guard inserted immediately after `verifyGitLabSignature`, before `getGitLabEventType` and every downstream side effect. Duplicate → HTTP 200 no-op; missing UUID → degrade to gated. | AC4, AC5, AC6 |
| Composition root | `src/main/routes.ts` | Instantiates `InMemoryIdempotencyStore` with a 24h TTL and injects it as `idempotencyStore` alongside the other gateways. | AC2 |

### Decisions

- **No use case wrapper.** The controller calls the port directly; a pass-through use case would be boilerplate (per `/anti-overengineering`). The port is the seam.
- **Port surface frozen at one method.** `recordIfAbsent` only — no `has`/`record` pair (TOCTOU avoidance, AC3); TTL and clock are constructor concerns of the impl (AC8).
- **TTL = 24h** (`routes.ts`), a conservative upper bound for GitLab's redelivery window, documented inline. Configurable at the impl level via the constructor `ttlMs`. Satisfies AC7's "≥ platform max retry window".
- **Degrade-to-gated, never reject** on a missing UUID (AC6): no 4xx branch is introduced, so no existence/length oracle; the `gateClaudeInvocation` chokepoint stays the single impact boundary.
- **In-memory, single-process v1.** The port is designed so a Redis-backed impl drops in later (distributed store out of scope).

## Context

Incoming GitLab webhook deliveries carry a per-event identifier (`X-Gitlab-Event-UUID`) that is currently read nowhere, so the same event redelivered by the platform — or captured and replayed — is processed again end-to-end, including LLM invocation and platform-mutating actions. This spec adds an injectable idempotency store applied at controller entry, immediately after authentication and before any side effect, so that a given event is acted upon **at most once** within a TTL window.

Guiding principle: this control **bounds the impact of replaying a single event**, it does not bound the probability that an event is malicious. It is not an authenticity control (GitLab does not sign the body; the static token remains the only authenticity check) and it does not reduce the capability blast radius (the executor still runs with the ambient token). The real impact boundary remains the `gateClaudeInvocation` chokepoint (SPEC-174). SPEC-200 only shrinks the **replay surface**: it stops a captured or redelivered event from being re-acted upon.

## Current behavior

| Location | Behavior |
|---|---|
| `verifier.ts:14-37` `verifyGitLabSignature` | Validates static `X-Gitlab-Token` via `timingSafeEqual` (timing-safe). |
| `verifier.ts:43-77` `verifyGitHubSignature` | HMAC-SHA256 over raw body. GitLab does not sign the body (platform limit). |
| `verifier.ts:82-85` `getGitLabEventType` | Reads `X-Gitlab-Event`. `X-Gitlab-Event-UUID` is also provided by GitLab but **never read or deduplicated**. |
| `gitlab.controller.ts:164+` `handleGitLabWebhook` | `verify` → eventType → guard parse → filters → `filterGitLabEvent` → `findRepositoryByProjectPath` → `trackAssignment` → build `ReviewJob` → `gateClaudeInvocation.execute(...)` / enqueue. No event-level deduplication anywhere in this path. |
| `routes.ts:388-444` | No in-app HTTPS enforcement nor IP allowlist. |

Consequence: a redelivered or replayed event with the same `X-Gitlab-Event-UUID` runs the full pipeline again — replay is possible.

## Acceptance criteria

1. **AC1 — UUID extraction.** A pure helper `getGitLabEventUuid(headers): string | undefined` is added in `verifier.ts`, symmetric to `getGitLabEventType`, reading `X-Gitlab-Event-UUID`.
   *Deterministic test:* given headers with the UUID present → returns the exact value; absent → returns `undefined`. No I/O, pure function.

2. **AC2 — Injectable idempotency store (port).** A new gateway port `IdempotencyStore` is defined and injected through the composition root alongside existing gateways (`noteCommentPostGateway`, `approvalRevocationGateway`, `gateClaudeInvocation`). Use cases/controllers depend on the interface only.
   *Deterministic test:* controller receives the store via deps; a stub implementation is swappable without touching controller code.

3. **AC3 — Atomic check-and-record.** The port exposes a single atomic operation `recordIfAbsent(eventKey): Promise<boolean>` returning `true` when the key was newly recorded, `false` when it was already present. There is **no** separate `has`/`record` pair (TOCTOU avoidance).
   *Deterministic test:* first call for a key → `true`; immediate second call for the same key → `false`. On the in-memory impl the check-and-set is synchronous (single event-loop tick), so two interleaved awaits cannot both observe absence.

4. **AC4 — Guard placement: after auth, before any side effect.** In `handleGitLabWebhook`, the deduplication runs **immediately after a successful `verify`** and **before** `getGitLabEventType`, guard parse, `filterGitLabEvent`, `trackAssignment`, `findRepositoryByProjectPath`, `ReviewJob` construction, and `gateClaudeInvocation`. A duplicate UUID returns **HTTP 200 no-op** with zero downstream effect.
   *Deterministic test:* two requests with the same UUID → `StubGateClaudeInvocation.invocationCount === 1`; output stubs (`noteCommentPost`, `approvalRevocation`, `trackAssignment`) remain pristine on the second; second response is 200.

5. **AC5 — Distinct events are independent.** Two requests carrying different UUIDs each proceed past the guard.
   *Deterministic test:* two distinct UUIDs → `invocationCount === 2`.

6. **AC6 — Missing UUID degrades to gated, never hard-rejects.** When `verify` succeeds but `X-Gitlab-Event-UUID` is absent, the request is **not** deduplicated and is **not** rejected; it proceeds through the normal pipeline into `gateClaudeInvocation`, which under `triggerMode: pending` (SPEC-174) requires confirmation. The absence is recorded via the existing logging/telemetry path. No dedicated rejection branch is introduced (avoids a length/existence oracle and keeps the chokepoint as the single impact boundary).
   *Deterministic test:* request without UUID → reaches `gateClaudeInvocation.execute` once (status `pending` under pending mode); no dedup entry is created; no 4xx branch is exercised.

7. **AC7 — TTL re-acceptance and lower bound.** After the configured TTL elapses, the same UUID is accepted again (a legitimately re-delivered event after the window is reprocessed). The TTL is configurable and **must be ≥ the platform's maximum retry window**; it is not guessed in code.
   *Deterministic test:* with an injected clock, `recordIfAbsent(key)` → `true`; advance clock beyond TTL; `recordIfAbsent(key)` → `true` again. Within TTL → `false`.

8. **AC8 — TTL is internal to the store.** The TTL value and the clock are constructor concerns of the in-memory implementation, not part of the `IdempotencyStore` port surface. The port stays `recordIfAbsent(eventKey): Promise<boolean>`.
   *Deterministic test:* port type exposes exactly one method; swapping TTL/clock is an impl-construction concern, invisible to consumers.

## Out of scope

- **Actor / provenance verification on the trigger** (the `eventFilter.ts:169-185` confused-deputy gap where `event.user` is never checked). Separate spec — SPEC-197. SPEC-200 deduplicates events, it does not authorize the actor who emitted them.
- **Capability confinement of the executor** (`routes.ts:58` ambient admin token). SPEC-196; the impact boundary remains `gateClaudeInvocation` (SPEC-174).
- **Body authenticity for GitLab** (platform does not sign the body). Out of reach in-app; the static token stays the sole authenticity check (SPEC-201 documents this as the root trust assumption).
- **Distributed / multi-process store.** v1 is in-memory single-process. The port is designed so a Redis-backed impl is a drop-in later.
- **GitHub `X-GitHub-Delivery` deduplication.** The port is platform-agnostic and reusable for free, but wiring it into the GitHub controller path is a distinct scope.
- **HTTPS enforcement / IP allowlist** (`routes.ts:388-444`). Transport concern — SPEC-201.

## Test strategy

Detroit school, Vitest, real stubs (no `vi.fn` on gateways), assertions on observable state at deterministic boundaries only — never on LLM content.

- **In-memory `IdempotencyStore` (inside-out, pure technical domain).** Real `Map` + injected clock. Observable state: the boolean return of `recordIfAbsent` and the presence/expiry of an entry. Covers AC3 (atomic first-true/second-false), AC7 (re-acceptance after clock advance beyond TTL), AC8 (TTL/clock internal).
- **`getGitLabEventUuid` (pure extraction).** Header in → value out; absent → `undefined`. Covers AC1.
- **Controller integration (`handleGitLabWebhook` with stubbed deps).** Stubs: `StubIdempotencyStore` (real Map + controlled clock), `StubGateClaudeInvocation` (counts invocations), pristine output stubs for `noteCommentPostGateway` / `approvalRevocationGateway` / `trackAssignment`. Every assertion targets a measurable non-LLM effect: `invocationCount`, output stubs untouched, HTTP status, idempotency-store contents. Covers AC4 (200 no-op, single invocation, pristine outputs), AC5 (two UUIDs → two invocations), AC6 (no UUID → one invocation into the gated chokepoint, no dedup entry, no 4xx).

Proven boundaries: at most one invocation per UUID within TTL; zero side effects on a duplicate; two distinct UUIDs → two invocations; re-acceptance after TTL; missing-UUID degrades to gated rather than rejected.

## Implementation order

1. **In-memory `IdempotencyStore` impl** — `recordIfAbsent` with synchronous check-and-set on a `Map`, expiry via injected clock, lazy purge on write. Simplest boundary, zero controller dependency. (AC2, AC3, AC7, AC8)
2. **`getGitLabEventUuid` in `verifier.ts`** — pure header extraction, symmetric to `getGitLabEventType`. (AC1)
3. **Controller wiring in `handleGitLabWebhook`** — insert the guard right after `verify`, before `getGitLabEventType` and every downstream side effect: extract UUID → if present, `recordIfAbsent`; `false` → return 200 no-op; `true` → continue. If absent, skip dedup and continue into the existing pipeline (degrade-to-gated). (AC4, AC5, AC6)

## Threat-check notes

Residual bypasses identified and how this spec positions them:

- **Forged fresh UUID per request.** An attacker holding the static token (`verifier.ts:14-37`) can mint a new UUID on every forged delivery, fully bypassing deduplication. **Not covered, by design** — idempotency is not an authenticity control. Covered conceptually by Context; the static token and the `gateClaudeInvocation` chokepoint remain the only barriers. Token authenticity hardening is SPEC-201.
- **Confused deputy on the trigger** (`eventFilter.ts:169-185` never checks `event.user`). A *first*, non-replayed event emitted by an unauthorized actor passes untouched — dedup only stops the *second* occurrence. **Out of scope**, routed to SPEC-197.
- **Capability blast radius** (`routes.ts:58` ambient admin token). A deduplicated, authenticated event still drives the executor at admin scope. **Out of scope**, routed to SPEC-196; named here so the impact boundary is not overstated.
- **TOCTOU double-fire.** Closed by AC3: `recordIfAbsent` is a single atomic check-and-set, not a `has`+`record` pair, so two concurrent same-UUID deliveries cannot both pass the guard.
- **Missing-UUID oracle / rejection branch.** Closed by AC6: absence degrades to "non-deduplicated but still gated" rather than a hard 4xx, so no rejection branch becomes an existence/length oracle and the chokepoint stays the single funnel.
- **TTL window reopening.** Bounded by AC7: TTL must be ≥ the platform's maximum retry window; too-short a TTL would let a late legitimate redelivery be reprocessed. Configured, not guessed.
- **Memory growth (in-memory store).** Lazy purge on write is acceptable for v1 single-process; documented as a known bound, superseded by a distributed store when that scope is opened.
