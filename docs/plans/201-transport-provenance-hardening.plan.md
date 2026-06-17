# Plan — SPEC-201: Transport and source provenance hardening

> Spec: `docs/specs/201-transport-provenance-hardening.md`
> Branch base: `a06582e` (security cluster — SPEC-196/198/200 already GREEN)
> Skill challenge: `/anti-overengineering` applied (see Scope challenge).

```
PLAN:
  scope: Transport and source provenance hardening (SPEC-201)
  is_new_module: false
```

## CRITICAL FINDING — SPEC-201 is ALREADY IMPLEMENTED on this branch

Before planning any work, I read the actual source on the worktree. **Every acceptance
criterion (AC1–AC10) is already implemented, tested, and wired.** This mirrors the prior
SPEC-200 incident (re-implemented for nothing because it was already shipped — see project
memory "Check master before implement").

This is therefore a **no-build plan**: the recommendation is to verify the existing
implementation (`yarn verify`), add the one missing artifact (the acceptance test, if the
SDD outer loop is required), and update the feature tracker — **not** to re-create the
entities/usecases/middleware, which already exist verbatim with the conventions the spec
requested.

The 6-step Implementation order in the spec maps 1:1 to files that already exist:

| Spec step | Artifact | Status (verified on disk) | Location |
|---|---|---|---|
| 1. `evaluateTransport` pure use case | `evaluateTransport` | PRESENT | `src/modules/platform-integration/usecases/transport/evaluateTransport.usecase.ts:9` |
| 2. `ClientIpResolver` port + impl + stub | port + `ForwardedForClientIpResolver` | PRESENT (port + impl); **stub absent** (tests use the real impl, Detroit-valid) | `entities/transport/clientIpResolver.gateway.ts` + `interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.ts` |
| 3. `transportGuardMiddleware` | middleware | PRESENT + wired at head of both webhook chains | `interface-adapters/controllers/webhook/transportGuard.middleware.ts` |
| 4. `trust proxy` bootstrap + cleanup | `transportTrustProxyValue()` + `Fastify({ trustProxy })` | PRESENT | `src/security/transportGuardConfig.ts:42` + `src/main/server.ts:105` |
| 5. Token rotation (AC9) | reloadable token + length-oracle removed | PRESENT | `src/security/gitlabWebhookTokenSource.ts:7` + `src/security/verifier.ts:19-48` |
| 6. Deployment runbook (AC7/AC9/AC10) | runbook | PRESENT | `docs/runbooks/webhook-transport-hardening.md` |

## Scope challenge (/anti-overengineering)

The design is already minimal and well-scoped — nothing to trim:

- `evaluateTransport` is a **pure function returning a `{kind}` discriminant** (no class, no
  base `UseCase` wrapper). Correct call: this is a stateless 3-guard decision; a class would
  be boilerplate over a 19-line function. Aligned with "3 clear lines > 1 clever abstraction".
- `TransportContext` is a plain `interface` (data shape), not a value-object class. Correct:
  no invariant to protect at construction; the guard logic lives in the use case.
- `ClientIpResolver` is a 1-method port. The spec's "stub" was satisfied by injecting the
  **real** `ForwardedForClientIpResolver` (deterministic, no I/O) in the middleware test —
  acceptable under Detroit school (no `vi.fn` on the gateway). No separate `StubClientIpResolver`
  is needed; adding one now would be dead test scaffolding.
- `cidr.ts` is a tiny pure IPv4-in-CIDR helper (no external dependency pulled in). Correct for
  a static-CIDR-only scope (dynamic GitHub `meta` allowlist is explicitly out of scope).

No over-engineering detected. No simplification recommended.

## AC → Layer mapping (all verified GREEN-capable on disk)

| AC | Concern | Layer / file | Test |
|---|---|---|---|
| **AC1** Untrusted socket → 403 | use case (guard a) | `usecases/transport/evaluateTransport.usecase.ts:10-12` | `units/modules/platform-integration/usecases/transport/evaluateTransport.usecase.test.ts:7-32` |
| **AC2** Non-HTTPS → 403 | use case (guard b) | `evaluateTransport.usecase.ts:14-16` | `evaluateTransport.usecase.test.ts:34-50` |
| **AC3** Allowlisted+https+hop → accept | use case (guard c) | `evaluateTransport.usecase.ts:18-26` | `evaluateTransport.usecase.test.ts:52-60` |
| **AC4** Off-allowlist → 403 | use case (guard c) + `cidr.ts` | `evaluateTransport.usecase.ts:18-24` + `entities/transport/cidr.ts:21` | `evaluateTransport.usecase.test.ts:62-92` |
| **AC5** Handler unreachable on reject | interface adapter | `interface-adapters/controllers/webhook/transportGuard.middleware.ts:52-58` | `units/.../interface-adapters/transport/transportGuard.middleware.test.ts:46-132` |
| **AC6** No spoofable `req.protocol`/`req.ip` guard | middleware + routes | middleware reads `socket.remoteAddress` + named headers only (`transportGuard.middleware.ts:36-47`); routes feed `request.socket.remoteAddress` (`routes.ts:516,570`) | `units/security/noSpoofableTransportGuard.test.ts:14-39` (static grep over middleware + `routes.ts`) |
| **AC7** Deployment runbook (nginx/Caddy/Traefik) | docs | `docs/runbooks/webhook-transport-hardening.md:30-78` | **doc-only**, reviewed at commit |
| **AC8** `trust proxy` = single hop, never `true` | bootstrap | `src/security/transportGuardConfig.ts:42-44` + `src/main/server.ts:105` | `units/security/transportGuardConfig.test.ts:29-36` |
| **AC9** Token rotation/revocation + constant-time | security | reloadable token `gitlabWebhookTokenSource.ts:7-10`; length-oracle removed, digest-based `timingSafeEqual` `verifier.ts:19-48` | `units/security/verifier.test.ts:25-112` (valid/invalid/missing/empty/different-length all 403 without length branch) + doc procedure `runbook:80-97` |
| **AC10** Root trust = token confidentiality | docs | `runbook:99-117` | **doc-only** (operational constraint, not code-verifiable; re-fetch pattern covered by SPEC-198 AC-10) |

**Doc-only ACs (no code test, reviewed at commit):** AC7, AC10. Partially doc-backed: AC9
(code test for constant-time + reloadable source; rotation *procedure* is the runbook).

## ENTITIES (all present)

- `TransportContext` (interface) + `TransportDecision` discriminant + `TransportRejectReason`
  — `entities/transport/transportContext.ts`. No `undefined` (uses `string | null`); status
  literal-typed `403`; no `as` assertions.
- `ClientIpResolver` port + `ClientIpResolutionInput` — `entities/transport/clientIpResolver.gateway.ts`.
- `isIpInCidr` pure helper — `entities/transport/cidr.ts`.

## USECASES (present)

- `evaluateTransport(context): TransportDecision` — pure, sequential 3-guard, no I/O —
  `usecases/transport/evaluateTransport.usecase.ts`. type: **query** (pure decision).

## GATEWAYS / PORTS (present)

- Contract: `ClientIpResolver` (`entities/transport/clientIpResolver.gateway.ts`).
- Impl: `ForwardedForClientIpResolver` — consumes `forwardedFor` **only when `socketTrusted`**
  (`clientIpResolver.forwardedFor.gateway.ts:8-11`), leftmost-hop extraction.
- Stub: **none created** — tests inject the real resolver (deterministic). Spec's "stub"
  intent satisfied without a separate file.

## CONTROLLERS / MIDDLEWARE (present + wired)

- `transportGuardMiddleware(input, config)` — Express/Fastify-agnostic shape: `GuardRequest`
  (`socket.remoteAddress` + headers), `GuardReply` (`code`/`send`), `next`, injected `resolver`.
  Builds `TransportContext` → `evaluateTransport` → `reply.code(403).send()` on reject, else
  `next()`. `interface-adapters/controllers/webhook/transportGuard.middleware.ts`.

## FRAMEWORK / BOOTSTRAP (present)

- `transportTrustProxyValue()` returns the loopback hop (`transportGuardConfig.ts:42`).
- `src/main/server.ts:105`: `Fastify({ logger: false, trustProxy: transportTrustProxyValue() })`
  — never `true`, never a subnet.

## SECURITY (verifier — already hardened)

- `verifier.ts` reads `currentGitlabWebhookToken()` **on every call** (no bootstrap capture)
  (`verifier.ts:38`), and the comparison folds both inputs into fixed-length HMAC digests
  before `timingSafeEqual` (`verifier.ts:19-23,43`) — **no length-check pre-branch**, so no
  length oracle. AC9 code requirement satisfied.

## DOCS (non-code artifacts — present)

- `docs/runbooks/webhook-transport-hardening.md` — nginx/Caddy/Traefik (AC7), token
  rotation/revocation procedure + cadence (AC9), root trust assumption (AC10).

## WIRING (present)

- `routes.ts:508` `resolveTransportGuardConfig()`, `routes.ts:509` `new ForwardedForClientIpResolver()`.
- `routes.ts:511-529` GitLab webhook: middleware runs first, gates `handleGitLabWebhook`.
- `routes.ts:565-583` GitHub webhook: same gate before `handleGitHubWebhook`.
- `server.ts:105` trust proxy.

## IMPLEMENTATION_ORDER (what actually remains)

Because the build is done, the only outstanding items are verification + tracking + (optionally)
the SDD outer-loop acceptance test:

1. **Run `yarn verify`** — confirm typecheck + lint + the existing SPEC-201 unit tests are all
   GREEN on this worktree (node_modules may need symlinking first — see project memory
   "Worktree node_modules"). Justification: prove the shipped state before declaring done.
2. **(Optional, if SDD outer loop is mandated for this spec)** Write the acceptance test
   `src/tests/acceptance/transport-provenance-hardening.acceptance.test.ts` exercising the full
   chain (untrusted socket → 403; valid hop+https+allowlisted → handler reached) via the real
   middleware + real resolver + `TransportContextFactory`. It will be GREEN immediately since
   production code exists — note this departs from the strict RED-first convention precisely
   *because the feature is already implemented*.
3. **Update `docs/feature-tracker.md`** — add the SPEC-201 row (status `planned` for this
   planning artifact; the implementer/operator flips to `implemented` once `yarn verify` is GREEN).

**No new entity/usecase/gateway/middleware/verifier/runbook work is planned — it would be
redundant re-creation of existing, tested code.**

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/transport-provenance-hardening.acceptance.test.ts
  status: NOT PRESENT on disk (only missing artifact)
  note: "SDD outer loop. Normally RED-first; here it would be GREEN-on-write because AC1–AC10
         are already implemented. Create only if the outer-loop artifact is required for the
         commit; otherwise the existing unit suite already covers AC1–AC6, AC8, AC9."
```

## REFERENCE_FILES (read to ground this plan)

- `docs/specs/201-transport-provenance-hardening.md` — the spec (AC1–AC10, 6-step order, test strategy).
- `src/modules/platform-integration/usecases/transport/evaluateTransport.usecase.ts` — confirms AC1–AC4 logic.
- `src/modules/platform-integration/entities/transport/{transportContext,cidr,clientIpResolver.gateway}.ts` — entity shapes + port.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.ts` — AC5/AC6 adapter.
- `src/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.ts` — post-trust IP resolution.
- `src/security/{transportGuardConfig,gitlabWebhookTokenSource,verifier}.ts` — AC8 + AC9.
- `src/main/routes.ts:508-583` — middleware wiring at head of both webhook chains.
- `src/main/server.ts:101-112` — `trustProxy` bootstrap (AC8).
- `docs/runbooks/webhook-transport-hardening.md` — AC7/AC9/AC10 docs.
- Test suite: `src/tests/units/modules/platform-integration/{usecases,interface-adapters}/transport/*`,
  `src/tests/units/security/{transportGuardConfig,noSpoofableTransportGuard,verifier}.test.ts`,
  `src/tests/factories/transportContext.factory.ts`.
- `docs/feature-tracker.md:55-65` — tracker format + confirms SPEC-201 row absent.
```
