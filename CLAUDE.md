# ReviewFlow CLAUDE.md

## Quick start

New here? Read **[docs/HARNESS-ONBOARDING.md](docs/HARNESS-ONBOARDING.md)** first — covers the 5 key commands, active hooks, and the SDD pipeline.

## Behavior

Important: Each response will start with "I read the rules." This demonstrates you have followed our guidelines.

Always challenge me when relevant and be straightforward without sugarcoating.

Always evaluate the scope of what's being asked and tell me if it's too broad or vague.

Since I'm allergic to technical comments in code, only add them if vital for understanding. This means you've already named functions, files, variables, and folders in a way that screams intent.

## Language Rules

- **Documentation**: English
- **Technical** (code, tests, commits, logs): English

## Project Overview

ReviewFlow is an AI-powered code review automation tool for GitLab/GitHub using Claude Code. It receives webhooks from merge requests/pull requests, queues review jobs, invokes Claude for automated code review, and posts inline comments and review reports back to the platform.

Check `package.json` for all package versions.

## Development Commands

### Essential Commands
```bash
yarn dev                 # Start dev server (tsx watch)
yarn build               # Build TypeScript + resolve aliases + copy assets
yarn start               # Start production server
yarn typecheck           # TypeScript validation only
yarn lint                # Oxlint check
yarn lint:fix            # Auto-fix linting issues
yarn format              # Format with oxfmt
yarn format:check        # Check formatting without writing

# Testing
yarn test                # Run tests with UI
yarn test:ci             # Run tests in CI mode
yarn coverage            # Generate coverage report

# Quality
yarn verify              # Run typecheck + lint + test:ci (run before commits)

# Documentation
yarn docs:dev            # VitePress dev server
yarn docs:build          # Build docs
yarn docs:preview        # Preview built docs
```

### Quality Assurance
Always run `yarn verify` before committing. This runs TypeScript validation, linting, and tests.

## Architecture

- **Style**: Clean Architecture (Uncle Bob)
- **DDD**: Strategic level only (Bounded Contexts, Ubiquitous Language)
- **Modules**: Organized by layer (`src/entities/`, `src/usecases/`, `src/interface-adapters/`, `src/frameworks/`)

### Principles

- **Clean Architecture definitions take precedence** over DDD tactical patterns
- **Dependency Rule**: Dependencies point inward only
- **SOLID Principles**: SRP & DIP as pillars

### Key Patterns

- **Gateway Pattern**: All external data access through interfaces
- **Factory Pattern**: Object creation with validation in domain layer
- **Use Case Pattern**: Each business action encapsulated in a dedicated use case class

### Foundation Utilities

**IMPORTANT**: Before creating new utilities, check `src/shared/foundation/` for existing tools:

| Module | Purpose | Usage |
|--------|---------|-------|
| `guard/` | Type-safe validation with Zod | `createGuard(schema, 'context')` |
| `usecase/` | Base use case interface | `UseCase<Input, Output>` |
| `executionGateway.base.ts` | Base class for CLI command execution | Handles build/execute/skip pattern |

Always prefer existing foundation utilities over creating new ones.

### Dependency Injection

Controllers receive dependencies via a typed `Dependencies` interface parameter. Instantiation happens in the composition root (`src/main/routes.ts`), not inside controllers.

```typescript
// Interface definition in controller file
export interface WebhookDependencies {
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  trackAssignment: TrackAssignmentUseCase;
}

// Controller receives deps as parameter
export async function handleWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  deps: WebhookDependencies
): Promise<void> {
  const { trackAssignment } = deps;
  // ...
}

// Composition root (routes.ts) — only place for instantiation
app.post('/webhooks/gitlab', async (request, reply) => {
  await handleWebhook(request, reply, deps.logger, {
    reviewContextGateway: deps.reviewContextGateway,
    threadFetchGateway: new GitLabThreadFetchGateway(executor),
    trackAssignment: new TrackAssignmentUseCase(trackingGw),
  });
});
```

### Interface Adapters (Anti-Corruption Layer)

```
External World (GitLab API, GitHub API, CLI, File System)
    │
    ▼
INTERFACE ADAPTERS (ACL): Gateway | Controller | Presenter
    │
    ▼
APPLICATION LAYER (Use Cases)
    │
    ▼
DOMAIN LAYER (Entities, Business Rules)
```

| Adapter | Direction | Responsibility |
|---------|-----------|----------------|
| **Gateway** | External <-> Domain | Handles communication with external systems (APIs, CLI, DB). Isolates use cases from infrastructure. |
| **Controller** | Inbound -> Application | Transforms webhook/HTTP events into use case calls. |

**Rules**:
- Interface Adapters NEVER contain business logic
- They can transform, validate, and adapt data
- Internal structures (domain) must NEVER leak outside without going through an adapter
- Dependency always points inward (Dependency Rule)

## Testing

### Approach: Inside-Out (Detroit School)

**Direction**: Start from Domain, work outward to Controllers

| Principle | Description |
|-----------|-------------|
| **Test state** | Verify final result, not how we got there |
| **Inside-Out** | Start from domain, work outward |
| **Minimal mocks** | Only for external I/O (gateways, CLI, file system) |
| **Robust tests** | Resistant to internal refactoring |

- **Framework**: Vitest
- **Absolute Rule**: Never write production code without a failing test first
- **Cycle**: Red -> Green -> Refactor
- **Language**: Tests in **English** (code, descriptions, names)

### Coverage Requirements

Statements 80%, Branches 80%, Functions 80%, Lines 80% — enforced via `coverage.thresholds` in `vitest.config.ts` (`yarn coverage` fails below).

### Test Structure

All tests in `/src/tests/` mirroring source code:

```
/src/tests/
├── acceptance/               # Acceptance tests (outer loop SDD — spec → test)
├── units/                    # Unit tests (mirror of /src/)
├── factories/                # Factories to create test data
├── helpers/                  # Shared test helpers
├── stubs/                    # Stub gateways for external dependencies
└── mocks/                    # Mock data
```

### Factories

- **Location**: `/src/tests/factories/`
- **Convention**: `<entity>.factory.ts`
- **Usage**: Always use factories in tests, never hardcoded data

## Technology Stack

- **Node.js >= 20** with ES modules (`"type": "module"`)
- **TypeScript 5.8+** with strict configuration
- **Fastify 5** for HTTP server and webhooks
- **Zod 4** for runtime validation and guards
- **Pino** for structured logging
- **p-queue** for review job queuing with concurrency control
- **MCP SDK** (`@modelcontextprotocol/sdk`) for Model Context Protocol server
- **Vitest** for testing
- **Oxlint** for linting + **oxfmt** for formatting (architecture rules enforced via `no-restricted-imports` overrides)
- **VitePress** for documentation site

## Code Quality

### Naming Conventions

- **Full words**: Always use complete words. Never use abbreviations.
  - Allowed: `existing`, `index`, `context`, `gateway`
  - Forbidden: `ex`, `i`, `idx`, `ctx`, `gw`

### File Naming Rules

- **TypeScript files (.ts)**: camelCase (`reviewContext.gateway.ts`, `trackAssignment.usecase.ts`)
- **Classes in files**: Even if the class is `PascalCase`, the file name stays camelCase
- **Imports**: ALWAYS use alias `@/`, NEVER relative paths `../`. The `.js` extension is MANDATORY (NodeNext module resolution).
  ```typescript
  // Forbidden: relative paths
  import { foo } from "../../../entities/foo";

  // Forbidden: missing .js extension
  import { foo } from "@/entities/foo";

  // Correct: alias + .js extension
  import { foo } from "@/entities/foo.js";
  ```
  This applies to ALL files: source code AND tests.
- **Test files**: Located in `/src/tests/` mirroring source structure + `.test.ts` suffix
- **Types**: Capitalized (`TrackedMr`, `ReviewContext`) - NO "Type" suffix when using `type`
- **Interfaces**: NO prefix - aligned with Clean Code and ubiquitous language
  - Allowed: `ReviewContextGateway`, `ThreadFetchGateway`
  - Forbidden: `IReviewContextGateway`, `IThreadFetchGateway`
- **Comments**: AVOID systematic comments, prefer self-documenting code
- **JSDoc**: Use for public APIs (this is NOT considered a comment)
- **Type vs Interface**: `type` for data shapes, `interface` for contracts/extending

### Type Assertions (as Type)

**FORBIDDEN**: Type assertions (`as Type`, `as unknown as Type`) bypass TypeScript's type checking.

Use instead:
- **Guards** with Zod schema validation for external data
- **Type narrowing** (`if`, `typeof`, `instanceof`)
- **Optional chaining** + **nullish coalescing** (`?.`, `??`)

### No `undefined`, No Primitive Obsession

- **`undefined` is banned** in domain types — use `null` for intentional absence
- **Primitives should be wrapped** in domain types using branded types (zero runtime cost):
  ```typescript
  type MergeRequestId = string & { readonly __brand: 'MergeRequestId' };
  ```

### Async Patterns

**MANDATORY**: Use `async/await` with `try/catch/finally`. Never use `.then()/.catch()` chains.

## Backlog Management

**Two distinct backlogs** (Shiplens-style):

| Backlog | Source of truth | Used for |
|---------|----------------|----------|
| **Features** | `docs/specs/<n>-<slug>.md` + `docs/feature-tracker.md` | New capabilities, enhancements, refactorings |
| **Bugs** | [GitHub Issues](https://github.com/DGouron/review-flow/issues) | Reproducible defects only |

### Rules

- **GitHub Issues are reserved for bugs.** No features, no refactors, no docs tickets.
- **Features live in `docs/specs/`** — produced by `/product-manager`, indexed in `docs/feature-tracker.md` (status: `drafted` → `planned` → `implementing` → `implemented`).
- **One spec = one feature.** Implementation reports go to `docs/reports/<feature>.report.md`.
- **Labels on bug issues**: priority (`P1-critical`, `P2-important`, `P3-nice-to-have`) and scope (`cli`, `dashboard`, `mcp`, `webhook`, etc.).
- Use conventional commit format. PRs reference the spec slug (`feat(webhook): implement spec-046 github followup`) or the bug issue (`fix: #46 plain-bug-description`).

### Workflow

```
New idea / improvement → /product-manager → docs/specs/<n>-<slug>.md
                                          ↓
                                  feature-tracker.md (drafted)
                                          ↓
                                  /implement-feature → docs/reports/<slug>.report.md
                                          ↓
                                  feature-tracker.md (implemented)

Bug found → gh issue create --label bug,P{1,2,3},scope
         → fix on branch → PR closes issue
```

## Git Workflow

### Branch Strategy
- Main branch: `master`
- Feature branches: `feat/<issue-number>-description`
- Conventional commits with commitlint validation

### Before Committing
1. Run `yarn verify` to validate code quality
2. Ensure tests pass with `yarn test:ci`
3. Follow conventional commit format

### Before Creating a Pull Request
1. Run `yarn verify` locally to catch lint/type/test errors before pushing
2. Fix any issues found, commit, and push
3. Only then create the PR

### Linting & Formatting
- **Oxlint** for linting, **oxfmt** for formatting (`.oxlintrc.json` / `.oxfmtrc.json`)
- Run `yarn lint:fix` and `yarn format` for auto-corrections
- Dependency Rule and size limits (functions ≤30 lines, files ≤200, params ≤3) checked by oxlint — size limits are warnings (tracked debt)

## Refactoring

- **Guideline**: https://refactoring.guru/refactoring/smells
- **Techniques**: Mikado and Strangler Pattern
- **Focus**: Dead code, unused imports, ubiquitous language, deprecated elements

## Available Skills

### Mandatory Skills (MUST use before coding)

**CRITICAL**: These 3 skills are MANDATORY before writing any production code:

| Skill | When to use | Why mandatory |
|-------|-------------|---------------|
| `/tdd` | **ALWAYS** before writing/modifying code | No code without failing test first |
| `/architecture` | Creating new components (entity, use case, gateway) | Ensures Clean Architecture compliance |
| `/anti-overengineering` | Before adding patterns, abstractions, or "improvements" | Prevents over-complexity, validates YAGNI |

**Workflow**:
1. `/anti-overengineering` -> Challenge if the approach is justified
2. `/architecture` -> Design the component structure
3. `/tdd` -> Implement with Red-Green-Refactor cycle

### SDD Pipeline (Spec-Driven Development)

```
/product-manager → spec DSL in docs/specs/ (Rules + Scenarios)
/implement-feature docs/specs/XX.md → plan (persisted) + acceptance RED + TDD + acceptance GREEN + report (persisted)
/commit → hooks verify spec/tracker → commit + push
```

- **Outer loop** (SDD): Acceptance test created FIRST, stays RED during implementation, passes GREEN when spec is satisfied
- **Inner loop** (TDD): RED-GREEN-REFACTOR per file, inside-out (entity → use case → controller)
- **Feature tracker**: `docs/feature-tracker.md` tracks status (drafted → planned → implementing → implemented)
- **Plans persisted**: `docs/plans/<feature>.plan.md`
- **Reports persisted**: `docs/reports/<feature>.report.md`

### Feature Pipeline Skills

| Skill | When to use |
|-------|-------------|
| `/implement-feature` | Autonomous feature implementation (planner + TDD implementer agents) |
| `/refactor-feature` | Spec-driven refactoring with contract tests + batch execution |
| `/product-manager` | Spec tickets, challenge scope, RICE scoring (`/product-manager rice #XX`) |
| `/agent-creator` | Design new Claude Code agents with patterns and checklist |

### Optional Skills

| Skill | When to use |
|-------|-------------|
| `/refactoring` | Migration, library replacement, module splitting |
| `/ddd` | Split domain, define ubiquitous language |
| `/security` | Scan for secrets before commit, detect tokens and API keys |
| `/solid` | Apply SOLID principles from Clean Architecture |
| `/create-doc` | Creating new documentation files |
| `/update-docs` | Updating docs after code changes |
| `/audit-docs` | Auditing documentation quality |
| `/docs-index` | Generating/updating centralized documentation index |

## Universal Rules (.claude/rules/)

These rules ALWAYS apply:
- [Anti-hallucination](rules/anti-hallucination.md) -- verify before asserting
- [Reformulation](rules/reformulation.md) -- reformulate if prompt is vague
- [Prompt-structure](rules/prompt-structure.md) -- 4 mandatory blocks
- [Scope-discipline](rules/scope-discipline.md) -- one change = one scope = one commit
- [Coding-standards](rules/coding-standards.md) -- naming, imports, architecture layers, testing

## Roles (.claude/roles/)

| Role | File | When |
|------|------|------|
| Senior Dev | `senior-dev.md` | Default, always active |
| Code Reviewer | `code-reviewer.md` | Code review |
| Mentor | `mentor.md` | Explaining a concept |
| Architect | `architect.md` | Architecture decisions |
| Documentalist | `documentalist.md` | Documentation tasks |
| Specifier | `specifier.md` | Specifications & discovery |

## Agents (.claude/agents/)

| Agent | Role loaded | When |
|-------|-------------|------|
| feature-planner | architect | Plan feature implementation (read-only, produces structured plan) |
| feature-implementer | senior-dev | Implement features via TDD with self-review loop |
| architect | architect | Design & implement features |
| reviewer | code-reviewer | Pre-PR code review |
| product-manager | specifier | Specs & discovery |
| documentalist | documentalist | Documentation management |
| open-source | -- | OSS health (README, CHANGELOG) |
| pair-programming | senior-dev | Implement together |
| debug | senior-dev | Diagnose a bug |
| mentor | mentor | Explain a concept |
| tdd | senior-dev | Double Loop ATDD/TDD |

## Hooks (.claude/settings.json)

Deterministic barriers enforced via PreToolUse hooks:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `no-barrel-exports.sh` | Write\|Edit | Blocks `index.ts` creation |
| `protect-main-branch.sh` | git commit | Blocks commit on master |
| `pre-commit-gate.sh` | git commit | Runs tests before commit |
| `verify-spec-updated.sh` | git commit | Checks spec status before commit |
| `protect-main-push.sh` | git push | Blocks push to master and force push |
| `require-spec.sh` | Agent | Blocks feature agents without spec |
| `session-context.sh` | SessionStart | Injects feature tracker status |

Scripts: `scripts/hooks/` — Tests: `scripts/hooks/tests/run-tests.sh`

## Commands (.claude/commands/)

| Command | Description |
|---------|-------------|
| `/status` | Full diagnostic: tests, types, lint, debt, git |
| `/test` | Test verification: results, coverage, untested files |
