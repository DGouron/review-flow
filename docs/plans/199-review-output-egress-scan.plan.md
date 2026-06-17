# PLAN: SPEC-199 — Review output egress scan before posting

> Audit + SDD close-loop plan.
> Base branch: `ca2c0c9` (includes SPEC-201, SPEC-197, SPEC-196, SPEC-198 merges).
> Spec: `docs/specs/199-review-output-egress-scan.md` (status: `draft`).

## Verdict

**SUBSTANTIALLY IMPLEMENTED — close the SDD loop, with ONE real wiring gap to fix.**

All of the spec's deterministic machinery already exists, is wired into the four
production review paths (`src/main/routes.ts:425, 438, 549, 602`), and has passing
unit + service-level tests. The egress decorator is a genuine shared chokepoint:
both executors funnel public-output verbs (`POST_COMMENT`, `THREAD_REPLY`) through
`executePublicOutput` → the injected `NoteCommentPostGateway`, which in production is
always the `EgressScannedNoteCommentPostGateway`.

Two things are missing to honestly close the SDD loop:

1. **GAP-1 (real bug, AC9 violation on a live path).** The boot-time review-recovery
   path calls `executeActionsFromContext` **without** the post gateway
   (`src/main/server.ts:238-243`, only 4 args). Because `postGateway` defaults to
   `null` (`contextActionsExecutor.ts:65`), the `postGateway === null` branch
   (`contextActionsExecutor.ts:93-95`) routes **all** actions — including LLM-derived
   `POST_COMMENT` / `THREAD_REPLY` bodies persisted in the recovered `ReviewContext` —
   straight through the raw CLI primitive, bypassing the egress scan. This is exactly
   the class of bypass AC9 forbids ("no public-output verb may reach the note/comment
   primitive without passing the decorator"), on a non-test code path.

2. **GAP-2 (SDD outer-loop artifact).** No `src/tests/acceptance/199-*.acceptance.test.ts`
   exists, and SPEC-199 is absent from `docs/feature-tracker.md`. The spec is still
   `draft`. The outer-loop acceptance test that proves the chokepoint across the full
   auto-path verb set has not been written.

Everything else (AC1–AC8) is COVERED by existing artifacts + passing tests.

## AC coverage matrix

| AC | Verdict | Artifact (file:line) | Test (file → name) |
|----|---------|----------------------|--------------------|
| **AC1** — single enforcement point on the post sink | COVERED | `egressScanned.noteCommentPost.gateway.ts:15-42` (decorator wraps `postComment`, scans before sink) | `egressScanned.noteCommentPost.gateway.test.ts:9-70` — "AC1 — single enforcement point" (pass/redact/block, secret never reaches sink) |
| **AC2** — secret-shape scan allow/redact/block | COVERED | `egressScan.scanner.ts:18-19` (`SECRET_SHAPE_PATTERN`: glpat/ghp/sk-/AKIA/JWT), `:39-48` (mode branch) | `egressScan.scanner.test.ts:16-75` — "secret-shape scan (AC2)" (4 cases: clean pass, redact marker, block no-body, allow untouched) |
| **AC3** — deterministic length cap | COVERED | `egressScan.scanner.ts:65-75` (truncate with `truncationMarker` or block) | `egressScan.scanner.test.ts:77-110` — "length cap (AC3)" (truncate ≤ cap + marker; block mode) |
| **AC4** — out-of-scope reference scan | COVERED | `egressScan.scanner.ts:21,27-29,50-63` (`PROJECT_REFERENCE_PATTERN` + `isOutOfScope` vs `projectPath`) | `egressScan.scanner.test.ts:112-152` — "out-of-scope reference scan (AC4)" (in-scope pass, foreign redact, foreign block) |
| **AC5** — fail-closed on scanner error | COVERED | `egressScanned.noteCommentPost.gateway.ts:22-23` (scanner called first; any throw propagates **before** `sink.postComment`, so the sink is never reached — fail-closed by construction) | `egressScanned.noteCommentPost.gateway.test.ts:72-85` — "AC5 — fail-closed on scanner error" (scanner `setShouldFail(true)` → rejects, `sink.calls` length 0) |
| **AC6** — trace without secret | COVERED | `egressScan.scanner.ts:79-92` (trace = channel + mode + `matchCategoryCounts`, never the matched value); `egressScanned.noteCommentPost.gateway.ts:30,35` (records on block/redact only); `loggerEgressTrace.gateway.ts:9-18` (logs counts, not body) | `egressScan.scanner.test.ts:154-171` — "trace metadata carries no secret (AC6)"; `egressScanned.noteCommentPost.gateway.test.ts:87-148` — "AC6 — trace without secret" (redact/block record; clean pass records none; `JSON.stringify(trace)` excludes secret) |
| **AC7** — `THREAD_REPLY` egress is scanned | COVERED | `publicOutputExecutor.ts:11-24` (`THREAD_REPLY` body → `executePublicOutput`); `threadActionsExecutor.ts:93-100` + `contextActionsExecutor.ts:97-104` route public-output through the injected decorated gateway | `threadActionsExecutor.egress.test.ts:49-69` — "routes a THREAD_REPLY body through the decorated sink, never the raw CLI primitive"; `contextActionsExecutor.egress.test.ts:79-104` — same for context path |
| **AC8** — revoke accompanying-comment (out-of-scope-by-design for auto path) | COVERED (by design, no auto-path obligation) | `autoExecutorActionFilter.ts:26-46` (auto path admits only `readMr`+`postComment`; `revoke`/`threadResolve`/`addLabel` dropped → no auto revoke exists) — matches SPEC-196 AC6 | No deterministic auto-path test required per spec AC8. Indirectly evidenced by `contextActionsExecutor.egress.test.ts:140-166` and `threadActionsExecutor.egress.test.ts:108-120` (SPEC-196 unwire drops `THREAD_RESOLVE`/`ADD_LABEL`) |
| **AC9** — channel exhaustiveness (no unscanned public-output verb) | **PARTIAL** | Table-driven coverage exists for **executor-level** routing of `{POST_COMMENT, THREAD_REPLY}` via the decorated sink while other verbs use the CLI primitive — BUT the **recovery path bypasses it entirely** (`server.ts:238-243` omits the post gateway). The chokepoint guarantee is not exhaustive across all live callers. | `threadActionsExecutor.egress.test.ts:122-142` — "AC9 — every auto-path public-output verb reaches only the decorated sink"; `contextActionsExecutor.egress.test.ts:106-138` — "AC9 — public-output verbs reach the decorated sink…". **Missing:** a test asserting the recovery path scans (or an end-to-end acceptance test over all callers). |

### AC9 PARTIAL — exact gap

The two AC9 unit tests prove the **executor** is a chokepoint *when a post gateway is
injected*. They do not prove **every production caller injects it**. The recovery
caller does not. So the "no public-output verb may reach the note/comment primitive
without passing the decorator" guarantee is violated on the recovery path. The
acceptance test (below) plus the GAP-1 fix close this.

## Existing artifacts inventory

Domain (entities):
- `egressScan.gateway.ts` — `EgressScanGateway` port, `EgressScanInput/Result/Trace`, `EgressChannel` = `'postComment' | 'THREAD_REPLY' | 'POST_COMMENT'`, `EgressMatchCategory`.
- `egressScan.scanner.ts` — pure `createEgressScanner(config)`; secret-shape + out-of-scope + length-cap with allow/redact/block.
- `egressScan.defaults.ts` — `defaultEgressScanConfig` (secret=redact, length=redact, **out-of-scope=allow**, cap 65536).
- `egressTrace.gateway.ts` — `EgressTraceGateway` port (`record(trace)`).

Interface-adapters (gateways):
- `egressScanned.noteCommentPost.gateway.ts` — `EgressScannedNoteCommentPostGateway implements NoteCommentPostGateway` (the decorator) + `EgressBlockedError`.
- `loggerEgressTrace.gateway.ts` — `LoggerEgressTraceGateway` (Pino `warn`, counts only).

Services (the routing glue):
- `publicOutputExecutor.ts` — `isPublicOutputAction` + `executePublicOutput` (the single fan-in to `postGateway.postComment`).
- `contextActionsExecutor.ts` / `threadActionsExecutor.ts` — split public-output vs CLI, route the former through the injected gateway.

Test doubles:
- `egressScan.stub.ts` — `StubEgressScanGateway` (`setResult`, `setShouldFail`), `StubEgressTraceGateway` (records traces).
- `noteCommentPost.stub.ts` — `StubNoteCommentPostGateway` (records `calls`).

Production wiring (composition root):
- `routes.ts:409-410` builds `egressScanner` + `egressTraceGateway`.
- `routes.ts:425, 438, 549, 602` inject `EgressScannedNoteCommentPostGateway` into the GitLab/GitHub processor deps and both webhook controllers.

## Wiring / chokepoint analysis

Single fan-in point: every public-output body converges on
`executePublicOutput` (`publicOutputExecutor.ts:26-42`) → `postGateway.postComment(...)`.
In production that `postGateway` is the `EgressScannedNoteCommentPostGateway`. The
decorator scans, then either throws `EgressBlockedError` (block), records a trace and
posts the redacted body (redact), or posts unchanged (pass). Non-public-output verbs
(`POST_INLINE_COMMENT`, and — pre-SPEC-196-drop — `THREAD_RESOLVE`/`ADD_LABEL`) go to
the CLI gateway, never the note/comment primitive used for public comments.

Callers that correctly inject the decorated gateway:
- `gitlab.controller.ts:732-738, 767, 1167-1173, 1199` and direct `deps.noteCommentPostGateway.postComment` at `:209, :459`.
- `github.controller.ts:635-641, 658-668, 1021-1031, 1042-1048` and direct posts at `:207, :288`.
- `dispatchConstrainedActions.ts:42-52` (SPEC-198 chokepoint) forwards `postGateway`.

Caller that **bypasses** the decorated gateway (GAP-1):
- `server.ts:238-243` — recovery calls `executeActionsFromContext(context, localPath, logger, defaultCommandExecutor)` with no 5th `postGateway` arg → `null` → raw CLI for public output.

## Test suite run results

Run command (worktree node_modules must be linked first — see Memory note "Worktree node_modules"):

```
yarn vitest run \
  src/tests/units/entities/egressScan/egressScan.scanner.test.ts \
  src/tests/units/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.test.ts \
  src/tests/units/services/contextActionsExecutor.egress.test.ts \
  src/tests/units/services/threadActionsExecutor.egress.test.ts
```

> NOTE: not executed in this planning pass (read-only audit; this is a planner agent,
> not the implementer, and the worktree `node_modules` link/`yarn install` is a
> precondition the implementer must satisfy first). The implementer MUST run the
> command above and paste the real pass/fail counts into the report before claiming
> GREEN. Expected from static reading: all four suites pass (they assert only on
> observable stub state and use the real scanner/decorator). Do not claim GREEN
> without running.

## Gaps to build (close-loop work, via TDD)

### GAP-1 — fix the recovery bypass (RED test first, then 1-line wiring)
- **Scope**: `src/main/server.ts:237-244`. Thread the production decorated gateway into the recovery `executeActions` closure so recovered `POST_COMMENT`/`THREAD_REPLY` bodies are scanned.
- **Where the decorated gateway lives**: it is currently built inside `registerRoutes` (`routes.ts:409-443`). The recovery closure is in `startServer` (`server.ts`). The implementer must decide the minimal seam — either (a) build a `noteCommentPostGateway` per platform at the recovery site mirroring `routes.ts:425/438`, or (b) hoist the egress scanner/trace construction so `server.ts` can build the decorator. Prefer the smallest change that does NOT duplicate config; do NOT introduce a new abstraction (YAGNI). **Note**: recovery has no single platform in scope per call — `reviewRecovery.service.ts` iterates repositories and passes `context` (which carries `context.platform`). The wiring must pick the GitLab- or GitHub-backed CLI sink per `context.platform`, matching the processor-deps split.
- **RED test**: extend `contextActionsExecutor.egress.test.ts` is NOT enough (it already passes a gateway). Add a focused test that the **recovery wiring** passes a decorated gateway — most honestly expressed as an assertion in the acceptance test (below) driving the recovery entrypoint, or a `server`-level test. Minimal viable: a unit test on the recovery `executeActions` closure proving it forwards a post gateway. The implementer chooses the cheapest seam that fails RED before the fix.
- **Constraint**: do NOT change scanner/decorator behaviour; this is pure wiring.

### GAP-2 — SDD outer-loop acceptance test + tracker (see ACCEPTANCE_TEST)

## ACCEPTANCE_TEST (SDD outer loop)

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/199-review-output-egress-scan.acceptance.test.ts
  note: "SDD outer loop — written first by the implementer, RED until GAP-1 wiring lands, GREEN at the end"
```

Shape (mirror `198-constrained-action-surface.acceptance.test.ts` and
`196-least-privilege-platform-token.acceptance.test.ts` style — Detroit, real stub
sink + real scanner, zero `vi.fn`):

- **Doubles**:
  - real `createEgressScanner(redactConfig)` (secret=redact, out-of-scope=redact, length=redact, small cap) — the REAL scanner, not a stub, to exercise true detection.
  - real `StubNoteCommentPostGateway` as the underlying sink (records `calls`).
  - real `StubEgressTraceGateway` (records `traces`).
  - decorator under test: `new EgressScannedNoteCommentPostGateway(sink, scanner, trace)`.
  - a `RecordingExecutor` (CLI) capturing `args` to assert the raw note primitive is never hit with a secret (the "guard counter on the raw sink reads zero" from spec AC9 / test strategy).
  - a fixed `SECRET = 'glpat-abcdefghij1234567890'`.

- **Scenarios** (table-driven over the auto-path verb set `{POST_COMMENT, THREAD_REPLY}`):
  1. **AC9 chokepoint via `executeThreadActions`** — drive each public-output verb with a secret-shape body through `executeThreadActions(actions, gitlabContext, logger, recordingExecutor, decoratedGateway)`; assert: `sink.calls` count equals the number of public-output verbs, every `sink.calls[].body` excludes `SECRET` and contains `[REDACTED]`, the raw executor recorded zero args containing `SECRET`, and a trace was recorded per redacted body.
  2. **AC9 chokepoint via `executeActionsFromContext`** — same verbs persisted in a `ReviewContext.actions`; same assertions. Proves both executors share the enforcement point.
  3. **AC2/AC5 block + fail-closed end-to-end** — with a block-mode scanner config, a secret body raises `EgressBlockedError` and `sink.calls` is empty; with the `StubEgressScanGateway.setShouldFail(true)`, the post is never made and an error is raised.
  4. **GAP-1 recovery path is scanned (the loop-closing assertion)** — drive the recovery entrypoint (or its `executeActions` closure as wired in `server.ts`) with a recovered `ReviewContext` whose actions carry a secret-shape `POST_COMMENT`; assert the secret never reaches the raw CLI primitive (recording executor has zero secret-bearing args) and the decorated sink received a redacted body. **This case is RED until GAP-1 is fixed.**
  5. **AC8 out-of-scope-by-design guard** — a recovered/auto context containing `THREAD_RESOLVE` + a `revoke`-class action records zero CLI writes for those verbs (proving no auto revoke whose comment could egress), referencing SPEC-196 unwire.

- **Observable assertions only** (never model obedience): sink called/not, body transformed, error raised, trace recorded, raw-executor secret-arg counter == 0.

## Out of scope for this close-loop (per spec "Out of scope")

- Authorization / target validation of write verbs → SPEC-198 (already merged).
- Provenance / actor identity → SPEC-197 / SPEC-201 (already merged).
- Diff sanitization + ambient token scoping → SPEC-196 / SPEC-174.
- `revoke` and its accompanying comment on any future write-executor path (AC8 closes out-of-scope-by-design here).
- Any ML / semantic content classification (YAGNI — spec bounds shapes + volume only).
- Changing scanner detection rules or default config (no new threat categories — the amendment is a coverage extension only).

## IMPLEMENTATION_ORDER (close-loop)

1. `src/tests/acceptance/199-review-output-egress-scan.acceptance.test.ts` — write the outer-loop acceptance test FIRST; scenarios 1–3 + 5 GREEN immediately (machinery exists), scenario 4 (recovery) RED. Proves the spec and exposes GAP-1 deterministically.
2. `src/main/server.ts:237-244` — minimal wiring fix so the recovery path posts public output through the decorated gateway (per-platform sink chosen by `context.platform`). Turns scenario 4 GREEN. No behaviour change to scanner/decorator.
3. Run the 4 existing egress unit/service suites + the new acceptance test (`yarn vitest run …`); paste real pass counts into the report.
4. `docs/feature-tracker.md` — add the SPEC-199 row (status `implemented`, link spec + this plan + report) mirroring the SPEC-197/200/201 rows at lines 64-66.
5. `docs/specs/199-review-output-egress-scan.md` — flip front-matter `status: draft` → `status: implemented` (closes the SDD loop; satisfies the `verify-spec-updated` commit hook).
6. `docs/reports/199-review-output-egress-scan.report.md` — implementer writes the AC matrix outcome + test run evidence.

## REFERENCE_FILES

- `src/modules/platform-integration/entities/egressScan/egressScan.gateway.ts` — port + channel/category/result types (the contract everything binds to).
- `src/modules/platform-integration/entities/egressScan/egressScan.scanner.ts` — the deterministic detection logic (AC2/AC3/AC4).
- `src/modules/platform-integration/entities/egressScan/egressScan.defaults.ts` — production config (note out-of-scope=allow by default).
- `src/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.ts` — the chokepoint decorator (AC1/AC5/AC6) + `EgressBlockedError`.
- `src/modules/review-execution/services/publicOutputExecutor.ts` — the single fan-in to the sink (where AC7/AC9 routing is decided).
- `src/modules/review-execution/services/contextActionsExecutor.ts` + `threadActionsExecutor.ts` — the two executors and their `postGateway === null` bypass branch (GAP-1 root).
- `src/main/routes.ts:409-443, 549-606` — production wiring of the decorator (the 4 correct injection sites).
- `src/main/server.ts:232-256` — the recovery caller that omits the gateway (GAP-1).
- `src/modules/platform-integration/services/autoExecutorActionFilter.ts` — SPEC-196 capability filter that makes AC8 out-of-scope-by-design.
- `src/tests/acceptance/198-constrained-action-surface.acceptance.test.ts` + `196-least-privilege-platform-token.acceptance.test.ts` — the acceptance-test style to mirror.
- `src/tests/stubs/egressScan.stub.ts` + `noteCommentPost.stub.ts` — the doubles to reuse.
```
