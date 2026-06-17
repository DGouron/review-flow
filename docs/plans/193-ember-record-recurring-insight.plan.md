# Plan — SPEC-193: Let Ember record a recurring insight it derives

> Source spec: `docs/specs/193-ember-record-recurring-insight.md`
> Module: `src/modules/ember-chat/` (modular layout — NOT the top-level `src/entities/` layout)
> Depends on: SPEC-192 (per-project memory + `appendInsight`, already shipped)

```
PLAN:
  scope: ember-record-recurring-insight
  is_new_module: false
```

---

## CRITICAL FLAGS (read before implementing)

These are load-bearing discrepancies between the spec's non-normative notes and the
verified codebase. They change the shape of the work.

### FLAG 1 — Dedup does NOT already exist in `appendInsight`
Verified `emberMemory.fileSystem.gateway.ts:49-52`: `appendInsight` does a blind
`[...current.insights, insight]` with no duplicate check. The stub
(`emberMemory.stub.ts:35-41`) does the same. **So dedup must be added** — it is not
already there. (The spec told us to verify this; confirmed absent.)

### FLAG 2 — The Ember `--bg` run currently has NO MCP server attached
The spec note says "Ember's `--bg` answer run already has MCP available." This is
**false against current code**. Verified `emberAnswerTransport.claude.gateway.ts:118-122`:
the dispatch flags are
```
mcpConfigJson: '{"mcpServers":{}}',   // empty — no MCP server
allowedTools: 'Read,Glob,Grep',       // record_insight NOT allowed
disallowedTools: 'Edit,Write,Bash,Task',
```
There is no `record_insight` tool the model could call, and even if there were, it is
not in `allowedTools`. **Enabling the tool requires modifying the transport gateway**
(attach the stdio MCP server config + add the tool name to `allowedTools`). This is the
single biggest piece of work and the riskiest (the transport gateway is the project's
one declared "HUMBLE GLUE — NOT unit-tested" file, validated by acceptance/manual only).

### FLAG 3 — MCP handlers are SYNC, `EmberMemoryGateway.appendInsight` is ASYNC
Verified `types.ts:7-10` + `mcpServerStdio.ts:226`: handlers return `McpToolResult`
(synchronous), and `callTool`/the stdio dispatcher invoke them synchronously
(`mcpServerStdio.ts:273` `const result = handler(...)`). But `appendInsight` returns
`Promise<void>` (`emberMemory.gateway.ts:10`). The handler cannot `await`. Resolution:
the handler kicks off the write as a fire-and-forget best-effort (`void useCase(...)`)
and returns success immediately, OR we introduce a synchronous record path. Decision in
§DEDUP and §HANDLER below — we keep it fire-and-forget to honor "best-effort, non-fatal".

### FLAG 4 — The MCP server runs in a SEPARATE process from the Fastify host
`mcpServerStdio.ts` is spawned by `claude --bg` as a subprocess. It instantiates its own
gateways (`startMcpServer` line 198 `new ReviewContextFileSystemGateway()`). The
`record_insight` handler must therefore construct its OWN `EmberMemoryFileSystemGateway`
inside `startMcpServer` — it cannot share the Fastify host's instance. Both write to the
same `~/.claude-review/ember-memory/<slug>.json`, so cross-process consistency is fine
(filesystem is the shared store, exactly as SPEC-192 designed it).

---

## DEDUP DECISION

**Where**: in the **gateway** (`appendInsight`), made idempotent — NOT in a use case.

Rationale (anti-overengineering):
- The dedup invariant ("the same insight is never recorded twice") is a property of the
  notebook store, and the store is the gateway. Putting it in the gateway makes EVERY
  caller idempotent (the HTTP path, the MCP path, future callers) for free.
- The stub gateway must mirror this so unit tests above the gateway see the same
  behavior.
- A use case wrapping a single `appendInsight` call with a load-compare-write would
  duplicate the gateway's own load-compare-write and add a layer with no business logic
  beyond what the gateway already does. Ratio inverts → keep it in the gateway.

**Normalization**: normalize by **trim only**, compare case-SENSITIVELY.
- The schema already trims (`emberRecurringInsightSchema = z.string().trim().min(1)`),
  so an incoming insight is already trimmed by the time a guard parses it; comparing on
  the trimmed value is enough to stop "same text + trailing whitespace" duplicates.
- Do NOT lowercase: French review findings carry meaning in case/accents (project names,
  "Vendredi"), and case-folding risks collapsing two genuinely different findings.
  YAGNI — add case-insensitivity only if a real duplicate slips through.
- Empty/blank is already rejected by the schema's `.min(1)` after trim; the gateway
  should still guard defensively (see §GATEWAYS) so a blank never reaches the array.

---

## PROJECT-ID PROPAGATION (how the project path reaches the handler)

Mirror `add_action`'s job-context mechanism, adapted to Ember.

`add_action` resolves its target via a **jobId → jobContext** lookup:
1. The host writes a per-job context file `~/.claude-review/jobs/<jobId>.json`
   (`getJobContextFilePath`, `mcpJobContext.ts:8`) AND/OR sets `MCP_*` env vars.
2. The MCP subprocess lazy-loads it (`ensureJobContextLoaded`, `mcpServerStdio.ts:66`)
   keyed off `args.jobId` on the first tool call.
3. The handler reads `jobContext.localPath` to know which project to write to
   (`addAction.usecase.ts:99-110`).

For Ember the project path is the unit of isolation (the memory gateway is keyed by
`projectPath`, `emberMemory.gateway.ts:10`). Two viable mechanisms — **choose A**:

- **A (recommended): pass `projectPath` as a tool argument.**
  The `record_insight` tool takes `{ projectPath, insight }`. The transport gateway
  already knows `options.projectPath` (`emberAnswerTransport.claude.gateway.ts:123`) and
  injects it into the system prompt instruction so the model calls
  `record_insight({ projectPath: "<the project>", insight: "..." })`. The handler reads
  `args.projectPath` directly — no job-context file needed. Simplest, fewest moving
  parts, and the project path is not a secret. Isolation (Rule: per-project) is enforced
  because the handler writes to exactly that `projectPath` notebook.
  - Hardening: the system prompt fixes the legitimate `projectPath`; even if the model
    passed a different one, it can only ever write to an Ember-memory notebook (never to
    project state), so the "never crosses into project state" rule holds regardless.

- **B (heavier, mirrors add_action literally): jobId → ember-job-context file.**
  Reuse `getJobContextFilePath` semantics with the ember jobId
  (`ember-${Date.now()}`, gateway line 124), write a context file carrying
  `{ jobId, projectPath }`, and add an `ensureEmberContextLoaded` lazy-loader. This adds
  a file-write on the host, a new context gateway, and a loader — more surface for the
  same result. Only pick B if we later need the handler to NOT trust a tool arg.

**Decision: A.** `record_insight({ projectPath, insight })`, project path injected by the
transport gateway's instruction. Documented as the deviation from `add_action` (which
uses jobId indirection because it needs `localPath` + `mergeRequestId` it cannot safely
expose to the model). Ember only needs the project path, which is non-sensitive.

---

## ANTI-OVERENGINEERING VERDICT

The feature warrants:
- **A gateway change** (dedup) — yes, real invariant, ~5 lines.
- **One MCP tool + handler** — yes, it is the structured signal the spec is about.
- **A thin use case** — only if it carries logic beyond the gateway call. Here the
  "logic" is: reject empty (schema does it), dedup (gateway does it). So the use case
  would be a pass-through. **Decision: NO standalone usecase.** The handler validates
  args (mirror `addAction.handler`'s arg-shape validation) and calls the gateway.
  This keeps business-logic > boilerplate. (If a reviewer insists on symmetry with
  `addAction.usecase`, a `recordInsight.usecase` is acceptable but is gold-plating here.)
- **NO new entity, schema, guard** beyond what SPEC-192 shipped — `EmberRecurringInsight`
  already exists (`emberMemory.schema.ts:8`). Reuse it.

Layers that do NOT apply: presenter, view (no dashboard surface; recording is invisible),
new gateway contract (reuse `EmberMemoryGateway`).

---

## ENTITIES

No new entity. **REUSE** existing:
- `EmberRecurringInsight` — `src/modules/ember-chat/entities/emberMemory/emberMemory.schema.ts:8`
  (`z.string().trim().min(1)`). This already enforces "empty/blank never recorded" at the
  boundary.
- `emberMemoryGuard` — `emberMemory.guard.ts`. No change.

> MODIFY (optional, only if the handler needs a standalone insight guard for `args.insight`):
> add `emberRecurringInsightGuard = createGuard(emberRecurringInsightSchema, 'emberRecurringInsight')`
> in `emberMemory.guard.ts`. Preferred over re-validating inline. Decide during TDD; the
> existing `emberMemorySchema` parse is not granular enough for a single insight arg.

## USECASES

None created. (See Anti-overengineering verdict — the handler calls the gateway directly.)

## GATEWAYS

### MODIFY — contract (no signature change, behavior change documented)
- `src/modules/ember-chat/entities/emberMemory/emberMemory.gateway.ts`
  - `appendInsight` contract gains a documented invariant: idempotent (a duplicate
    insight is a no-op) and blank-rejecting. Signature unchanged
    (`appendInsight(projectPath, insight): Promise<void>`).

### MODIFY — filesystem implementation
- `src/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.ts`
  - `appendInsight` (line 49): before appending, trim and (a) skip if blank, (b) skip if
    an equal trimmed insight is already present in `current.insights`.
  - test: `src/tests/units/modules/ember-chat/gateways/emberMemory.fileSystem.gateway.test.ts`
    (EXTEND existing file — add dedup + blank-skip cases).

### MODIFY — stub (must mirror dedup so upper-layer tests are realistic)
- `src/tests/stubs/emberMemory.stub.ts`
  - `StubEmberMemoryStore.appendInsight` (line 35) + `StubEmberMemoryGateway.appendInsight`
    (line 68): apply the same trim + dedup + blank-skip.

### REUSE — factory
- `src/tests/factories/emberMemory.factory.ts` — add an insight default to
  `EmberMemoryFactory` overrides if a test needs a pre-seeded duplicate; otherwise reuse.

## CONTROLLERS

### CREATE — MCP handler (mirror `addAction.handler.ts`)
- `src/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.ts`
  - exports `createRecordInsightHandler(deps: { memory: EmberMemoryGateway })`
  - returns `(args) => McpToolResult` (SYNC, per FLAG 3)
  - validates `args.projectPath` is a non-empty string, `args.insight` is a string
    (parse via `emberRecurringInsightGuard.safeParse` → if not valid/blank, return a
    success-but-no-op result; per spec, an empty insight is "nothing recorded", NOT an
    error the answer should surface).
  - fire-and-forget the gateway write: `void deps.memory.appendInsight(projectPath, insight)`
    wrapped so a rejection is swallowed (best-effort, non-fatal — FLAG 3 + Rule
    "recording is best-effort"). Returns `{ content: [{type:'text', text: '{"recorded":true}'}] }`.
  - test: `src/tests/units/modules/ember-chat/controllers/mcp/recordInsight.handler.test.ts`
  - dependencies: `{ memory: EmberMemoryGateway }`

### MODIFY — MCP server registration
- `src/mcp/mcpServerStdio.ts`
  - import `createRecordInsightHandler` + `EmberMemoryFileSystemGateway`.
  - in `startMcpServer`: construct `new EmberMemoryFileSystemGateway({ homeDir: homedir() })`
    (FLAG 4 — own instance, shared file store) and `createRecordInsightHandler({ memory })`.
  - add `record_insight` to the `handlers` map (line ~226) and to `TOOL_DEFINITIONS`
    (line ~93) with inputSchema `{ projectPath: string, insight: string }`, both required.
  - test: `src/tests/units/mcp/mcpServerStdio.*.test.ts` if one exists for tool listing;
    otherwise cover via the handler test + acceptance.

### MODIFY — Ember transport gateway (FLAG 2 — enable the tool for the run)
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts`
  - change dispatch flags (line 118-122):
    - `mcpConfigJson`: point to the stdio MCP server (the same config reviews use to load
      `mcpServerStdio`) instead of `'{"mcpServers":{}}'`.
    - `allowedTools`: add `mcp__<server>__record_insight` (and ONLY that MCP tool) to the
      existing `Read,Glob,Grep`. Read-only over project state is preserved because the
      ONLY new capability is writing to Ember's private notebook.
    - keep `disallowedTools: 'Edit,Write,Bash,Task'` — no project-state writes.
  - This file is the declared HUMBLE GLUE (header comment lines 18-49). Per project
    convention it is validated by acceptance/manual, NOT unit tests. The acceptance test
    drives the end-to-end recording; a manual browser run is the final check.
  - Update the header comment to note MCP is now attached for `record_insight` (the
    current comment asserts "no MCP servers" at line 32 — that becomes stale and MUST be
    corrected to avoid misleading future readers).

### MODIFY — system prompt (instruct Ember to use the tool + pass projectPath)
- `src/modules/ember-chat/services/emberSystemPrompt.ts`
  - add an instruction: when Ember derives a recurring finding, call
    `record_insight({ projectPath: "<the answered project path>", insight: "<finding>" })`;
    record only genuine recurring review findings, never arbitrary facts (Rule + Out of
    Scope). Inject the concrete `projectPath` so the model passes the right one (§PROJECT-ID A).
  - test: `src/tests/units/modules/ember-chat/services/emberSystemPrompt.test.ts`
    (EXTEND if it exists; assert the instruction + projectPath are present).

## PRESENTERS
N/A — recording is invisible; no ViewModel.

## VIEWS
N/A — no dashboard surface (Out of Scope: editing/deleting individual insights via UI).

## WIRING

- `src/mcp/mcpServerStdio.ts` — `startMcpServer`: instantiate `EmberMemoryFileSystemGateway`
  + register `record_insight` (above). This is the composition root for the MCP subprocess.
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts`
  — flags now enable the MCP server + the one tool (above).
- `src/main/routes.ts` — **no change required** for recording. The HTTP Ember wiring
  (lines 633-654) stays as-is; the recording path lives entirely in the `--bg` subprocess
  + its MCP server, not the Fastify host. (If §PROJECT-ID option B were chosen, routes
  would need to write an ember-job-context file — but we chose A, so no routes change.)
- No new gateway instantiated in `routes.ts`.

## IMPLEMENTATION_ORDER

Inside-out; the walking skeleton is the gateway dedup + handler (the first vertical slice
that crosses store → adapter → acceptance). Transport-gateway wiring is last (it is the
untested glue and only matters once the inner pieces are green).

1. `emberMemory.fileSystem.gateway.ts appendInsight` dedup + blank-skip — **walking
   skeleton core**. RED via extended gateway test. Makes the invariant real at the store.
   Justification: smallest change that satisfies the "duplicate" + "empty" rules; every
   other layer depends on it.
2. `emberMemory.stub.ts appendInsight` dedup — mirror, so upper-layer tests are honest.
3. `emberMemory.guard.ts` — add `emberRecurringInsightGuard` (single-insight parse) if the
   handler needs it. Justification: gives the handler a boundary validator without inline
   re-validation.
4. `recordInsight.handler.ts` + test — validate args, no-op on blank, fire-and-forget
   best-effort write, success result. Justification: the MCP entry point; depends on 1-3.
5. `mcpServerStdio.ts` — register `record_insight` + own `EmberMemoryFileSystemGateway`.
   Justification: exposes the handler to the `--bg` run (composition root, subprocess).
6. `emberSystemPrompt.ts` — instruct Ember to call the tool with the project path.
   Justification: without it the model never emits the structured signal.
7. `emberAnswerTransport.claude.gateway.ts` — attach MCP server + allow the one tool;
   correct the stale "no MCP" comment. **Last** — untested HUMBLE GLUE, validated by the
   acceptance test + manual browser run.

## SCENARIO -> TEST MAP

| Spec scenario | Test |
|---|---|
| record nominal (derive → added → reused next question without recompute) | acceptance `193-ember-record-recurring-insight.acceptance.test.ts` (record then a later `load` returns it / system prompt includes it). Inner: handler test asserts gateway received the insight; gateway test asserts it persists + reloads. |
| empty insight `{insight: ""}` → nothing recorded | gateway test (blank-skip) + handler test (`args.insight: ""` → no-op success, gateway not called / array unchanged) |
| duplicate insight (already present) → no duplicate | gateway test (append same trimmed insight twice → length 1) + stub mirror test |
| per-project isolation (A recorded → never in B) | gateway test (record for PROJECT_A, `load(PROJECT_B)` has no such insight) — mirror existing isolation test at line 51 |
| record failure non-fatal (memory write fails) | handler test (inject a gateway whose `appendInsight` rejects → handler still returns success, no throw). Acceptance: answer completes despite a failing write. |
| api key present → Ember does not act at all | **NO new test for the recording path** — already covered upstream by `askEmber` returning `billing-regression-prevented` before the run starts (`askEmber.usecase.ts:129`). The run never dispatches, so the MCP tool is never reachable. Reference the existing askEmber test; optionally add an acceptance assertion that with an API key set, no notebook write occurs. |

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/193-ember-record-recurring-insight.acceptance.test.ts
  note: "SDD outer loop — written FIRST by the implementer, RED during impl, GREEN at the end.
         Drives: record an insight (via the handler against a real/stub EmberMemoryGateway over
         a temp home) → a subsequent load returns it exactly once (nominal + dedup); a blank is
         not recorded; an insight for project A is absent from project B; a failing write does not
         throw. The transport-gateway MCP wiring (FLAG 2) is the one piece this test cannot fully
         cover headlessly — note a required MANUAL browser run end-to-end, consistent with the
         transport gateway being declared HUMBLE GLUE."
```

## REFERENCE_FILES

- `src/modules/ember-chat/entities/emberMemory/emberMemory.gateway.ts` — `appendInsight`
  contract (confirmed signature, no dedup in the contract).
- `src/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.ts` —
  confirmed `appendInsight` has NO dedup (FLAG 1); this is the file to modify (step 1).
- `src/modules/ember-chat/entities/emberMemory/emberMemory.schema.ts` — `EmberRecurringInsight`
  is `z.string().trim().min(1)` (empty/blank already rejected at boundary; reuse, no new entity).
- `src/modules/ember-chat/entities/emberMemory/emberMemory.guard.ts` — existing
  `emberMemoryGuard`; candidate place for a single-insight guard (step 3).
- `src/modules/review-execution/interface-adapters/controllers/mcp/addAction.handler.ts` —
  the MCP handler precedent (arg validation shape, SYNC `McpToolResult`).
- `src/modules/review-execution/usecases/mcp/addAction.usecase.ts` — the jobId→jobContext
  resolution we adapt; shows why add_action needs indirection (localPath + mergeRequestId)
  that Ember does not.
- `src/mcp/mcpServerStdio.ts` — tool registration (`TOOL_DEFINITIONS`, `handlers` map),
  lazy job-context load, subprocess composition root (FLAG 4 — gateways built here).
- `src/mcp/types.ts` — `McpToolResult` is SYNC (FLAG 3).
- `src/shared/services/mcpJobContext.ts` — `getJobContextFilePath` (the job-context file
  mechanism we DON'T need under §PROJECT-ID option A).
- `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` — no-API-key safeguard at
  line 129 (`hasAnthropicApiKey()` → `billing-regression-prevented`), upstream of the run;
  best-effort `rememberTurn` precedent (lines 109-123) for the non-fatal pattern.
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` —
  FLAG 2: dispatch flags currently disable MCP (`mcpConfigJson: '{"mcpServers":{}}'`,
  `allowedTools: 'Read,Glob,Grep'`); the HUMBLE GLUE file to modify (step 7).
- `src/modules/ember-chat/services/emberSystemPrompt.ts` — where to instruct Ember to call
  the tool with the project path (step 6).
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` +
  `claudeSession.schema.ts` — `ClaudeDispatchFlags` shape and `jobType: 'ember-chat'`
  already exist (no schema change needed to dispatch).
- `src/tests/stubs/emberMemory.stub.ts` — stub to mirror dedup (step 2).
- `src/tests/factories/emberMemory.factory.ts` — test data; add insight default if needed.
- `src/main/routes.ts` lines 633-654 — Ember HTTP wiring; confirmed NO change needed for
  recording under §PROJECT-ID option A.
```
```
