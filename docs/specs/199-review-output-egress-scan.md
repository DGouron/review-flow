---
title: "SPEC-199: Review output egress scan before posting"
status: implemented
labels: [egress, defense-in-depth, reviewflow]
visibility: PRIVATE-UNTIL-P0-SHIPPED
depends_on: [SPEC-196]
---

# SPEC-199: Review output egress scan before posting

## Status: implemented

## Implementation

The deterministic egress machinery (scanner, decorator, single fan-in executor, per-platform wiring) shipped with the SPEC-196/198 cluster (landed 2026-06-10). The SDD outer-loop acceptance test was added 2026-06-17 to close the loop, and that pass uncovered **GAP-1**: the boot-time review-recovery path (`src/main/server.ts`) called `executeActionsFromContext` without the post gateway, so the `postGateway === null` branch routed recovered LLM-derived `POST_COMMENT` / `THREAD_REPLY` bodies straight through the raw CLI primitive, **bypassing the egress scan** — the exact class of bypass AC9 forbids, on a live (non-test) path. The fix threads the production decorated gateway into the recovery closure (per-platform CLI sink chosen by `context.platform`, wrapped in `EgressScannedNoteCommentPostGateway` with the same `defaultEgressScanConfig` + `LoggerEgressTraceGateway` the four webhook/processor sites use). Pure wiring — no scanner or decorator behaviour changed.

| AC | Artifact | Test |
|----|----------|------|
| AC1 — single enforcement point on the post sink | `platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.ts` (decorator wraps `postComment`, scans before sink) | `units/.../egressScanned.noteCommentPost.gateway.test.ts` (`AC1 — single enforcement point`) |
| AC2 — secret-shape scan allow/redact/block | `platform-integration/entities/egressScan/egressScan.scanner.ts` (`SECRET_SHAPE_PATTERN` + mode branch) | `units/.../egressScan.scanner.test.ts` (`secret-shape scan (AC2)`); acceptance `AC2 / AC5 — block and fail-closed end-to-end` |
| AC3 — deterministic length cap | `platform-integration/entities/egressScan/egressScan.scanner.ts` (truncate-with-marker / block) | `units/.../egressScan.scanner.test.ts` (`length cap (AC3)`) |
| AC4 — out-of-scope reference scan | `platform-integration/entities/egressScan/egressScan.scanner.ts` (`PROJECT_REFERENCE_PATTERN` + `isOutOfScope`) | `units/.../egressScan.scanner.test.ts` (`out-of-scope reference scan (AC4)`) |
| AC5 — fail-closed on scanner error | `platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.ts` (scanner first; throw propagates before the sink) | `units/.../egressScanned.noteCommentPost.gateway.test.ts` (`AC5 — fail-closed on scanner error`); acceptance `fails closed when the scanner throws` |
| AC6 — trace without secret | `platform-integration/entities/egressScan/egressScan.scanner.ts` (trace = channel + mode + counts); `loggerEgressTrace.gateway.ts` | `units/.../egressScan.scanner.test.ts` (`trace metadata carries no secret (AC6)`); `units/.../egressScanned.noteCommentPost.gateway.test.ts` (`AC6 — trace without secret`) |
| AC7 — `THREAD_REPLY` egress is scanned | `review-execution/services/publicOutputExecutor.ts` + `threadActionsExecutor.ts` + `contextActionsExecutor.ts` (route public output through the injected decorated gateway) | `units/.../threadActionsExecutor.egress.test.ts`; `units/.../contextActionsExecutor.egress.test.ts`; acceptance `AC9 — every auto-path public-output verb is scanned` (table-driven over `{POST_COMMENT, THREAD_REPLY}`) |
| AC8 — revoke accompanying-comment (out-of-scope-by-design for auto path) | `platform-integration/services/autoExecutorActionFilter.ts` (auto path admits only `readMr`+`postComment`; `revoke`/`threadResolve`/`addLabel` dropped → no auto revoke exists) | acceptance `AC8 — out-of-scope-by-design: no auto revoke whose comment could egress` (zero CLI writes for dropped verbs) |
| AC9 — channel exhaustiveness (no unscanned public-output verb) | `review-execution/services/publicOutputExecutor.ts` (single fan-in); **GAP-1 fix** `src/main/server.ts` (`buildRecoveryExecuteActions` threads the decorated gateway into the recovery closure) | acceptance `199-review-output-egress-scan.acceptance.test.ts` — table-driven over both executors **plus the recovery path** (`the boot-time recovery path is scanned (GAP-1 close-loop)`); raw-executor secret-arg counter == 0 |

DI wiring: `src/main/routes.ts:409-443` (four webhook/processor sites) and `src/main/server.ts` (`buildRecoveryExecuteActions`, GAP-1 fix). Doubles reused: `tests/stubs/egressScan.stub.ts`, `tests/stubs/noteCommentPost.stub.ts`. Outer-loop acceptance: `src/tests/acceptance/199-review-output-egress-scan.acceptance.test.ts` (8 scenarios, observable post-gateway/executor state only). Report: `docs/reports/199-review-output-egress-scan.report.md`.

## Context

ReviewFlow posts LLM-generated text to public GitLab surfaces (MR comments, discussion thread replies, and accompanying comments on quality-gate actions). The LLM output is non-deterministic and can be steered by a hostile diff or by injected instructions in the review context. Even with upstream authorization and provenance gates, the *content* that reaches a public surface must be bounded deterministically.

This spec installs a deterministic decorator between any LLM-derived text and the public post operation. It is a defense-in-depth layer: it does not decide *who* may post or *whether* an action is authorized (those belong to sibling specs 197/198), it bounds *what leaves the system* on every public output channel — secret-shape egress, output volume, and out-of-scope cross-references.

The pre-pentest version applied the scan only to `postComment`. The pentest showed `THREAD_REPLY` (same public channel, different verb) and the quality-gate `revoke` accompanying comment bypass the scan entirely. This amendment moves the enforcement point to the single shared post gateway so that **every** public-output path is covered, and adds a channel-exhaustiveness guarantee.

## Current behavior

| Concern | Location | Observed behavior |
|---|---|---|
| Comment post sink | `noteCommentPostGateway.postComment({projectPath, mrNumber, body})` | Posts `body` verbatim, no content scan. |
| Thread reply verb | `threadActionsParser.ts:13-66` parses `[THREAD_REPLY]`; `executeThreadActions` + `contextActionsExecutor` execute it | Reply body is LLM-derived, posted via the public note channel, **not** scanned today. |
| Quality-gate revoke comment | `approvalRevocationGateway.revoke` + accompanying note | The explanatory comment posted alongside a revoke is LLM-derived and **not** scanned today. |
| Post comment verb | `threadActionsParser.ts` `[POST_COMMENT]` | LLM-derived body, posted via the public note channel. |
| Ambient executor | `routes.ts:58 defaultGitLabExecutor` | Posts with ambient admin token; no content boundary on egress. |

All public-output bodies converge on the note/comment posting primitive, but today only one caller (`postComment` direct) is wrapped. The other verbs reach the public surface through the same primitive without passing the scan.

## Acceptance criteria

> All criteria are enforced at a deterministic boundary **outside the LLM**. No criterion depends on the model "choosing" to comply. Tests assert observable state of the post gateway (called / not called, body transformed, error thrown), never the model's obedience.

### AC1 — Single enforcement point on the post sink
The egress scan is applied inside the post gateway decorator wrapping `noteCommentPostGateway.postComment`, not in individual callers. Any code path that posts public text MUST route through this decorated gateway.

*Test (deterministic):* construct the decorated gateway with a real stub sink; call the decorated `postComment` with a body containing a secret shape; assert the stub sink received a redacted/blocked body (per mode), never the raw secret.

### AC2 — Secret-shape scan (allow / redact / block)
The decorator scans the outgoing body for secret shapes (token/key patterns) and applies the configured mode: `allow` (pass), `redact` (replace match with a fixed marker), `block` (do not post, signal failure).

*Test (deterministic):* feed bodies with and without known secret shapes; assert: clean body passes unchanged; secret body in `redact` mode reaches the sink with the marker substituted; secret body in `block` mode never reaches the sink and raises the block signal.

### AC3 — Deterministic length cap
The decorator enforces a maximum body length. Bodies over the cap are truncated (with a fixed truncation marker) or blocked per configuration, deterministically, before reaching the sink.

*Test (deterministic):* post a body exceeding the cap; assert the sink receives a body whose length ≤ cap and ends with the truncation marker (or that the post is blocked in block mode).

### AC4 — Out-of-scope reference scan
The decorator detects references outside the current review scope (e.g., cross-project paths / IRIs that do not match the active MR's `projectPath`) and applies the configured mode.

*Test (deterministic):* post a body referencing a foreign `projectPath`; assert the reference is redacted/blocked per mode while in-scope references pass.

### AC5 — Fail-closed on scanner error
If the scanner throws or returns an indeterminate result, the decorator MUST NOT post. It fails closed and raises an error.

*Test (deterministic):* inject a scanner stub that throws; call the decorated `postComment`; assert the sink was never called and an error was raised.

### AC6 — Trace without secret
On redact/block, the decorator emits a trace record that captures the decision (mode applied, channel, match category count) **without** including the matched secret value.

*Test (deterministic):* trigger a redact on a known secret; assert the emitted trace contains the decision metadata and does **not** contain the raw secret substring.

### AC7 — `THREAD_REPLY` egress is scanned (pentest amendment)
The body produced for a `[THREAD_REPLY]` action MUST pass through the same decorated post sink before reaching the public thread. `executeThreadActions` / `contextActionsExecutor` MUST post replies via the decorated gateway, not a raw sink.

*Test (deterministic):* drive `executeThreadActions` with a parsed `[THREAD_REPLY]` whose body contains a secret shape, using a real stub sink; assert the reply that reaches the sink is redacted/blocked per mode, identically to AC2 — proving the reply verb shares the same enforcement point.

### AC8 — Revoke accompanying-comment egress (closed out-of-scope-by-design for the auto path)
Per **SPEC-196 AC6**, `revoke` is **not** part of any automated ReviewFlow path. The accompanying-comment egress guarantee therefore has **no auto-path obligation** to fulfil once SPEC-196 merges: there is no auto revoke whose comment could leave the system. The guarantee that a revoke accompanying-comment is egress-scanned MUST be (re)stated in any future explicit write-executor spec that reintroduces `revoke`; it is **not** an obligation of the auto path. This AC closes as **out-of-scope-by-design** for the auto path.

*Cross-ref: SPEC-196 AC6.* No deterministic auto-path test is required for AC8; if a future write-executor spec reintroduces `revoke`, that spec MUST carry the AC2-equivalent scan test for its accompanying comment, routed through the same decorated sink (AC1/AC9).

### AC9 — Channel exhaustiveness (no unscanned public-output verb)
No public-output verb may reach the note/comment primitive without passing the decorator. The set of public-output channels on the auto path {`postComment`, `THREAD_REPLY`, `POST_COMMENT`} all resolve to the single decorated sink.

*Test (deterministic):* for each public-output verb in the auto-path set, exercise it through its executor with a secret-shape body against a shared real stub sink; assert every verb's body was processed by the decorator (e.g., the stub sink only ever receives scanned bodies, and a guard counter on the raw sink reads zero). This is a table-driven test over the verb set so adding an unscanned verb fails the suite.

## Out of scope

- **Authorization / target validation** of write verbs (`THREAD_RESOLVE`, `THREAD_REPLY`, `POST_COMMENT`, `revoke`) and restricting `FETCH_THREADS` to trusted actors → **SPEC-198**.
- **Provenance / actor identity** (`event.user.id` forgery, webhook token confidentiality) → **SPEC-197 / SPEC-201**.
- **Diff sanitization** of the worktree (`gitlab.controller.ts:849-1031`) and scoping the ambient executor token → **SPEC-196 / SPEC-174**.
- **The `revoke` action and its accompanying comment** on any future write-executor path — re-stated there, not here (AC8).
- Deciding *whether* a revoke is allowed.
- Semantic / probabilistic content classification (toxicity, intent). This spec bounds shapes and volume deterministically only — YAGNI on any ML layer.

## Test strategy

- Detroit-style: real stub sink (`noteCommentPostGateway` stub recording received bodies), real stub scanner with deterministic match rules, no `vi.fn`.
- Assertions on observable post-gateway state only: was the sink called, with what body, was an error raised, what trace was emitted.
- A scanner stub exposing `setShouldFail(true)` drives AC5 fail-closed.
- AC7/AC9 reuse the **same** decorated gateway and stub sink as AC1–AC6 to prove the enforcement point is genuinely shared (a verb routed around the decorator makes AC9's raw-sink counter non-zero and fails).
- No test asserts model obedience; the LLM body is fixed test input.

## Implementation order

1. Extract the post sink into a single injectable `noteCommentPostGateway` interface consumed everywhere (no direct sink calls in executors).
2. Implement the deterministic scanner (secret-shape, length cap, out-of-scope reference) as a pure module with `allow/redact/block` modes.
3. Wrap the sink in the egress decorator (AC1–AC6), fail-closed and trace-without-secret.
4. Route `THREAD_REPLY` (AC7) and `POST_COMMENT` executors through the decorated gateway.
5. Add the channel-exhaustiveness table test (AC9) covering the full auto-path verb set.

## Threat-check notes

- **Closes ReviewFlow's part of trou #1 (CRITICAL — `trusted` blank cheque).** The pre-pentest scope left `THREAD_REPLY` as an unscanned public-output channel; this amendment (AC7) brings it under the same egress decorator as `postComment`, and AC9 guarantees no auto-path public-output verb escapes the scan. This bounds the *content impact* of an over-broad `trusted` state on the egress side, deterministically.
- **Does NOT close the core of trou #1.** *Who* may invoke write verbs and *which target* they may write to (target validation of `THREAD_RESOLVE`/`THREAD_REPLY`, restricting `FETCH_THREADS` to trusted) remains with **SPEC-198**. This spec scans content; it does not authorize the action.
- **Renders no judgement on trou #2 (CRITICAL — `event.user.id` forgery).** Provenance/identity is out of scope here and renvoyé to **SPEC-197 / SPEC-201**. Egress scanning is independent of who triggered the post — it bounds the body regardless of actor authenticity, so it remains effective even if provenance is forged. It does not, however, fix the forgery.
- **Partially mitigates trou #3 (HIGH — confirmed hostile diff with a Developer-scoped token).** Once a hostile diff is human-confirmed, any LLM-derived public comment it produces is still secret-shape/length/scope-bounded on egress (AC2–AC4). This caps data exfiltration via the comment channel but does NOT scope the token or remove revoke/resolve from the auto path — that is **SPEC-196 / SPEC-174** (and after SPEC-196, `revoke` is off the auto path entirely, so AC8 closes out-of-scope-by-design).
- The amendment is purely a *coverage extension* of an existing deterministic boundary (one enforcement point, more callers routed through it). No new probabilistic layer is introduced (YAGNI respected).
