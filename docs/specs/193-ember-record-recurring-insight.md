---
title: "SPEC-193: Let Ember record a recurring insight it derives"
status: implemented
milestone: Ember Assistant
depends_on:
  - "192-ember-ondemand-grounding-and-memory"
related:
  - "190-ember-live-answers-subscription"
---

# SPEC-193: Let Ember record a recurring insight it derives

## Implementation

- **MCP tool**: `record_insight({ projectPath, insight })` exposed via `src/mcp/mcpServerStdio.ts`, handled by `src/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.ts`. The handler validates `projectPath`, parses `insight` (blank → no-op success), and fire-and-forget writes via `EmberMemoryGateway.appendInsight` (best-effort: rejection swallowed).
- **Dedup**: lives in the gateway. `EmberMemoryFileSystemGateway.appendInsight` (and the stub) trim, skip blank, and skip an already-present (case-sensitive) insight — idempotent. No standalone use case.
- **Tool enablement**: `emberAnswerTransport.claude.gateway.ts` attaches the MCP config (lazy `buildMcpConfig` provider, resolved per question so boot never depends on a built `dist`) and adds `mcp__review-progress__record_insight` to `allowedTools`; `Edit/Write/Bash/Task` stay disallowed — read-only over project state is preserved.
- **Prompt signal**: `buildEmberSystemPrompt(grounding, projectPath)` injects an instruction telling Ember to call `record_insight` with the concrete `projectPath`, only for genuine recurring review findings.
- **Safeguard**: the no-API-key guard in `askEmber` (`billing-regression-prevented`) runs before dispatch, so the tool is unreachable with an API key set.

Report: `docs/reports/193-ember-record-recurring-insight.report.md`.

## Context

Phase C (SPEC-192) made Ember's per-project memory able to hold and reuse recurring insights, but Ember cannot yet record one itself — automatic derivation was deferred because the one-shot `--bg` answer exposes no structured "this is a recurring finding" signal, and parsing free-form prose would be an unreliable guess. This spec closes that gap: while answering, Ember may record a recurring finding it derived, so a later question reuses it without recomputing. It completes the "derives and records" half of the Phase C insight rule.

## Rules

- While answering, Ember can record a recurring finding it derived from the project's review data.
- A recorded insight is attached to the project Ember is answering about; it never crosses into another project's memory.
- An empty or blank insight is never recorded.
- The same insight is never recorded twice — a repeated finding does not pile up.
- Recording writes only to Ember's private per-project memory — never to reviews, threads, files, or configuration; read-only over project state is preserved.
- Recording is best-effort: if it fails, the answer still completes.
- Ember records only through the operator's Claude subscription — never an Anthropic API key.

## Scenarios

- record nominal: {Ember derives "projet X régresse chaque vendredi" pendant une réponse} → constat ajouté à la mémoire du projet + réutilisé à la question suivante sans recalcul
- empty insight: {insight: ""} → rien enregistré
- duplicate insight: {insight: "projet X régresse chaque vendredi", déjà présent} → aucun doublon ajouté
- per-project isolation: {insight enregistré pour le projet A} → n'apparaît jamais dans la mémoire ni les réponses du projet B
- record failure non-fatal: {écriture mémoire échoue} → la réponse aboutit quand même
- api key present: {anthropicApiKey: "set"} → Ember n'agit pas du tout (safeguard hérité, aucune écriture mémoire)

## Out of Scope

- Heuristics that decide what counts as "recurring" — that judgment is Ember's own, expressed by choosing to record; this spec builds no parser of Ember's prose.
- Editing or deleting an individual recorded insight through the UI — Phase C already offers clearing a project's whole memory.
- Cross-project insights or a global memory — per-project only, carried from SPEC-192.
- Recording arbitrary facts or operator preferences — only recurring review findings.

## Glossary

| Term | Definition |
|------|------------|
| Recurring insight | A finding Ember derived from review data (e.g. a project that regresses every Friday), recorded so it is reused without recomputation. |
| Record | Ember persisting a derived insight into its own private per-project memory during an answer — never a write to project state. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Builds on SPEC-192's `appendInsight` and per-project memory, both implemented; no in-flight dependency. |
| Negotiable | OK | Fixes the WHAT (Ember can record a derived insight, deduped, per-project, non-fatal); the HOW (MCP tool vs endpoint, dedup strategy) is left open. |
| Valuable | OK | Completes Phase C's deferred half — Ember now both derives/records and reuses insights, instead of only reusing pre-seeded ones. |
| Estimable | OK | Small surface over an existing write path; the review module's `add_action` MCP tool is a direct precedent. |
| Small | OK | One recording entry point + dedup + tests; well under the file budget. |
| Testable | OK | Every rule maps to a scenario; dedup, isolation, empty-reject, and non-fatal failure each have one. |

Verdict: **READY (pending user validation)** — no KO.

## Notes for implementation (non-normative)

- Mirror the review path's MCP tool precedent: `src/modules/review-execution/interface-adapters/controllers/mcp/addAction.handler.ts` + `usecases/mcp/addAction.usecase.ts`, exposed via `src/mcp/mcpServerStdio.ts`. Expose a `record_insight` tool whose handler calls the existing `EmberMemoryGateway.appendInsight`, with dedup added (either in the use case or the gateway).
- Ember's `--bg` answer run already has MCP available; the tool is the structured signal the deferral was waiting for.
- The no-API-key safeguard is already enforced upstream in `askEmber` before the run starts, so an api-key-present case never reaches the recording path.
- Dedup makes `appendInsight` idempotent for identical findings — decide whether to also normalize (trim/case) before comparing.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist. Specific to this spec:

- [ ] Ember can record a derived recurring insight during an answer; it is reused in a later answer without recomputation — verified by test
- [ ] An empty/blank insight is never recorded — verified by test
- [ ] Recording the same insight twice does not create a duplicate — verified by test
- [ ] A recorded insight never crosses into another project's memory — verified by test
- [ ] A failing memory write does not break the answer — verified by test
- [ ] No write path on project state is added; recording targets only the private notebook — verified by test
