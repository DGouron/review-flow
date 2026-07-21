# Report — spec-220 project-derived review audit scope

> Spec: `docs/specs/220-project-derived-review-audit-scope.md`
> Plan: `docs/plans/220-project-derived-review-audit-scope.plan.md`
> Status: **implemented**

## Summary

Reviews no longer assert principles the reviewed project never adopted. The set of audits a
review runs and may mention — the **review audit scope** — is now resolved per project
(`config.audits` → `config.agents` → auto-detect from the project's own `CLAUDE.md` /
`.claude/skills/` → focus defaults, fail-safe to focus defaults). The resolved scope drives both
the dashboard progress labels and the report, the latter via an authoritative
`## REVIEW AUDIT SCOPE` block injected into `buildMcpSystemPrompt` that overrides the shipped
review skill's default audit list.

## Files created

| File | Role |
|------|------|
| `src/modules/review-execution/entities/progress/principleCatalog.type.ts` | Fixed 9-principle catalog (name → displayName + CLAUDE.md keywords), `CATALOG_ORDER`, `isCatalogPrinciple`, `catalogAgentDefinition`, pure `detectDeclaredPrinciples` (exact match, no NLP) |
| `src/modules/review-execution/entities/progress/projectPrinciples.gateway.ts` | `ProjectPrinciplesGateway` contract + `DeclaredPrincipleSignals` type |
| `src/modules/review-execution/interface-adapters/gateways/fileSystem/projectPrinciples.fileSystem.gateway.ts` | Thin filesystem reader (`CLAUDE.md` content + `.claude/skills/` dir names), no matching |
| `src/modules/review-execution/usecases/resolveAuditScope.usecase.ts` | Pure 4-step precedence resolver, fail-safe to focus defaults |
| `src/frameworks/claude/auditScopeDirective.ts` | `buildAuditScopeDirective(scope)` — authoritative prompt block; `''` when empty |
| `src/tests/stubs/projectPrinciples.stub.ts` | `StubProjectPrinciplesGateway` with configurable signals |
| `src/tests/acceptance/project-derived-review-audit-scope.acceptance.test.ts` | SDD outer loop, all spec scenarios |
| + unit test mirrors for catalog, resolver, directive, gateway impl | |

## Files modified

| File | Change |
|------|--------|
| `src/modules/review-execution/entities/progress/agentDefinition.type.ts` | `withMetaSteps(scope)` — appends `threads`/`report`, de-duplicated; `DEFAULT_*_AGENTS` untouched |
| `src/modules/review-execution/entities/job/reviewJob.ts` | Optional `auditScope?: AgentDefinition[]` (principle-only) |
| `src/frameworks/claude/claudeInvoker.ts` | `buildMcpSystemPrompt` injects `buildAuditScopeDirective(job.auditScope ?? [])` |
| `src/config/projectConfig.ts` | `audits?: string[]` parsed + validated against the catalog (invalid entry throws, naming it) |
| `.../controllers/webhook/gitlab.controller.ts` | Processor resolves scope, sets `j.auditScope`, progress `agents = withMetaSteps(scope)`; deps interface gains `projectPrinciplesGateway` + `resolveAuditScope` |
| `.../controllers/webhook/github.controller.ts` | Same as GitLab |
| `src/main/routes.ts` | Instantiate `ProjectPrinciplesFileSystemGateway` + `ResolveAuditScopeUseCase` once; injected into both processor and webhook deps objects |
| Controller + config + invoker unit tests | Extended for new deps and scope assertions |

## Verification

`yarn verify` — **green**: `tsc --noEmit` clean, oxlint (warnings only, pre-existing tracked
debt), `oxfmt --check` clean, `vitest --run` **503 files / 4227 tests passed**.

Production path confirmed end-to-end: both GitLab and GitHub processors read config + project
signals, resolve the scope, set `j.auditScope`, and feed `withMetaSteps(scope)` to progress;
`buildMcpSystemPrompt` injects the audit-scope directive at the system-prompt tail (line 437).

## Spec coverage

| Rule / scenario | Covered by |
|-----------------|-----------|
| explicit `audits` win | `resolveAuditScope.usecase.test.ts` + acceptance |
| `agents` fallback (minus meta) | resolver test + acceptance |
| auto-detect from `CLAUDE.md` | `principleCatalog.type.test.ts` + `projectPrinciples.fileSystem.gateway.test.ts` + acceptance |
| auto-detect from skills dir | catalog + gateway impl tests + acceptance |
| auto-detect empty → focus defaults | resolver test (fail-safe) + acceptance |
| no config → `DEFAULT_AGENTS` unchanged | resolver test + acceptance |
| invalid audit name rejected at parse | `projectConfig.test.ts` |
| report scope injection block | `auditScopeDirective.test.ts` + `claudeInvoker.test.ts` |
| meta steps always present | `agentDefinition.type.test.ts` + acceptance |

## Decisions / deviations

- **`auditScope` threaded onto `ReviewJob`** (optional), resolved once in each processor — keeps
  progress labels and report in lockstep and `buildMcpSystemPrompt` a pure function of `job`.
- **No factory for the catalog** — it is a fixed constant, not a mutable entity; a stub is
  provided for the one new gateway (anti-overengineering, per the plan's scope challenge).
- **Shipped `review-*/SKILL.md` untouched** — the runtime directive overrides them; markdown
  stays the default when no scope is injected (backward compatible).
- Orchestrator completed the composition-root + `github.controller.test.ts` deps wiring that the
  implementer left unfinished, and formatted 4 files, to bring `yarn verify` to green.
