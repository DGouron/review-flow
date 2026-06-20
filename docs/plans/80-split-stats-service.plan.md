# Plan — Spec #80: Split statsService into Clean Architecture Layers

> Strangler-pattern refactoring. New modules created first, consumers migrated one
> by one, old `statsService.ts` deleted last. Every step leaves a compiling codebase
> with passing tests (no broken imports between steps).

```
PLAN:
  scope: split-stats-service (spec #80)
  is_new_module: false  (refactoring — strangler pattern)
  type: refactoring (strangler)
  bounded_context: src/modules/statistics-insights/
```

## CRITICAL — Spec is stale, codebase already migrated partly

The spec was written 2026-03-14 against `src/services/statsService.ts` and `@/entities/...`.
Since then the repo migrated to a **modular monolith** (`src/modules/<context>/`). Several
spec deliverables are **already done**. The plan below reflects the ACTUAL current state
(verified file-by-file). See the `DISCREPANCIES` section for the full reconciliation.

**Already satisfied (do NOT re-implement):**
- Scenario 1, 2 (`ReviewStats` / `ProjectStats` already in
  `src/modules/statistics-insights/entities/stats/projectStats.ts`).
- Scenario 3 (`StatsGateway` contract already in
  `src/modules/statistics-insights/entities/stats/stats.gateway.ts`; the
  `interface-adapters/gateways/stats.gateway.ts` is now a 1-line re-export shim, dependency
  rule already satisfied). `FileSystemStatsGateway` and `InMemoryStatsGateway` already import
  the contract + `ProjectStats` from entities.

**Still God-Object-ish (the real remaining work):** `statsService.ts` still bundles
`parseReviewOutput`, `addReviewStats` (logic + I/O), `getStatsSummary`, `formatReviewDuration`,
`loadProjectStats`, `saveProjectStats`, `createEmptyStats`. These are what we extract.

---

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/80-split-stats-service.acceptance.test.ts
  note: "SDD outer loop — written FIRST by implementer, RED during impl, GREEN at the end.
         Mirrors the spec scenarios that represent NEW behavior to lock in:
         - parseReviewOutput (sc. 4-7) imported from @/.../entities/stats/reviewOutput.parser.js
         - AddReviewStatsUseCase (sc. 8-10) wired with InMemoryStatsGateway
         - StatsSummaryPresenter (sc. 11-13) implements Presenter<ProjectStats, StatsSummaryViewModel>
         - backward compat (sc. 14): a stats.json fixture written by the OLD format loads + flows
           through AddReviewStatsUseCase + StatsSummaryPresenter unchanged
         - GET /api/stats response shape unchanged (sc. 15) via real statsRoutes + InMemoryStatsGateway"
  reuse: model the harness on src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts
         (tmpdir + Fastify instance + InMemoryStatsGateway already established there)
```

The acceptance test must assert ZERO `from '.../services/statsService'` imports remain at the
end (use it as the executable Definition-of-Done gate, mirroring spec Scenarios 1/2/16).

---

## ENTITIES

`ProjectStats` / `ReviewStats` / `StatsGateway` are **already in entities** — no entity *types*
to create. The only NEW entity-layer file is the pure parser extracted out of the service.

```
ENTITIES:
  - name: parseReviewOutput (pure domain function — NOT a class, no invariant to protect)
    file: src/modules/statistics-insights/entities/stats/reviewOutput.parser.ts
    test: src/tests/units/entities/stats/reviewOutput.parser.test.ts
    public_api:
      export interface ParsedReviewOutput {
        score: number | null;
        blocking: number;
        warnings: number;
        suggestions: number;
        categoryBreakdown: CategoryBreakdown | null;   // already present in current impl
      }
      export function parseReviewOutput(stdout: string): ParsedReviewOutput
    move_from: src/modules/statistics-insights/services/statsService.ts:124-247
               (move parseReviewOutput + parseCategoriesSegment + the ParsedReviewOutput interface
                VERBATIM — pure, no I/O, deterministic. Do not rewrite the regex logic.)
    depends_on:
      - @/modules/statistics-insights/entities/stats/bugCategory.js (CategoryBreakdown, BUG_CATEGORY_KEYS)
      - @/modules/statistics-insights/entities/stats/categoryBreakdown.guard.js (normalizeBreakdown)
    scenarios: 4, 5, 6, 7
    notes: spec named the file reviewStats.parser.ts; we use reviewOutput.parser.ts to live next
           to projectStats.ts in the existing entities/stats/ folder and avoid clashing with the
           existing projectStats.ts. (Naming is "Negotiable" per the spec's INVEST table.)

  - name: createEmptyStats (factory helper — co-located with the entity type)
    file: src/modules/statistics-insights/entities/stats/projectStats.ts  (MODIFY — add export)
    test: covered transitively by AddReviewStatsUseCase tests + schema usage
    public_api: export function createEmptyStats(): ProjectStats
    move_from: src/modules/statistics-insights/services/statsService.ts:88-103
    scenarios: 14 (empty/new-project path)
    notes: currently a PRIVATE function inside statsService. Promote it next to ProjectStats so the
           use case and gateways share ONE source of truth (recalculateProjectStats.usecase.ts:17-30
           currently inlines its own empty-stats literal — flag as future cleanup, OUT OF SCOPE here).
```

**Schema / Zod decision — USER OVERRIDE (2026-06-19): DoD-literal, ADD the Zod schema.**
The planner initially declined the schema (anti-overengineering). The user explicitly chose the
DoD-literal version, so the schema IS created, following the module's existing
`categoryBreakdown.schema.ts` + `categoryBreakdown.guard.ts` pattern.

```
SCHEMA:
  - name: projectStats schemas (DoD calls it reviewStats.schema.ts; module naming → projectStats.schema.ts)
    file: src/modules/statistics-insights/entities/stats/projectStats.schema.ts   (NEW)
    test: src/tests/units/entities/stats/projectStats.schema.test.ts
    public_api:
      export const reviewStatsSchema = z.object({ ... })   // EXACT shape of current ReviewStats interface
      export const projectStatsSchema = z.object({ ... })  // EXACT shape of current ProjectStats interface
    type_derivation:
      In projectStats.ts, REPLACE the two hand-written interfaces with:
        export type ReviewStats = z.infer<typeof reviewStatsSchema>
        export type ProjectStats = z.infer<typeof projectStatsSchema>
      (re-export from the schema so there is ONE source of truth; type NAMES stay identical so the
       14 consumers do not change). Keep the JSDoc blocks on the exported types.
    shape_fidelity (HARD — backward compat, sc. 14):
      - Every CURRENTLY-OPTIONAL field stays `.optional()` (suggestions, assignedBy, diffStats,
        categoryBreakdown, totalScoreSum, scoredReviewCount, diffStatsReviewCount). Do NOT make them
        required — old stats.json files omit them.
      - `score: z.number().nullable()`, `averageScore: z.number().nullable()`, etc. — match `| null` exactly.
      - diffStats uses the existing DiffStats type → reuse its schema if one exists, else z.object matching
        DiffStats; categoryBreakdown reuses categoryBreakdownSchema (already in the module). Do NOT
        re-declare those shapes by hand if a schema already exists — import and compose.
  - name: projectStats guard (boundary validation — DoD: "Zod schemas validate both types at boundaries")
    file: src/modules/statistics-insights/entities/stats/projectStats.guard.ts   (NEW)
    public_api: createGuard(projectStatsSchema, 'projectStats') → export safeParseProjectStats, isValidProjectStats
    boundary_use: FileSystemStatsGateway.loadProjectStats validates parsed JSON via safeParseProjectStats.
      LENIENT fallback is MANDATORY: on safeParse FAILURE, preserve current behavior (do NOT throw —
      log + return the raw object or null as today) so a slightly-off real stats.json never crashes the
      dashboard. The acceptance test (sc. 14) loads an OLD-format fixture and asserts it still flows.
```

---

## USECASES

```
USECASES:
  - name: AddReviewStatsUseCase
    file: src/modules/statistics-insights/usecases/stats/addReviewStats.usecase.ts
    test: src/tests/units/usecases/stats/addReviewStats.usecase.test.ts
    type: command (read-modify-write through gateway)
    implements: UseCase<AddReviewStatsInput, ReviewStats>   (from @/shared/foundation/usecase.base.js)
    input:
      type AddReviewStatsInput = {
        projectPath: string;
        mrNumber: number;
        duration: number;
        parsed: ParsedReviewOutput;     // caller parses first (controllers already hold parseReviewOutput)
        assignedBy?: string;
        diffStats?: DiffStats | null;
      }
    output: ReviewStats
    dependencies (constructor injection):
      constructor(private readonly statsGateway: StatsGateway) {}
    behavior (move from statsService.ts:252-350, MINUS the I/O literal calls):
      - load via statsGateway.loadProjectStats(projectPath) ?? createEmptyStats()
      - build ReviewStats record (id = `${now}-${mrNumber}`, timestamp, etc.)
      - initializeCumulativeCounters + updateAggregatesForNewReview (move these private helpers in)
      - enforce 100-review cap: stats.reviews = stats.reviews.slice(-100)
      - statsGateway.saveProjectStats(projectPath, stats)
      - return the ReviewStats record
    scenarios: 8, 9, 10, 16
    notes:
      - Spec wrote the input as raw stdout; current architecture already calls parseReviewOutput in
        the controllers, and claudeInvoker passes result.content. To keep the use case I/O-free of
        regex concerns AND keep claudeInvoker's single call site, the use case takes the already-parsed
        ParsedReviewOutput. claudeInvoker will call parseReviewOutput(result.content) then the use case.
        (Alternative: accept stdout and parse inside — rejected: would re-couple the use case to the
        parser and duplicate what controllers already do.)
      - `addReviewStats` standalone function is DELETED with statsService.ts (sc. 16 DoD).
      - The 100-review cap currently runs AFTER aggregate update on the full array, then slices.
        Preserve that exact ordering to avoid changing averages for the >100 case (the aggregates use
        running counters totalScoreSum/scoredReviewCount, not a recompute — keep as-is, regression risk).

  - name: GetProjectStatsUseCase  — CREATED (USER OVERRIDE 2026-06-19, DoD-literal)
    file: src/modules/statistics-insights/usecases/stats/getProjectStats.usecase.ts
    test: src/tests/units/usecases/stats/getProjectStats.usecase.test.ts
    type: query (read-only through gateway)
    implements: UseCase<GetProjectStatsInput, ProjectStats | null>
    input: type GetProjectStatsInput = { projectPath: string }
    output: ProjectStats | null      ← NO createEmptyStats fallback here (see CRITICAL note)
    dependencies (constructor injection): constructor(private readonly statsGateway: StatsGateway) {}
    behavior: return this.statsGateway.loadProjectStats(input.projectPath)
    scenarios: 15 (route loads via use case)
    CRITICAL — must return null on miss, NOT createEmptyStats():
      stats.routes.ts returns `{ stats: null, summary: null }` when the project file is absent
      (verified stats.routes.ts:53). If GetProjectStatsUseCase fell back to createEmptyStats(), the
      route would return an empty-stats object instead of null → BREAKS sc. 15 (response shape unchanged).
      The createEmptyStats() load-or-empty fallback lives ONLY in AddReviewStatsUseCase (write path).
    wiring: stats.routes.ts instantiates `new GetProjectStatsUseCase(statsGateway)` and replaces BOTH
      `statsGateway.loadProjectStats(...)` call sites (path branch :53 + all-repos branch :69) with
      `getProjectStatsUseCase.execute({ projectPath })`. Presenter still only runs when result is non-null.
```

---

## PRESENTERS

```
PRESENTERS:
  - name: StatsSummaryPresenter
    file: src/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.ts
    test: src/tests/units/interface-adapters/presenters/statsSummary.presenter.test.ts
    implements: Presenter<ProjectStats, StatsSummaryViewModel>   (from @/shared/foundation/presenter.base.js)
    input: ProjectStats
    output (StatsSummaryViewModel — EXACT current getStatsSummary return shape, backward compat):
      export interface StatsSummaryViewModel {
        totalReviews: number;
        totalTime: string;          // formatReviewDuration(totalDuration)
        averageTime: string;        // formatReviewDuration(averageDuration)
        averageScore: string;       // toFixed(1) or '-'
        totalBlocking: number;
        totalWarnings: number;
        totalAdditions: number;
        totalDeletions: number;
        averageAdditions: string;   // toFixed(1) or '-'
        averageDeletions: string;   // toFixed(1) or '-'
        totalLinesReviewed: number;
        trend: { score: 'up' | 'down' | 'stable'; blocking: 'up' | 'down' | 'stable' };
      }
    move_from: src/modules/statistics-insights/services/statsService.ts:367-420 (getStatsSummary body,
               including the last-5-vs-previous-5 trend calculation)
    dependency: uses formatReviewDuration (see GATEWAYS/SHARED section — formatReviewDuration must move
                BEFORE this presenter, it is shared by analyticsHeader.presenter.ts + keyInsights.ts too)
    scenarios: 11, 12, 13
    notes:
      - present(data: ProjectStats) must keep the SAME output keys/strings as getStatsSummary so the
        GET /api/stats `summary` field is byte-identical (hard constraint, sc. 15). The acceptance test
        snapshots this.
      - Presenter<TDomain, TViewModel>.present takes ONE arg. getStatsSummary takes one arg already. Good.
```

---

## SHARED MOVE — formatReviewDuration (blocker for the presenter)

`formatReviewDuration` (statsService.ts:357-362) is imported by THREE non-test files that the spec's
migration map MISSED: `analyticsHeader.presenter.ts:6`, `keyInsights.ts:10`, and the new
`statsSummary.presenter.ts`. It is a pure formatting helper with no I/O.

```
SHARED:
  - name: formatReviewDuration
    target_file: src/modules/statistics-insights/entities/stats/reviewDuration.format.ts   (NEW, pure)
    test: src/tests/units/entities/stats/reviewDuration.format.test.ts
    public_api: export function formatReviewDuration(ms: number): string
    move_from: src/modules/statistics-insights/services/statsService.ts:357-362
    consumers_to_repoint: analyticsHeader.presenter.ts, keyInsights.ts, statsSummary.presenter.ts (new)
    scenarios: 11 (duration formatting)
    notes: lives in entities/stats/ because keyInsights.ts (an entity) imports it — putting it in a
           presenter would make an entity depend on interface-adapters (dependency-rule violation).
           This is precisely the kind of inward-pointing fix the spec is about.
```

---

## GATEWAYS

No new gateway. The contract + both implementations already live correctly. Only an import repoint
on the consumer side (`dependencies.ts`) and deletion of the re-export shim.

```
GATEWAYS:
  - name: StatsGateway (contract) — ALREADY in entities, NO change
    contract: src/modules/statistics-insights/entities/stats/stats.gateway.ts  (unchanged)
  - name: FileSystemStatsGateway — ALREADY imports from entities, NO change
    file: src/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.ts
  - name: InMemoryStatsGateway (stub) — ALREADY imports from entities, NO change
    file: src/tests/stubs/stats.stub.ts
  - name: re-export shim — DELETE
    file: src/modules/statistics-insights/interface-adapters/gateways/stats.gateway.ts
    note: this file is now just `export type { StatsGateway } from '@/.../entities/stats/stats.gateway.js'`.
          Its only consumer is dependencies.ts:20. Repoint that import to entities, then delete the shim.
          (Spec DoD: "interface-adapters/gateways/stats.gateway.ts is deleted" — satisfied here.)
```

---

## CONSUMER_MIGRATION

Verified by grep `from '@/modules/statistics-insights/services/statsService'` across `src/`.
**14 real import sites** (not 9 — spec count is stale; tests + 2 missed pure-helper consumers).

```
CONSUMER_MIGRATION:

  parseReviewOutput consumers (repoint to entities/stats/reviewOutput.parser.js):
    1. src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts:59
    2. src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts:57
    3. src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts:29

  formatReviewDuration consumers (repoint to entities/stats/reviewDuration.format.js):
    4. src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts:6
    5. src/modules/statistics-insights/entities/stats/keyInsights.ts:10   (entity → must point inward)

  getStatsSummary consumer (replace with StatsSummaryPresenter + GetProjectStatsUseCase):
    6. src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts:10,53,69
       - instantiate `const statsSummaryPresenter = new StatsSummaryPresenter()`
         and `const getProjectStatsUseCase = new GetProjectStatsUseCase(statsGateway)`
       - replace getStatsSummary(stats) → statsSummaryPresenter.present(stats)  (2 call sites)
       - replace statsGateway.loadProjectStats(...) → getProjectStatsUseCase.execute({ projectPath })  (2 sites)
       - response shape stays identical (sc. 15) — null-on-miss preserved (use case returns null, no empty fallback)

  addReviewStats consumer (replace with AddReviewStatsUseCase):
    7. src/frameworks/claude/claudeInvoker.ts:42,686
       - import parseReviewOutput (entities) + AddReviewStatsUseCase (usecase)
       - at the call site (line 686): parse first, then new AddReviewStatsUseCase(statsGateway).execute({...})
       - REQUIRES a StatsGateway available in claudeInvoker's deps — see WIRING. Currently claudeInvoker
         relies on addReviewStats doing its own fs I/O; we must thread a StatsGateway (FileSystemStatsGateway)
         into the invoker dependencies. This is the one non-trivial wiring change (sc. 16).

  StatsGateway type consumer (repoint to entities, then delete shim):
    8. src/main/dependencies.ts:20   ('.../interface-adapters/gateways/stats.gateway.js'
                                       → '.../entities/stats/stats.gateway.js')

  ReviewStats TYPE re-export consumers (repoint to entities/stats/projectStats.js):
    9.  src/tests/factories/persistedInsightsData.factory.ts:5
    10. src/tests/units/usecases/insights/buildAiInsightsPrompt.test.ts:3
    11. src/tests/units/usecases/insights/computeInsightsWithPersistence.usecase.test.ts:3
    12. src/tests/units/usecases/insights/insightLevelComputation.service.test.ts:8
    13. src/tests/units/usecases/insights/computeDeveloperInsights.usecase.test.ts:3
        note: these import `ReviewStats` from statsService (which only re-exports it from
        projectStats.ts at line 16). Repoint straight to entities/stats/projectStats.js.

  Existing statsService unit tests (RELOCATE, then delete service):
    14. src/tests/units/services/statsService.{addReview,branches,category,summary}.test.ts
        - parser tests  → src/tests/units/entities/stats/reviewOutput.parser.test.ts
        - addReview tests → src/tests/units/usecases/stats/addReviewStats.usecase.test.ts (rewrite to use
          InMemoryStatsGateway instead of tmpdir fs — they currently hit the real file system)
        - summary tests → src/tests/units/interface-adapters/presenters/statsSummary.presenter.test.ts
        - formatReviewDuration tests → src/tests/units/entities/stats/reviewDuration.format.test.ts
        - DELETE the old src/tests/units/services/statsService.*.test.ts files after migration

  Acceptance tests that import statsService helpers (repoint, do NOT break):
    15. src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts:31
    16. src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts:26-29
        - both import { addReviewStats, loadProjectStats, saveProjectStats } from statsService
        - addReviewStats → AddReviewStatsUseCase(new FileSystemStatsGateway()).execute (parse first)
        - loadProjectStats/saveProjectStats → use FileSystemStatsGateway methods directly
        - these are pre-existing acceptance tests for OTHER specs; keep them GREEN throughout (regression guard)
```

---

## WIRING

```
WIRING:
  dependencies.ts:
    - line 20: import StatsGateway type from '@/modules/statistics-insights/entities/stats/stats.gateway.js'
      (was interface-adapters/gateways/stats.gateway.js)
    - FileSystemStatsGateway instantiation (line 113) unchanged.
    - Expose the statsGateway instance to the claude invoker dependency bag so claudeInvoker can build
      AddReviewStatsUseCase (it already builds FileSystemStatsGateway at line 113; thread that instance
      into the review-execution deps that claudeInvoker receives).

  routes.ts:
    - no route additions. statsRoutes already registered with statsGateway (lines 194/232/382/636 just
      pass deps.statsGateway through — unchanged).

  claudeInvoker deps:
    - add `statsGateway: StatsGateway` (or `addReviewStats: AddReviewStatsUseCase`) to the invoker's
      injected dependency type so the call site at line 686 can use the use case. Prefer injecting the
      gateway and `new AddReviewStatsUseCase(statsGateway)` inline at the call site (composition is cheap,
      one object), OR inject a pre-built AddReviewStatsUseCase from the composition root. Decide during
      impl based on how claudeInvoker's deps are currently shaped (verify the deps interface).
```

---

## DELETIONS (last strangler step, only when zero imports remain)

```
DELETIONS:
  - src/modules/statistics-insights/services/statsService.ts
      (after parseReviewOutput, addReviewStats, getStatsSummary, formatReviewDuration, createEmptyStats,
       loadProjectStats, saveProjectStats all have new homes / are dead)
  - src/modules/statistics-insights/interface-adapters/gateways/stats.gateway.ts   (re-export shim)
  - src/tests/units/services/statsService.addReview.test.ts
  - src/tests/units/services/statsService.branches.test.ts
  - src/tests/units/services/statsService.category.test.ts
  - src/tests/units/services/statsService.summary.test.ts

  NOTE on loadProjectStats/saveProjectStats: statsService's versions are duplicates of
  FileSystemStatsGateway's. They are only used by statsService-internal addReviewStats and by the two
  acceptance tests (#47, #203). Once addReviewStats becomes the use case (gateway-backed) and the
  acceptance tests are repointed to FileSystemStatsGateway, these functions are dead and die with the file.
  One behavioral nuance: statsService.loadProjectStats returns createEmptyStats() on miss, whereas
  FileSystemStatsGateway.loadProjectStats returns null on miss. The use case must apply
  `?? createEmptyStats()` to preserve the old behavior (flagged in the use case behavior block).
```

---

## STRANGLER_STEP_ORDER (inside-out, each step compiles + tests green)

```
STEP 0 (SDD outer loop):
  0. Write src/tests/acceptance/80-split-stats-service.acceptance.test.ts → RED.
     Import from the FUTURE locations (parser entity, use case, presenter). It will not compile yet —
     that is the expected RED. Keep it RED until the final step.

STEP 1 (entity layer — pure, no consumers broken yet; old service still intact):
  1. Create entities/stats/projectStats.schema.ts (Zod reviewStatsSchema + projectStatsSchema) and
     entities/stats/projectStats.guard.ts (createGuard). Repoint projectStats.ts types to z.infer.
     Shape byte-identical (all current optionals stay optional).                            [sc. 1,2,14]
     Create test src/tests/units/entities/stats/projectStats.schema.test.ts (valid + old-format fixture).
  2. Create entities/stats/reviewOutput.parser.ts (move parseReviewOutput + helpers).       [sc. 4-7]
     Create test src/tests/units/entities/stats/reviewOutput.parser.test.ts (RED→GREEN, port old cases).
  3. Create entities/stats/reviewDuration.format.ts (move formatReviewDuration).            [sc. 11]
     Create test. statsService temporarily re-exports from the new module OR keep both until step 4.
  4. Add createEmptyStats() export to entities/stats/projectStats.ts.                        [sc. 14]

STEP 2 (use case layer):
  5. Create usecases/stats/addReviewStats.usecase.ts (AddReviewStatsUseCase + private aggregate helpers).
     Inject StatsGateway. Apply `?? createEmptyStats()`.                                     [sc. 8-10]
     Create test src/tests/units/usecases/stats/addReviewStats.usecase.test.ts with InMemoryStatsGateway.
  6. Create usecases/stats/getProjectStats.usecase.ts (GetProjectStatsUseCase, returns ProjectStats|null,
     NO empty fallback). Inject StatsGateway.                                                [sc. 15]
     Create test src/tests/units/usecases/stats/getProjectStats.usecase.test.ts (present → stats, absent → null).

STEP 3 (presenter layer):
  7. Create interface-adapters/presenters/statsSummary.presenter.ts (StatsSummaryPresenter +
     StatsSummaryViewModel), using formatReviewDuration from the entity module.             [sc. 11-13]
     Create test src/tests/units/interface-adapters/presenters/statsSummary.presenter.test.ts.

STEP 4 (consumer migration — repoint imports, one file at a time, run tests after each):
  8. parseReviewOutput consumers (gitlab.controller, github.controller, mrTrackingAdvanced.routes).
  9. formatReviewDuration consumers (analyticsHeader.presenter, keyInsights entity).
  10. ReviewStats type re-export consumers (persistedInsightsData.factory + 4 insight tests).
  11. stats.routes.ts → StatsSummaryPresenter + GetProjectStatsUseCase (replace getStatsSummary AND
      the 2 statsGateway.loadProjectStats sites; keep response shape + null-on-miss).            [sc. 15]
  12. dependencies.ts → StatsGateway from entities (then the shim has no importers).
  13. claudeInvoker.ts → AddReviewStatsUseCase + parseReviewOutput; thread statsGateway via deps. [sc. 16]
  14. Acceptance tests #47, #203 → repoint to use case + FileSystemStatsGateway (keep GREEN).
  15. Relocate the 4 statsService.*.test.ts into their new homes; delete the originals.

STEP 5 (delete + verify):
  16. Delete services/statsService.ts and the gateways/stats.gateway.ts shim.
  17. Grep `services/statsService` across src/ → must return ZERO. Run the acceptance test → GREEN.
  18. yarn verify (typecheck + lint + test:ci). Manual smoke: run a review, confirm stats.json written
      + dashboard GET /api/stats shape unchanged.                                            [sc. 14, 15]
```

---

## SCENARIO_COVERAGE_MAP

```
SCENARIO_COVERAGE_MAP:
  sc. 1  ReviewStats in entities          → ALREADY in entities; STEP 1.1 adds Zod schema (DoD-literal). Acceptance asserts no service import.
  sc. 2  ProjectStats in entities         → ALREADY in entities; STEP 1.1 adds Zod schema (DoD-literal). Acceptance asserts.
  sc. 3  StatsGateway in entities         → ALREADY DONE (entities/stats/stats.gateway.ts). Shim deletion finalizes.
  sc. 4  parseReviewOutput structured     → STEP 1.1 (reviewOutput.parser.ts + test)
  sc. 5  parseReviewOutput summary        → STEP 1.1
  sc. 6  parseReviewOutput inline markers → STEP 1.1
  sc. 7  parseReviewOutput empty          → STEP 1.1
  sc. 8  AddReviewStats records review    → STEP 2.4 (addReviewStats.usecase.test.ts)
  sc. 9  AddReviewStats 100-review cap     → STEP 2.4
  sc. 10 AddReviewStats average (null)    → STEP 2.4
  sc. 11 Presenter formats duration       → STEP 1.2 + STEP 3.5
  sc. 12 Presenter score trend up         → STEP 3.5
  sc. 13 Presenter insufficient → stable  → STEP 3.5
  sc. 14 stats.json backward compatible   → STEP 5 acceptance fixture + createEmptyStats fallback
  sc. 15 stats.routes uses presenter      → STEP 2.6 (GetProjectStatsUseCase) + STEP 4.11 (wire route, shape snapshot)
  sc. 16 claudeInvoker uses use case      → STEP 4.11
```

---

## REFERENCE_FILES

```
REFERENCE_FILES:
  - src/modules/statistics-insights/services/statsService.ts
      — the God Object being split; source of truth for parser/aggregate/summary logic to MOVE verbatim.
  - src/modules/statistics-insights/entities/stats/projectStats.ts
      — current ProjectStats/ReviewStats interfaces (already in entities); where createEmptyStats lands.
  - src/modules/statistics-insights/entities/stats/stats.gateway.ts
      — StatsGateway contract (already in entities; dependency rule already satisfied).
  - src/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.ts
      — FileSystemStatsGateway (note: returns null on miss vs service's createEmptyStats — handle in use case).
  - src/tests/stubs/stats.stub.ts
      — InMemoryStatsGateway, used by use-case + acceptance tests.
  - src/tests/factories/projectStats.factory.ts
      — ReviewStatsFactory / ProjectStatsFactory; reuse in all new tests (never hardcode).
  - src/shared/foundation/usecase.base.ts        — UseCase<TInput, TOutput> interface to implement.
  - src/shared/foundation/presenter.base.ts       — Presenter<TDomain, TViewModel> interface to implement.
  - src/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.ts
      — reference for the function-with-injected-deps use-case style already used in this module.
  - src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts
      — reference for class presenter + ViewModel shape + formatReviewDuration consumer.
  - src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts
      — reference harness (tmpdir + Fastify + InMemoryStatsGateway) for the new acceptance test.
  - src/frameworks/claude/claudeInvoker.ts (lines 42, 680-698)
      — addReviewStats call site; the one non-trivial wiring change (sc. 16).
  - src/main/dependencies.ts (lines 19-20, 113) + src/main/routes.ts (194/232/382/636)
      — composition root; StatsGateway import repoint + threading into invoker deps.
```

---

## DISCREPANCIES (spec vs actual code — reconciled)

```
DISCREPANCIES:
  D1. PATHS — spec assumes src/services/statsService.ts and @/entities/reviewStats/. Actual: the repo
      migrated to a modular monolith. Real path is
      src/modules/statistics-insights/services/statsService.ts and the entities live in
      src/modules/statistics-insights/entities/stats/. ALL spec paths are remapped in this plan.

  D2. ENTITY TYPES ALREADY MOVED — spec sc. 1/2 and DoD say "move ReviewStats/ProjectStats to entities".
      Already done: they live in entities/stats/projectStats.ts. statsService only RE-EXPORTS them
      (statsService.ts:16). No type move needed; only repoint the 5 re-export consumers.

  D3. GATEWAY CONTRACT ALREADY MOVED — spec sc. 3 / DoD say "move StatsGateway to entities, fix dependency
      rule". Already done: entities/stats/stats.gateway.ts is the contract; FileSystemStatsGateway and
      InMemoryStatsGateway already import from entities. The interface-adapters/gateways/stats.gateway.ts
      is now a 1-line re-export shim with a single consumer (dependencies.ts). Plan = repoint that one
      import + delete the shim. The dependency-rule violation the spec describes no longer exists.

  D4. IMPORT-SITE COUNT — spec says "9 import sites". Actual grep finds 14 real `services/statsService`
      importers in src/ (3 parseReviewOutput controllers, 2 formatReviewDuration consumers the spec MISSED,
      5 ReviewStats-type re-export consumers, stats.routes, claudeInvoker, dependencies.ts) PLUS 4 old
      service unit-test files and 2 pre-existing acceptance tests (#47, #203). The full list is in
      CONSUMER_MIGRATION. The spec's migration map omitted: keyInsights.ts, analyticsHeader.presenter.ts
      (both use formatReviewDuration), the 4 insight tests, and acceptance #47/#203.

  D5. formatReviewDuration NOT IN SPEC — this pure helper was extracted into statsService after the spec
      was written and is consumed by an ENTITY (keyInsights.ts). It MUST move to entities/stats/ (not a
      presenter) to keep the dependency rule. Added as the SHARED section. The spec's "getStatsSummary →
      presenter" move depends on it.

  D6. Zod SCHEMA — RESOLVED by USER OVERRIDE (2026-06-19): DoD-literal, schema IS created. See SCHEMA
      block under ENTITIES. projectStats.schema.ts (Zod) + projectStats.guard.ts, types derived via
      z.infer keeping identical names/shape (14 consumers untouched). Boundary validation wired into
      FileSystemStatsGateway.loadProjectStats with a LENIENT fallback so old stats.json never crashes.

  D7. GetProjectStatsUseCase — RESOLVED by USER OVERRIDE (2026-06-19): DoD-literal, use case IS created.
      Returns ProjectStats | null (NO createEmptyStats fallback — preserves route null-on-miss, sc. 15).
      stats.routes.ts loads via the use case at both call sites. See USECASES block.

  D8. createEmptyStats DUPLICATION — recalculateProjectStats.usecase.ts:17-30 inlines its own empty-stats
      literal. Promoting createEmptyStats to entities exposes a future cleanup (dedupe that literal), but
      changing recalculateProjectStats is OUT OF SCOPE for #80. Flagged only.

  D9. loadProjectStats MISS SEMANTICS — service returns createEmptyStats() on missing file; gateway returns
      null. AddReviewStatsUseCase must apply `?? createEmptyStats()` to preserve behavior (no regression).
```
