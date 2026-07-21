# Respect the project's own principles when choosing review audits

## Status: implemented

## Context

Today a review always runs and mentions the same hardcoded audit set — Clean Architecture,
DDD, SOLID, etc. This set lives in two disconnected places: the dashboard progress labels
(`agentDefinition.type.ts` `DEFAULT_*_AGENTS`) and the shipped review skill markdown
(`.claude/skills/review-*/SKILL.md`), which dictates what the report covers. Neither reads the
reviewed project's own conventions. So a project whose `CLAUDE.md` never mentions Clean
Architecture still gets "Clean Archi" in the live progress and a Clean Architecture section in
the report.

The reviewed set of principles — the **review audit scope** — must instead be derived per
project: explicit config wins; otherwise it is auto-detected from the project's own declared
principles; only as a last resort does it fall back to the focus defaults. The resolved scope
must drive both the live progress labels and the report content.

## Rules

- the **review audit scope** is the ordered list of principle audits a review runs and is
  allowed to mention, excluding the meta steps `threads` and `report` which are always present
- the scope is resolved per project in this precedence order:
  1. `.claude/reviews/config.json` `audits` (array of principle names) — used verbatim
  2. else `.claude/reviews/config.json` `agents` (existing array) — its principle entries
     (every entry except `threads` and `report`) become the scope
  3. else auto-detected from the reviewed project's declared principles (see below)
  4. else the focus defaults (`DEFAULT_FRONT_AGENTS` / `DEFAULT_BACK_AGENTS` /
     `DEFAULT_FULLSTACK_AGENTS` / `DEFAULT_DOC_AGENTS`)
- a principle is **declared** by the reviewed project when its name matches, case-insensitively,
  either a `.claude/skills/<principle>/` directory or a keyword occurrence in the project's
  root `CLAUDE.md`; matching is exact against the fixed catalog below — no fuzzy/NLP inference
- the **principle catalog** (name → CLAUDE.md keywords):
  - `clean-architecture` → "clean architecture", "clean-architecture"
  - `ddd` → "ddd", "domain-driven", "domain driven"
  - `solid` → "solid"
  - `clean-code` → "clean code", "clean-code"
  - `react-best-practices` → "react"
  - `testing` → "testing", "tdd"
  - `security` → "security"
  - `performance` → "performance"
  - `code-quality` → "code quality", "code-quality"
- auto-detection is fail-safe: if it resolves to an empty scope (no catalog principle declared),
  the resolver falls through to the focus defaults — a review is never left with zero principles
- the resolved scope drives the **dashboard progress labels** ("review en cours"): only the
  resolved principles plus `threads` and `report` are shown, in resolution order
- the resolved scope drives the **report**: the Claude system prompt carries an authoritative
  audit-scope section listing exactly the resolved principles, instructing Claude to run and
  mention ONLY those and to skip any principle not in scope; this instruction overrides the
  default audit list in the review skill markdown
- a project that declares no config and matches nothing behaves exactly as today (focus
  defaults), so existing reviews are unchanged
- `audits` entries that are not in the catalog are rejected with a clear config error

## Scenarios

- explicit audits win: {config.audits: ["solid","testing"]} → scope = [solid, testing]; progress shows SOLID, Testing, Threads, Rapport; system prompt lists only solid + testing
- agents fallback: {no audits, config.agents: [{name:"solid",...},{name:"threads",...},{name:"report",...}]} → scope = [solid]
- autodetect from CLAUDE.md: {no audits, no agents, focus: back, project CLAUDE.md mentions "SOLID" and "testing" but never "Clean Architecture"} → scope = [solid, testing]; no clean-architecture in progress or report
- autodetect from skills dir: {project has .claude/skills/clean-architecture/ and .claude/skills/ddd/, CLAUDE.md empty} → scope = [clean-architecture, ddd]
- autodetect empty → focus defaults: {no config, CLAUDE.md matches no catalog keyword, focus: front} → scope = DEFAULT_FRONT_AGENTS principles
- no config at all: {no .claude/reviews/config.json, focus: back} → scope = DEFAULT_BACK_AGENTS principles (unchanged behavior)
- invalid audit name: {config.audits: ["clean-architecture","made-up-principle"]} → config load throws a clear error naming the invalid entry
- report scope injection: {resolved scope = [solid, testing]} → buildMcpSystemPrompt output contains an audit-scope block naming solid + testing and an instruction to skip out-of-scope principles
- meta steps always present: {resolved scope = [solid]} → progress = SOLID, Threads, Rapport (threads/report never dropped even if absent from config)

## Out of Scope

- Rewriting the shipped `.claude/skills/review-*/SKILL.md` audit lists — the runtime system-prompt
  injection overrides them; the markdown stays as the default when no scope is injected
- Fuzzy / semantic detection of principles (embeddings, LLM classification) — exact catalog match only
- Making the principle catalog itself user-editable at runtime
- Follow-up reviews (`review-followup`) audit scope — their agents are a different meta set
- Per-audit custom `displayName` beyond what the existing `agents` config already allows
- Detecting principles from files other than root `CLAUDE.md` and `.claude/skills/` dir names

## Glossary

| Term | Definition |
|------|------------|
| review audit scope | Ordered list of principle audits a review runs and may mention, excluding `threads`/`report` |
| declared principle | A catalog principle the reviewed project surfaces via a `.claude/skills/<name>/` dir or a `CLAUDE.md` keyword |
| principle catalog | Fixed name→keyword table of the principles ReviewFlow knows how to audit |
| meta step | `threads` and `report` — always-present non-principle progress steps |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reuses `AgentDefinition` + existing config resolution; adds one resolver + one prompt section |
| Negotiable | OK | Catalog keywords and detection sources left tunable |
| Valuable | OK | Reviews stop asserting principles the project never adopted |
| Estimable | OK | One entity (catalog), one resolver use case, config parse addition, two consumers |
| Small | OK | <14 files |
| Testable | OK | Each rule maps to a scenario; resolver is pure |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

See `docs/reports/220-project-derived-review-audit-scope.report.md` for the full report.

### Artefacts

- **Entity (new)**: `principleCatalog.type.ts` — fixed 9-principle catalog + pure `detectDeclaredPrinciples` (exact match, no NLP); `withMetaSteps` added to `agentDefinition.type.ts`.
- **Gateway (new)**: `ProjectPrinciplesGateway` contract + `projectPrinciples.fileSystem.gateway.ts` (reads `CLAUDE.md` + `.claude/skills/` dir names) + stub.
- **Use case (new)**: `resolveAuditScope.usecase.ts` — pure 4-step precedence (`audits` → `agents` → auto-detect → focus defaults), fail-safe.
- **Framework (new)**: `auditScopeDirective.ts` — authoritative `## REVIEW AUDIT SCOPE` prompt block, injected in `buildMcpSystemPrompt`.
- **Config (modified)**: `projectConfig.ts` gains `audits?: string[]` with catalog validation (invalid entry throws).
- **Job (modified)**: `ReviewJob.auditScope?` threads the resolved scope to the invoker.
- **Controllers (modified)**: `gitlab.controller.ts` + `github.controller.ts` processors resolve scope, set `j.auditScope`, feed `withMetaSteps(scope)` to progress.
- **Wiring**: `routes.ts` instantiates the gateway + use case once, injects into both platforms.

### Decisions

- Resolved scope threaded onto `ReviewJob` (resolved once per processor) keeps progress labels and report in lockstep; `buildMcpSystemPrompt` stays a pure function of `job`.
- Shipped `review-*/SKILL.md` left untouched — the runtime directive overrides them; markdown stays the default when no scope is injected (backward compatible).
- No factory for the catalog (fixed constant, not a mutable entity).
