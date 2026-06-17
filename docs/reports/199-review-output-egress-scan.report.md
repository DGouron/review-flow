# SPEC-199 — Review output egress scan before posting — Implementation Report

> Base branch: `ca2c0c9` (includes SPEC-196/198/200/201/197 merges).
> Close-loop work: outer-loop acceptance test + one real security wiring fix + bookkeeping.
> Spec: `docs/specs/199-review-output-egress-scan.md` — Plan: `docs/plans/199-review-output-egress-scan.plan.md`.

## Outcome

**SUBSTANTIALLY IMPLEMENTED on arrival → loop closed GREEN.** The egress-scan machinery
(scanner, decorator, trace, executor routing) already existed and was wired into the four
production review paths. This task added the missing SDD outer-loop acceptance test, fixed
the one real bypass (GAP-1), and updated spec + tracker.

## GAP-1 fix (production, security)

**Bug:** the boot-time review-recovery path (`src/main/server.ts`) called
`executeActionsFromContext` with only 4 args, so `postGateway` defaulted to `null` and the
`postGateway === null` branch (`contextActionsExecutor.ts:93-95`) routed recovered
LLM-derived `POST_COMMENT`/`THREAD_REPLY` bodies straight through the raw CLI primitive,
**bypassing the egress scan** at boot.

**Seam chosen:** extracted the recovery closure into an exported, testable factory
`buildRecoveryExecuteActions(logger, egressTraceGateway, executors?)` in `src/main/server.ts`.
It builds the per-platform note sink (`GitLabNoteCommentPostCliGateway` /
`GitHubNoteCommentPostCliGateway`, selected by `context.platform`), wraps it in
`EgressScannedNoteCommentPostGateway` with `createEgressScanner(defaultEgressScanConfig)` and a
`LoggerEgressTraceGateway`, and passes it as the 6th `postGateway` arg. This reuses the exact
scanner config + decorator the production routes use (`routes.ts:409-443`) — no config
duplication, no new abstraction. Call site wired at `server.ts:300-302`.

**Rationale for the factory seam:** the recovery closure lives in `startServer`, while the
decorator was previously only built inside `registerRoutes`. Extracting a named factory is the
smallest change that (a) makes the recovery path scan and (b) is directly unit/acceptance
testable, vs. inlining (untestable) or hoisting the whole routes-level construction (larger diff).
No scanner/decorator behaviour changed — pure wiring.

## Files

**Created**
- `src/tests/acceptance/199-review-output-egress-scan.acceptance.test.ts` — outer-loop acceptance, 5 scenarios over `{POST_COMMENT, THREAD_REPLY}` (real `createEgressScanner` + `StubNoteCommentPostGateway` sink + `StubEgressTraceGateway` + `RecordingExecutor`, fixed `SECRET='glpat-abcdefghij1234567890'`). Scenario 4 drives `buildRecoveryExecuteActions` directly — RED before the fix, GREEN after.
- `docs/reports/199-review-output-egress-scan.report.md` — this report.

**Modified**
- `src/main/server.ts` — GAP-1 fix (factory + wiring).
- `docs/specs/199-review-output-egress-scan.md` — `status: draft → implemented` + `## Implementation` AC matrix.
- `docs/feature-tracker.md` — SPEC-199 row → `implemented` (2026-06-10).

## AC coverage

| AC | Status | Evidence |
|----|--------|----------|
| AC1 single enforcement point | COVERED (pre-existing) | `egressScanned.noteCommentPost.gateway.ts:15-42` + test |
| AC2 secret-shape scan | COVERED | `egressScan.scanner.ts:18-48` + scanner test |
| AC3 length cap | COVERED | `egressScan.scanner.ts:65-75` + scanner test |
| AC4 out-of-scope reference | COVERED | `egressScan.scanner.ts:21,27-29,50-63` + scanner test |
| AC5 fail-closed on scanner error | COVERED | decorator scans before sink; acceptance scenario 3 |
| AC6 trace without secret | COVERED | `egressScan.scanner.ts:79-92` + `loggerEgressTrace.gateway.ts` + tests |
| AC7 THREAD_REPLY scanned | COVERED | `publicOutputExecutor.ts` + both `*.egress.test.ts` + acceptance scenarios 1–2 |
| AC8 revoke comment (out-of-scope-by-design) | COVERED | SPEC-196 capability filter drops auto revoke; acceptance scenario 5 |
| AC9 channel exhaustiveness (no unscanned public-output verb) | **CLOSED** | executor chokepoint tests + **GAP-1 recovery fix** + acceptance scenario 4 |

## Verification

- `yarn vitest run` (acceptance 199 + 4 egress suites): **34 tests pass** (5 files).
- `yarn typecheck`: pass (server.ts composition-root change clean).
- Scenario 4 (recovery scanned) confirmed RED-before / GREEN-after the GAP-1 fix.

## Production code changed

Yes — `src/main/server.ts` only (the GAP-1 security wiring fix). No scanner/decorator/executor
behaviour changed. No other production file touched.
