# Implementation Report — SPEC-193: Let Ember record a recurring insight it derives

> Spec: `docs/specs/193-ember-record-recurring-insight.md`
> Plan: `docs/plans/193-ember-record-recurring-insight.plan.md`
> Status: **Complete** — acceptance GREEN, full suite GREEN (3751 tests), typecheck clean.

## Summary

Ember can now record a recurring finding it derived while answering, via a new
`record_insight` MCP tool wired into its `--bg` run. The write targets only
Ember's private per-project notebook (`appendInsight`), is deduplicated and
blank-rejecting at the gateway, and is best-effort (a failed write never breaks
the answer). No project-state write path was added.

## Files created

| File | Purpose |
|------|---------|
| `src/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.ts` | MCP handler: validates `projectPath`, parses `insight` (blank → no-op success), fire-and-forget best-effort `appendInsight`. |
| `src/tests/units/modules/ember-chat/controllers/mcp/recordInsight.handler.test.ts` | Handler unit tests (arg validation, blank no-op, non-fatal failure, gateway received insight). |
| `src/tests/units/mcp/mcpServerStdioTools.test.ts` | Asserts `record_insight` is registered in `TOOL_DEFINITIONS` + the handlers map. |
| `src/tests/acceptance/193-ember-record-recurring-insight.acceptance.test.ts` | SDD outer loop — 5 scenarios over a real `EmberMemoryFileSystemGateway` + temp home. |

## Files modified

| File | Change |
|------|--------|
| `src/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.ts` | `appendInsight`: trim + skip-blank + skip-duplicate (case-sensitive). Idempotent. |
| `src/tests/stubs/emberMemory.stub.ts` | Stub mirrors the same dedup + blank-skip so upper-layer tests are realistic. |
| `src/modules/ember-chat/entities/emberMemory/emberMemory.guard.ts` | Added `emberRecurringInsightGuard` (single-insight boundary validator for the handler). |
| `src/mcp/mcpServerStdio.ts` | Registered `record_insight` in `TOOL_DEFINITIONS` + handlers map; built an own `EmberMemoryFileSystemGateway` (the MCP server is a separate subprocess). |
| `src/modules/ember-chat/services/emberSystemPrompt.ts` | Added `recordInsightInstruction(projectPath)` + a `projectPath` parameter to `buildEmberSystemPrompt`. Wording uses singular "constat récurrent" to avoid colliding with the existing recurring-insights section guard. |
| `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` | **Step 7 (HUMBLE GLUE).** Attached the MCP config (lazy `buildMcpConfig` provider) + added `mcp__review-progress__record_insight` to `allowedTools`. Corrected the stale "no MCP servers" header comment. |
| `src/main/routes.ts` | Pass `buildMcpConfig: buildMcpConfigJson` into the transport gateway (composition root). |
| `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` | Pass `projectPath` as the 2nd arg to `buildEmberSystemPrompt`. |
| `src/tests/units/modules/ember-chat/gateways/emberAnswerTransport.claude.gateway.test.ts` | Adapted flag assertions; added a test that `buildMcpConfig` flows through to dispatch. |
| `src/tests/units/modules/ember-chat/entities/emberMemory.guard.test.ts` | Coverage for `emberRecurringInsightGuard`. |
| `src/tests/units/modules/ember-chat/services/emberSystemPrompt.test.ts` | Coverage for the record instruction + `projectPath` injection. |
| `src/tests/acceptance/190-ember-live-answers-subscription.acceptance.test.ts` | Adapted the pure-function call to the new 2-arg `buildEmberSystemPrompt`. |

## Locked decisions honoured

- Dedup lives in the **gateway** (idempotent `appendInsight`), no standalone use case. Stub mirrors it.
- Normalize by **trim only**, compare **case-sensitively** (French findings keep case meaning).
- **No new entity/schema** — reused `EmberRecurringInsight`. A single-insight guard was added (handler needed a boundary validator).
- Project-id via **tool argument** `record_insight({ projectPath, insight })` (option A), `projectPath` injected by the system prompt. No `routes.ts` wiring beyond the MCP-config provider.
- Handlers are **sync**, `appendInsight` is async → **fire-and-forget best-effort** write (swallowed rejection), satisfying "best-effort, non-fatal".
- MCP server is a **separate subprocess** → its own `EmberMemoryFileSystemGateway` over the shared `~/.claude-review/ember-memory/<slug>.json` store.
- **api-key-present**: no new recording-path test — `askEmber` returns `billing-regression-prevented` before the run, so the tool is unreachable.

## Deviation from plan

The plan's PROJECT-ID propagation passed `projectPath` as a plain string to the
gateway; during step 7 the MCP config had to be resolved **lazily** because
`buildMcpConfigJson()` throws if `dist/mcpServer.js` is absent and reviews only
call it per-job (never at boot). Wiring an eager string into `routes.ts` would
have made server startup (and `yarn dev`) crash without a build. Resolution: the
transport gateway takes a `buildMcpConfig: () => string` provider evaluated per
question in `start()` — mirroring the codebase's own deferral of
`buildMcpConfigJson`. One extra option field, no new abstraction beyond it.

## Tests

- **Full suite**: `yarn test:ci` → **451 files, 3751 tests, all pass**.
- **Typecheck**: `yarn typecheck` → clean.
- **Lint**: `yarn lint` → only pre-existing size-limit warnings (tracked debt per CLAUDE.md); none in the changed files.

## Acceptance test status: **GREEN**

## Spec coverage map

| Spec scenario | Test |
|---|---|
| record nominal (recorded → loaded back without recompute) | acceptance `record nominal` + handler test (gateway received insight) + gateway test (persist/reload) |
| empty insight `{insight: ""}` → nothing recorded | acceptance `empty insight` + gateway blank-skip + handler `recorded:false` no-op |
| duplicate (already present) → no duplicate | acceptance `duplicate` + gateway append-twice → length 1 + stub mirror |
| per-project isolation (A recorded → absent from B) | acceptance `per-project isolation` + gateway isolation test |
| record failure non-fatal (write fails → answer completes) | acceptance `record failure non-fatal` + handler rejecting-gateway test |
| api key present → Ember does not act | covered upstream by `askEmber` `billing-regression-prevented` (no new recording-path test) |

## Manual verification still required

The transport gateway (`emberAnswerTransport.claude.gateway.ts`) is declared
HUMBLE GLUE — validated by acceptance/manual only. The end-to-end path (Ember in
a browser actually deriving a finding and calling `record_insight` over the live
`--bg` MCP server) is **not headlessly coverable** and needs **one manual
browser run** to confirm: ask a question that yields a recurring finding, then a
follow-up question, and verify the insight is reused without recomputation.

## Self-review note

The feature-implementer agent stopped mid-fix (a system-prompt wording collision
with the existing recurring-insights section test). The orchestrator finished:
(1) the collision was already resolved by the agent before returning; (2) the
**transport gateway wiring (step 7) was not done** by the agent and was completed
by the orchestrator; (3) two callers of `buildEmberSystemPrompt`
(`askEmber.usecase.ts`, `190` acceptance) were broken by the new signature and
were fixed.
