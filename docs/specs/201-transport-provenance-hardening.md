---
title: "SPEC-201: Transport and source provenance hardening"
status: implemented
labels: [transport, infrastructure, ingress, deployment]
visibility: PRIVATE-UNTIL-P0-SHIPPED
related: [SPEC-197, SPEC-200]
---

# SPEC-201: Transport and source provenance hardening

## Status: implemented

## Implementation

Shipped on `master` (landed 2026-06-10); SDD outer-loop acceptance test added 2026-06-17 to close the loop. All artifacts live under `src/modules/platform-integration/`; the spec's original flat line references (`routes.ts:388-444`, `verifier.ts:14-37`) predate the module restructure.

| AC | Artifact | Test |
|----|----------|------|
| AC1–AC4 | `usecases/transport/evaluateTransport.usecase.ts` (3 sequential guards: socket trust → https → CIDR allowlist) | `units/.../evaluateTransport.usecase.test.ts` |
| AC5 | `interface-adapters/controllers/webhook/transportGuard.middleware.ts` (Express → `evaluateTransport` → status / `next`) | `units/.../transportGuard.middleware.test.ts` |
| AC6 | middleware reads `socket.remoteAddress` + named headers only; no `req.protocol` / `req.ip` guard | `units/security/noSpoofableTransportGuard.test.ts` |
| AC8 | `src/security/transportGuardConfig.ts` (`trust proxy` = loopback hop, never `true`) wired in `src/main/server.ts` | `units/security/transportGuardConfig.test.ts` |
| AC9 | `src/security/gitlabWebhookTokenSource.ts` (reloadable token) + `src/security/verifier.ts` (length-oracle removed, constant-time `timingSafeEqual`) | `units/security/verifier.test.ts` |
| AC7 / AC10 | `docs/runbooks/webhook-transport-hardening.md` (nginx / Caddy / Traefik runbook + token rotation/revocation + root-trust statement) | documentation-only |

Supporting: `entities/transport/transportContext.ts`, `entities/transport/cidr.ts`, `entities/transport/clientIpResolver.gateway.ts` + `interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.ts`, `tests/factories/transportContext.factory.ts`. Outer-loop acceptance: `src/tests/acceptance/201-transport-provenance-hardening.acceptance.test.ts`.

## Context

The webhook ingress currently accepts requests on any transport and from any network origin, relying solely on a static GitLab token for trust. This spec hardens the **transport layer** so that the only path to the webhook handler is: TLS terminated by a reverse proxy on loopback, forwarded over a single trusted hop, from an allowlisted platform IP range. The guiding principle is to **bound impact deterministically, not bet on probability**: we make the set of network paths that can reach the handler small and verifiable, instead of trusting spoofable request attributes. Transport hardening is a **necessary but not sufficient** condition for trust — actor authenticity (SPEC-197), replay protection (SPEC-200), and the confused-deputy trigger are out of scope and handled by sibling specs. The IP allowlist in particular is a secondary defense (see Threat-check notes), never a proof of origin.

This spec also pins down the **root trust assumption** of the whole webhook surface (AC10) and the **token rotation/revocation** procedure (AC9) that SPEC-197 depends on — because GitLab does not sign the webhook body, token confidentiality is the single load-bearing secret for provenance.

## Current behavior

| Concern | Location | Behavior |
|---|---|---|
| Webhook route mount | `routes.ts:388-444` | Endpoint mounted with no transport guard; no HTTPS enforcement, no IP allowlist in-app |
| Protocol trust | `routes.ts:388-444` | Any naive `req.protocol` check here is spoofable when no proxy fronts the app |
| Token verification | `verifier.ts:14-37` | `verifyGitLabSignature` — static token via `X-Gitlab-Token`, `timingSafeEqual` (already timing-safe) |
| Token rotation | (none) | No documented rotation/revocation procedure; token effectively static for the deployment lifetime |
| GitLab executor | `routes.ts:58` | `defaultGitLabExecutor` runs the CLI with the ambient env token — out of scope here (SPEC-196) |
| Handler entry | `gitlab.controller.ts:164` | `handleGitLabWebhook` is reachable directly; no upstream transport gate |

## Acceptance criteria

1. **AC1 — Untrusted socket rejected.** When the direct socket address (`req.socket.remoteAddress`, never a header-derived value) is not the configured trusted hop, the request is rejected with `403` and `X-Forwarded-Proto` / `X-Forwarded-For` are ignored.
   *Deterministic test:* `evaluateTransport` with a non-hop `directSocketAddress` returns `{kind:'reject', status:403}` regardless of header values. Pure function, assert discriminant + status.

2. **AC2 — Non-HTTPS rejected.** When the socket passed AC1 but the resolved protocol (from the trusted hop's `X-Forwarded-Proto`) is not `https`, reject with `403`.
   *Deterministic test:* hop-trusted context with `forwardedProto:'http'` returns `{kind:'reject', status:403}`.

3. **AC3 — Allowlisted, HTTPS, hop-trusted accepted.** When socket ∈ trusted hop, protocol = https, and resolved client IP ∈ platform allowlist, return `{kind:'accept'}`.
   *Deterministic test:* fully valid `TransportContext` returns `{kind:'accept'}`.

4. **AC4 — Off-allowlist rejected.** When socket and protocol pass but the resolved client IP is outside every configured CIDR range, reject with `403`.
   *Deterministic test:* context with resolved IP outside ranges returns `{kind:'reject', status:403}`.

5. **AC5 — Handler unreachable on reject.** The webhook handler (`gitlab.controller.ts:164`) is reached **only** when the middleware calls `next()`. On any reject, `next` is never called.
   *Deterministic test:* middleware over `FakeRequest`/`FakeResponse` — on accept `nextCalled === true`; on reject `nextCalled === false` and `res.statusCode === 403`.

6. **AC6 — No spoofable protocol guard.** No `req.protocol` (nor `req.ip`, which Express derives from headers under `trust proxy`) is used as a trust decision anywhere in the ingress path. The transport middleware is the single authority; its decision reads only the raw socket address and explicit headers.
   *Deterministic test:* static assertion / grep-equivalent over `routes.ts:388-444` and the middleware — no `req.protocol` / `req.ip` used as a guard. Decision inputs are `req.socket.remoteAddress` + named headers only.

7. **AC7 — Deployment runbook shipped.** The spec ships a versioned runbook for nginx, Caddy, and Traefik: TLS terminated at the proxy, app bound to loopback only, single forwarded hop, `X-Forwarded-Proto` set by the proxy (never passed through from the client).
   *Deterministic test:* none (documentation artifact); reviewed as part of the commit.

8. **AC8 — `trust proxy` scoped to the single hop.** App bootstrap sets `app.set('trust proxy', <loopbackHop>)`, never `true`, never a broad subnet. The value is the loopback hop only, and the accept/reject decision does **not** depend on Express's derived `req.ip`.
   *Deterministic test:* static assertion on the value passed to `app.set('trust proxy', …)` — equals the configured hop, never `true` / arbitrary IP.

### Provenance / trust-root criteria (re-pentest contract)

9. **AC9 — Webhook token rotation + revocation procedure.** `gitlabWebhookToken` MUST be rotatable **without redeploy**, and a documented revocation procedure MUST exist (rotate → update GitLab webhook secret → invalidate old). Token comparison MUST remain constant-time (`timingSafeEqual`, `verifier.ts:14-37`). The spec defines the rotation cadence and the operator runbook for a compromise.
   *Deterministic test:* the token source is read from configuration that can be reloaded without restarting the process (assert the verifier reads the current configured value, not a value captured at bootstrap); the length-check-before-`timingSafeEqual` length oracle in `verifyGitLabSignature` is removed so comparison is uniformly constant-time. Runbook reviewed as part of the commit.

10. **AC10 — Root trust assumption stated explicitly.** GitLab provides no webhook body-signing; therefore **token confidentiality is the root trust assumption** and MUST be stated as such in the spec. Identity fields in the payload (`event.user.id`) are trusted **only** transitively via token possession. Any field requiring stronger assurance MUST be re-fetched from an authenticated GitLab API call (the `threadFetchGateway.fetchThreads` trusted-source pattern, cf. SPEC-196 AC9 / SPEC-198 AC-10), never read from the webhook body.
   *Deterministic test:* none for the assumption itself (operational constraint, not code-verifiable); it is documented in this spec and cross-referenced by SPEC-197 (which is inoperative if the token leaks). Where a field is re-fetched from the authenticated API instead of trusting the body, that re-fetch is covered by the owning spec's tests (SPEC-198 AC-10).

> **Replay / idempotency** (`X-Gitlab-Event-UUID` de-duplication, `verifier.ts:82-85`) is owned by **SPEC-200**, not restated here. Transport hardening does not stop a perfect replay; SPEC-200 does.

## Out of scope

- **Actor / confused-deputy trigger.** `checkGitLabReviewerAdded` (`eventFilter.ts:169-185`) never checks `event.user`; `filterGitLabMrUpdate` (`191-219`) has no actor control. Membership check (`projects/:id/members/all/:user_id`, Developer+) is **SPEC-197**.
- **Replay protection.** `X-Gitlab-Event-UUID` dedup/idempotency is **SPEC-200**.
- **Blast radius of the executor.** `defaultGitLabExecutor` ambient admin token (`routes.ts:58`) → **SPEC-196**.
- **LLM output → actions.** Diff content (`buildGitLabReviewProcessor`) and `threadActionsParser` execution are unaffected by this spec; transport bounds *who reaches* the handler, not *what the content does* (SPEC-198 / SPEC-199).
- **GitHub `meta` API dynamic allowlist.** Best-effort; static CIDR config only here.

## Test strategy

Detroit school, Vitest, real stubs (no `vi.fn` on gateways). All boundaries are deterministic and LLM-free — no test depends on model output or worktree diff content.

- **`evaluateTransport` (pure use case)** — the three sequential guards (socket trust → protocol → IP allowlist) as a pure function. Build `TransportContext` exclusively via `TransportContextFactory` (no naked literals). Assert on the `{kind, status}` discriminant. Covers AC1–AC4.
- **`ClientIpResolver` + `StubClientIpResolver`** — `setResolved(ip)` returns a fixed IP; verifies the resolver consumes `forwardedFor` **only after** the socket is trusted, never to decide trust itself. Real stub, no socket.
- **`transportGuardMiddleware` (Interface Adapter)** — `FakeRequest` (carries `socket.remoteAddress` + headers) / `FakeResponse` (captures `statusCode`) + a captured `nextCalled` flag. On accept → `next()` called and handler reachable; on reject → exact `statusCode` + `next` not called. Covers AC5.
- **`trust proxy` bootstrap** — static assertion that the value passed to `app.set('trust proxy', …)` equals the configured hop and is never `true` / arbitrary. Covers AC8.
- **No-spoofable-guard assertion** — static/grep-equivalent check that `req.protocol` / `req.ip` are absent as trust guards in `routes.ts:388-444` and the middleware. Covers AC6.
- **Token rotation** — assert the verifier reads the current configured token (reloadable without restart) and that the length-oracle pre-check is removed so `timingSafeEqual` is the sole, constant-time comparison. Covers AC9.

## Implementation order

1. **`evaluateTransport` pure use case** — the three guards (socket trust, https, IP allowlist). Core value, zero I/O. RED → GREEN → REFACTOR per guard.
2. **`ClientIpResolver` port + impl + stub** — IP resolution via the trusted hop; `forwardedFor` consumed only post-trust.
3. **`transportGuardMiddleware` Interface Adapter** — wire Express → `TransportContext` → `evaluateTransport` → status / `next`. Inserted at the **head** of the chain in `routes.ts:388-444`, before `verifyGitLabSignature` (`verifier.ts:14`).
4. **`trust proxy` bootstrap + cleanup** — `app.set('trust proxy', <loopbackHop>)`; remove every naive `req.protocol` check from `routes.ts:388-444`. Decision never reads `req.ip`.
5. **Token rotation (AC9)** — read `gitlabWebhookToken` from reloadable config; remove the length-oracle pre-check in `verifyGitLabSignature`; ship the rotation/revocation runbook.
6. **Deployment runbook** (nginx / Caddy / Traefik) in this spec — non-code, shipped with the commit (AC7).

## Threat-check notes

Residual bypasses identified during design review, and how this spec handles each:

- **IP allowlist bounds probability, not impact.** If the platform ranges are GitLab.com SaaS, they are shared across all tenants — any hostile GitLab.com project emits from the same ranges. Guard (c) is therefore a **secondary** defense and proves nothing about *which* project sent the webhook. Authenticity weight stays on the signed token (`verifier.ts`) and SPEC-196/197. The spec never presents the allowlist as proof of origin.
- **Trust decision must read the raw socket only.** Guard (a) evaluates `req.socket.remoteAddress`, never `X-Forwarded-For` / `req.ip`. Trusting a header to decide whether to trust the header is circular; the contract enforces that `forwardedFor` / `forwardedProto` are consumed only **after** the socket clears guard (a). This is why AC6 forbids `req.ip` (Express derives it from headers under `trust proxy`) as a guard.
- **Single authority.** `app.set('trust proxy', hop)` is set only so Express does not pollute `req.ip` elsewhere; the accept/reject decision lives entirely in the middleware and does not consult Express-derived values. Two sources of truth on the same decision is a divergence risk — avoided by design (AC8 + AC6).
- **Reject status is uniform `403`.** `421 Misdirected Request` was considered and rejected: it signals a TLS/SNI authority mismatch and can trigger unexpected client retries. All rejects return a sober `403`; the `reason` discriminant stays internal and is never sent to the client, avoiding a length/state oracle.
- **Root trust = token confidentiality (AC10).** GitLab does not sign the body, so token + transport are the only network-level levers. `event.user.id` is trusted only transitively via token possession; SPEC-197 is inoperative if the token leaks. Hence AC9 (rotation/revocation without redeploy) is load-bearing, not cosmetic.
- **Confused deputy is NOT closed by transport.** Once socket + IP + signature pass, the payload is still fully actor-controlled (`eventFilter.ts:169-185` never checks `event.user`). Explicitly deferred to **SPEC-197** — this spec must not create a false impression that provenance is resolved.
- **Replay survives transport.** A perfect replay (same allowlisted IP, same static token, same body) passes every transport guard; `X-Gitlab-Event-UUID` dedup is **SPEC-200**.
