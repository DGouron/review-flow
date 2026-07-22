# Plan — spec-220 project-derived review audit scope

> Source spec: `docs/specs/220-project-derived-review-audit-scope.md`
> Layer order: Entity -> Schema/Guard -> Gateway contract -> Use case -> Gateway impl -> Framework/Controller -> Wiring. Each file has a `src/tests/units` mirror. Acceptance test drives the outer loop.

```
PLAN:
  scope: project-derived-review-audit-scope
  is_new_module: false   # extends the existing review-execution module
```

## Scope challenge (/anti-overengineering)

- **Reuse `AgentDefinition`** — no parallel type. The audit scope is `AgentDefinition[]` (principle entries only, meta steps excluded). Honored.
- **No new data-shape entity requiring a factory.** The catalog is a fixed constant, the scope is `AgentDefinition[]` (reuse existing agent literals / `reviewJob.factory.ts`), auto-detect input is a small signal record. A dedicated `*.factory.ts` would be boilerplate over business logic — **skipped intentionally** (project rule "factory for each new entity" does not apply: no new mutable entity is introduced). A stub IS created for the one new gateway.
- **No presenters/views.** Progress labels already render `AgentDefinition[]`; the report is a Claude-side artifact driven by the system prompt. No ViewModel work.
- **Matching logic is pure and lives in the catalog entity**, not in the gateway — the gateway is a thin filesystem reader returning raw signals. Keeps I/O dumb and matching unit-testable without the filesystem.
- **`buildMcpSystemPrompt` stays a pure function of `job`** — no new gateway/DI inside the invoker (see decision below).

## Key decision — how the resolved scope reaches `buildMcpSystemPrompt`

**Recommendation: thread a `auditScope?: AgentDefinition[]` field onto `ReviewJob` (principle-only), resolved once at execution time in the processor builder.**

Rationale:
- Both consumers run at execution time and close together: the processor builder sets progress `agents` (via `runGitLab/GitHubReview`) and downstream `invokeClaudeReview` calls `buildMcpSystemPrompt(job)`. Resolving once and storing on the job guarantees progress labels and the report agree — no double resolution, no drift.
- `buildMcpSystemPrompt(job)` stays pure: it reads `job.auditScope` and injects the section. No `ProjectPrinciplesGateway` wiring is pushed into the invoker.
- When `auditScope` is absent/empty the invoker injects nothing — the shipped SKILL.md audit list remains the default (matches Out-of-Scope: "markdown stays as the default when no scope is injected"). Backward compatible.
- Alternative (compute inside the invoker from `job.localPath`) rejected: duplicates gateway wiring, resolves twice, and adds filesystem I/O to a currently-pure prompt builder.

The field is optional so the hundreds of existing `ReviewJob` construction sites and tests remain valid.

---

## ENTITIES

- **name: PrincipleCatalog** (fixed catalog + pure matching) — **NEW**
  - file: `src/modules/review-execution/entities/progress/principleCatalog.type.ts`
  - exports:
    - `PrincipleName` — union type of the 9 catalog names (`clean-architecture` | `ddd` | `solid` | `clean-code` | `react-best-practices` | `testing` | `security` | `performance` | `code-quality`)
    - `PRINCIPLE_CATALOG: Record<PrincipleName, { displayName: string; keywords: string[] }>` — name -> displayName (reuse the exact displayNames already in `DEFAULT_*_AGENTS`, e.g. `clean-architecture` -> `Clean Archi`) + CLAUDE.md keywords from the spec table
    - `CATALOG_ORDER: PrincipleName[]` — deterministic order used to sort detected principles (drives progress/report ordering; matches the spec scenarios `[solid, testing]`, `[clean-architecture, ddd]`)
    - `isCatalogPrinciple(value: unknown): value is PrincipleName`
    - `catalogAgentDefinition(name: PrincipleName): AgentDefinition` — `{ name, displayName: PRINCIPLE_CATALOG[name].displayName }`
    - `detectDeclaredPrinciples(signals: DeclaredPrincipleSignals): PrincipleName[]` — **pure**; a principle is declared when its name matches (case-insensitive) a `.claude/skills/<name>/` directory OR a keyword occurs (case-insensitive) in the root CLAUDE.md; returns catalog entries in `CATALOG_ORDER`, de-duplicated. Exact match only, no fuzzy inference.
  - reused: `AgentDefinition` (from `agentDefinition.type.ts`), `DeclaredPrincipleSignals` (from the gateway contract below)
  - test: `src/tests/units/modules/review-execution/entities/progress/principleCatalog.type.test.ts`
  - factory: none (fixed constant — see scope challenge)

- **modify: agentDefinition.type.ts** (meta-step helper) — **MODIFIED**
  - file: `src/modules/review-execution/entities/progress/agentDefinition.type.ts`
  - add: `THREADS_AGENT` / `REPORT_AGENT` (or reuse literals) and `withMetaSteps(scope: AgentDefinition[]): AgentDefinition[]` = `scope` followed by threads + report, de-duplicated (guarantees meta steps always present, never dropped). Keeps `DEFAULT_*_AGENTS` untouched (backward compat).
  - test: extend `src/tests/units/modules/review-execution/entities/progress/agentDefinition.type.test.ts`

- **modify: reviewJob.ts** (thread resolved scope) — **MODIFIED**
  - file: `src/modules/review-execution/entities/job/reviewJob.ts`
  - add optional `auditScope?: AgentDefinition[]` (principle-only, meta excluded). Import `AgentDefinition` type.
  - factory: update `src/tests/factories/reviewJob.factory.ts` to allow overriding `auditScope` (default: omitted).

## GATEWAYS

- **name: ProjectPrinciplesGateway** — **NEW**
  - contract: `src/modules/review-execution/entities/progress/projectPrinciples.gateway.ts`
    - `type DeclaredPrincipleSignals = { claudeMd: string | null; skillDirectoryNames: string[] }`
    - `interface ProjectPrinciplesGateway { readSignals(localPath: string): DeclaredPrincipleSignals }`
    - contract file has no unit test (pure interface); consumed via stub + impl tests
  - implementation: `src/modules/review-execution/interface-adapters/gateways/fileSystem/projectPrinciples.fileSystem.gateway.ts`
    - `ProjectPrinciplesFileSystemGateway implements ProjectPrinciplesGateway`
    - reads `<localPath>/CLAUDE.md` (`existsSync`/`readFileSync`, `null` if absent), lists directory names under `<localPath>/.claude/skills/` (`readdirSync` with dirent, directories only, `[]` if absent). Thin I/O only — no matching.
    - test: `src/tests/units/modules/review-execution/interface-adapters/gateways/fileSystem/projectPrinciples.fileSystem.gateway.test.ts` (tmp dir fixtures)
  - stub: `src/tests/stubs/projectPrinciples.stub.ts` — `StubProjectPrinciplesGateway` returning configurable signals
  - methods: `readSignals(localPath)`

## USECASES

- **name: resolveAuditScope** (pure resolver, the core of the feature) — **NEW**
  - file: `src/modules/review-execution/usecases/resolveAuditScope.usecase.ts`
  - `ResolveAuditScopeUseCase implements UseCase<Input, AgentDefinition[]>`
  - type: query (pure, no I/O — caller supplies `signals` via the gateway)
  - input: `{ audits: string[] | null; agents: AgentDefinition[] | null; focus: ReviewFocus | null; signals: DeclaredPrincipleSignals }`
  - output: `AgentDefinition[]` — principle-only scope (meta steps excluded), ready for `withMetaSteps` (progress) and `buildAuditScopeDirective` (report)
  - precedence (returns first non-empty):
    1. `audits` present -> map each name to `catalogAgentDefinition(name)` verbatim (invalid names already rejected at config parse; defensive filter here too)
    2. else `agents` present -> keep every entry except `threads`/`report`
    3. else `detectDeclaredPrinciples(signals)` -> catalog entries in `CATALOG_ORDER`
    4. else focus defaults: `focus ? defaultAgentsForFocus(focus) : DEFAULT_AGENTS`, with meta steps stripped
  - fail-safe: step 3 empty falls through to step 4 — a review is never left with zero principles. Step 4 with `focus === null` yields `DEFAULT_AGENTS` (minus meta) = **exactly today's behavior** for a project with no config that matches nothing.
  - reused: `catalogAgentDefinition`, `detectDeclaredPrinciples`, `defaultAgentsForFocus`, `DEFAULT_AGENTS`, `AgentDefinition`, `ReviewFocus`
  - test: `src/tests/units/modules/review-execution/usecases/resolveAuditScope.usecase.test.ts` — one case per spec scenario (audits win, agents fallback, autodetect CLAUDE.md, autodetect skills dir, autodetect-empty -> focus defaults, no-config -> DEFAULT_AGENTS, meta always present)

## FRAMEWORK (prompt directive) + CONTROLLERS

- **name: buildAuditScopeDirective** (mirrors `buildLanguageDirective`) — **NEW**
  - file: `src/frameworks/claude/auditScopeDirective.ts`
  - `buildAuditScopeDirective(scope: AgentDefinition[]): string` — returns an AUTHORITATIVE `## REVIEW AUDIT SCOPE` block naming exactly the resolved principle names, instructing Claude to run and mention ONLY those and to skip any principle not listed (overrides the SKILL.md default audit list). Returns `''` when `scope` is empty so the caller conditionally omits it.
  - test: `src/tests/units/frameworks/claude/auditScopeDirective.test.ts`

- **modify: claudeInvoker.ts** — **MODIFIED**
  - file: `src/frameworks/claude/claudeInvoker.ts` (`buildMcpSystemPrompt` at line 333)
  - append `buildAuditScopeDirective(job.auditScope ?? [])` into the template (only when non-empty), next to `buildLanguageDirective`. No new imports beyond the directive; no gateway.
  - test: extend the existing `buildMcpSystemPrompt` prompt test (assert the audit-scope block appears when `job.auditScope` set, absent when not).

- **modify: gitlab.controller.ts + github.controller.ts** (both processor builders) — **MODIFIED**
  - files:
    - `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` (line 825 region, `buildGitLabReviewProcessor`)
    - `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` (line 781 region, `buildGitHubReviewProcessor`)
  - in the processor closure, replace `agents: getProjectAgentsOrFocusDefaults(j.localPath) ?? DEFAULT_AGENTS` with:
    1. `const config = loadProjectConfig(j.localPath)` (already read for `qualityThreshold`)
    2. `const signals = deps.projectPrinciplesGateway.readSignals(j.localPath)`
    3. `const scope = deps.resolveAuditScope.execute({ audits: config?.audits ?? null, agents: config?.agents ?? null, focus: config?.reviewFocus ?? null, signals })`
    4. `j.auditScope = scope` (thread onto the job for `buildMcpSystemPrompt`)
    5. pass `agents: withMetaSteps(scope)` to `runGitLab/GitHubReview`
  - controllers add no business logic — precedence lives in the use case; controllers only wire config read + gateway read + use case call.
  - dependencies (injected via the existing processor `Deps` interfaces): add `projectPrinciplesGateway: ProjectPrinciplesGateway`, `resolveAuditScope: ResolveAuditScopeUseCase`
  - keep `getProjectAgentsOrFocusDefaults` / `DEFAULT_AGENTS` imports only if still referenced elsewhere in the file; otherwise remove the now-dead default branch.

## CONFIG BOUNDARY

- **modify: projectConfig.ts** — **MODIFIED**
  - file: `src/config/projectConfig.ts`
  - `ProjectConfig` (line 22): add `audits?: string[]`
  - `parseProjectConfig` (line 178): add `parsePrincipleAudits(parsed.audits)` — if present, must be a `string[]` where every entry satisfies `isCatalogPrinciple`; throw a clear error naming the invalid entry (e.g. `Invalid audit "made-up-principle": not in principle catalog`). Assign to `config.audits` when present.
  - reused: `isCatalogPrinciple` from the catalog entity (config -> entity import, dependency points inward — OK)
  - test: extend `src/tests/units/config/projectConfig.test.ts` (valid audits parsed; invalid audit name throws naming the entry; absent audits -> `undefined`)

## WIRING (last step)

- file: `src/main/routes.ts`
  - instantiate once: `const projectPrinciplesGateway = new ProjectPrinciplesFileSystemGateway()` and `const resolveAuditScope = new ResolveAuditScopeUseCase()`
  - pass both into `buildGitLabReviewProcessor` / `buildGitHubReviewProcessor` dependency objects
- dependencies: `ProjectPrinciplesFileSystemGateway` (new), `ResolveAuditScopeUseCase` (new)

## Walking Skeleton (IMPLEMENTATION_ORDER step 1)

Thinnest vertical slice crossing all layers: **explicit-`audits` branch only**, Entity (`principleCatalog`) -> Use case (`resolveAuditScope`, step 1 path) -> Framework (`buildAuditScopeDirective` + `buildMcpSystemPrompt` injection) -> acceptance scenario "report scope injection" GREEN for `{config.audits: ["solid","testing"]}`. Auto-detect, config parsing, and progress wiring are layered on afterwards.

## IMPLEMENTATION_ORDER

1. `src/modules/review-execution/entities/progress/principleCatalog.type.ts` (+ test) — foundation catalog + pure matching; everything else depends on it. Inside-out root.
2. `src/modules/review-execution/entities/progress/agentDefinition.type.ts` `withMetaSteps` (+ test) — pure meta-step guarantee, no dependencies.
3. `src/modules/review-execution/entities/progress/projectPrinciples.gateway.ts` — contract + `DeclaredPrincipleSignals` type (no test; consumed downstream).
4. `src/modules/review-execution/usecases/resolveAuditScope.usecase.ts` (+ test) — core precedence, pure; drives the walking skeleton. Uses catalog + stub signals.
5. `src/tests/stubs/projectPrinciples.stub.ts` — stub gateway for use case / controller tests.
6. `src/frameworks/claude/auditScopeDirective.ts` (+ test) — authoritative prompt block.
7. `src/modules/review-execution/entities/job/reviewJob.ts` `auditScope?` + `src/tests/factories/reviewJob.factory.ts` — thread the field.
8. `src/frameworks/claude/claudeInvoker.ts` `buildMcpSystemPrompt` injection (+ extend test) — report consumer wired.
9. `src/config/projectConfig.ts` `audits?` parse + catalog validation (+ extend test) — config precedence + invalid-name rejection.
10. `src/modules/review-execution/interface-adapters/gateways/fileSystem/projectPrinciples.fileSystem.gateway.ts` (+ test) — real filesystem I/O.
11. Controllers: `gitlab.controller.ts` + `github.controller.ts` processor builders — resolve scope, set `j.auditScope`, progress `agents = withMetaSteps(scope)` (+ extend controller tests). Progress consumer wired.
12. `src/main/routes.ts` — composition root wiring (instantiate gateway + use case, inject into processors). LAST.
13. Acceptance test flips to GREEN.

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/project-derived-review-audit-scope.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
```

Covers the spec scenarios end-to-end through `ResolveAuditScopeUseCase` + `buildAuditScopeDirective` + `withMetaSteps` (stub `ProjectPrinciplesGateway`, in-memory config): explicit audits win, agents fallback, autodetect from CLAUDE.md, autodetect from skills dir, autodetect-empty -> focus defaults, no-config -> DEFAULT_AGENTS unchanged, invalid audit name rejected at config parse, report scope injection block present, meta steps always present.

## REFERENCE_FILES

- `docs/specs/220-project-derived-review-audit-scope.md` — the spec (rules + scenarios).
- `src/config/projectConfig.ts` — config parse/validation; add `audits?`; precedence source (`ProjectConfig` at line 22, `parseProjectConfig` at 178).
- `src/modules/review-execution/entities/progress/agentDefinition.type.ts` — `AgentDefinition`, `DEFAULT_*_AGENTS` (reuse displayNames; add `withMetaSteps`).
- `src/modules/review-execution/entities/progress/reviewFocus.type.ts` — `ReviewFocus`, `defaultAgentsForFocus`, `dedupAgents` (reused by resolver + meta helper).
- `src/frameworks/claude/claudeInvoker.ts` — `buildMcpSystemPrompt` (line 333, AUTHORITATIVE injection point), invoker flow (line 444+).
- `src/frameworks/claude/languageDirective.ts` — pattern to mirror for `buildAuditScopeDirective`.
- `src/modules/review-execution/entities/job/reviewJob.ts` — `ReviewJob` shape; add `auditScope?`.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` / `github.controller.ts` — processor builders (progress `agents` resolution at lines 825 / 781).
- `src/modules/review-execution/interface-adapters/gateways/projectConfig/routingPolicy.projectConfig.gateway.ts` — reference gateway-over-config pattern.
- `src/shared/foundation/usecase.base.ts` / `guard.base.ts` — `UseCase<I,O>` and guard factory conventions.
- `src/main/routes.ts` — composition root (final wiring).
```
