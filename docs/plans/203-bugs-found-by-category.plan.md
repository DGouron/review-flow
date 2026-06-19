# Plan — SPEC-203 Track bugs found by category

> Spec: `docs/specs/203-bugs-found-by-category.md`
> Status: planned
> Module: `statistics-insights`
> Estimate: ~0.5 AI-day (1 TDD feature, ~12 files incl. tests)

## Scope challenge (/anti-overengineering)

The spec is deliberately bounded. Applying the decision matrix:

- **No new entity class / value object.** `ReviewStats`/`ProjectStats` are plain TS interfaces today (no Zod, no class). The category breakdown is a flat `Record<BugCategory, number>` — a simple data shape, not an identity object with invariants. A Value Object class would be overengineering. Keep it a `type` + a pure helper module.
- **No new gateway, no new use case.** Capture rides the existing `addReviewStats` path; persistence rides the existing `StatsGateway`/file-system gateway unchanged (it serializes whatever `ProjectStats` holds). Adding a `RecordCategoryBreakdown` use case for a field assignment would invert the boilerplate/logic ratio.
- **No new HTTP route.** The aggregate already lives on `ProjectStats`; extend the existing `GET /api/stats` payload rather than add an endpoint (keeps it lazy, one fetch, no new wiring). Justified below.
- **One Zod guard IS justified** — only at the marker-parsing boundary, where the input is an untrusted string emitted by the review skill (Rule "only known categories are stored — unrecognized labels ignored"). The closed-set enforcement + "drop unknown" logic is real boundary validation. This is the single new domain artifact carrying logic.

Net: 1 entity type module + 1 guard + capture extension + aggregation extension + 1 presenter + 1 view function + wiring. No invented layers.

```
PLAN:
  scope: Track bugs found by category
  is_new_module: false

  ENTITIES:
    - name: BugCategory (closed union) + CategoryBreakdown (Record shape) + helpers
      file: src/modules/statistics-insights/entities/stats/bugCategory.ts
      schema: src/modules/statistics-insights/entities/stats/categoryBreakdown.schema.ts
      guard: src/modules/statistics-insights/entities/stats/categoryBreakdown.guard.ts
      gateway_contract: (none — reuses existing StatsGateway)
      test:
        - src/tests/units/modules/statistics-insights/entities/stats/bugCategory.test.ts
        - src/tests/units/modules/statistics-insights/entities/stats/categoryBreakdown.guard.test.ts
      factory: extend src/tests/factories/projectStats.factory.ts (categoryBreakdown override)
      modifies: src/modules/statistics-insights/entities/stats/projectStats.ts
                (add optional `categoryBreakdown` to ReviewStats; add aggregate
                 `categoryBreakdown` to ProjectStats)

  USECASES:
    (none — YAGNI. Capture is a field assignment inside the existing addReviewStats
     service path; no business workflow to orchestrate.)

  GATEWAYS:
    (none new. Reuses:)
    - name: StatsGateway
      contract: src/modules/statistics-insights/entities/stats/stats.gateway.ts (unchanged)
      implementation: src/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.ts (unchanged — serializes new field transparently)
      stub: src/tests/stubs/stats.stub.ts (unchanged)
      methods: loadProjectStats / saveProjectStats / statsFileExists

  CAPTURE (service extension — the canonical capture+persist+aggregate path):
    - file: src/modules/statistics-insights/services/statsService.ts
      changes:
        - parseReviewOutput: read category counts from the extended [REVIEW_STATS:...]
          marker, validate via categoryBreakdown guard (closed set, drop unknown),
          return a normalized CategoryBreakdown (all 6 keys, missing = 0) or null.
        - addReviewStats: store parsed breakdown on the new ReviewStats.categoryBreakdown
          field (null when absent → legacy/empty contributes zero).
        - updateAggregatesForNewReview + initializecumulativeCounters: maintain
          ProjectStats.categoryBreakdown as the running sum across reviews.
      tests:
        - src/tests/units/services/statsService.addReview.test.ts (extend: breakdown stored)
        - src/tests/units/services/statsService.category.test.ts (new: parse marker,
          partial, unknown dropped, legacy zero, aggregate sum)

  PRESENTERS:
    - name: BugsByCategoryPresenter
      file: src/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.ts
      test: src/tests/units/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.test.ts
      input: ProjectStats (reads its aggregate categoryBreakdown)
      output: BugsByCategoryViewModel = {
                bars: { categoryKey: BugCategory, label: string, count: number }[]  // always 6, sorted DESC by count
                isEmpty: boolean        // true when every count is 0
                emptyMessage: string    // "Aucune donnée de catégorie disponible"
              }

  CONTROLLERS:
    (none new. The existing HTTP route is extended, not a new controller.)

  HTTP:
    - decision: EXTEND existing GET /api/stats payload (recommended), do NOT add a route.
      file: src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts
      change: include the BugsByCategoryViewModel in the single-project response
              (e.g. `bugsByCategory: presenter.present(stats)`) alongside `stats`/`summary`.
      justification:
        - the aggregate already lives on ProjectStats loaded by this route — zero extra I/O;
        - keeps the dashboard's existing single fetch (index.html:1086) — no new endpoint wiring;
        - YAGNI: a dedicated /api/stats/categories route would duplicate path-validation,
          gateway access and registration for one already-loaded field.
      tests: src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts
             (extend: response carries bugsByCategory, sorted + empty-state flag)

  VIEWS:
    - name: drawBugsByCategoryChart (Humble Object, Canvas API, no external lib)
      file: src/dashboard/modules/statsCharts.js  (new exported function, mirrors drawReviewActivityChart)
      behavior:
        - vertical bar chart, 6 bars, HiDPI via setupHiDpiCanvas, gradient via COLORS.focus
        - consumes the presenter ViewModel bars (already sorted DESC), renders count labels + category labels
        - empty state: when viewModel.isEmpty, call drawNoDataMessage with the FR message
      test: src/tests/units/dashboard/modules/statsCharts.bugsByCategory.test.ts
            (jsdom Canvas stub style as existing dashboard chart tests; assert no-data path + bar count)
    - i18n: add keys to src/dashboard/modules/i18n.js
        'stats.bugsByCategory'  → EN "Bugs Found by Category" / FR "Bugs trouvés par catégorie"
        'stats.noCategoryData'  → EN + FR "Aucune donnée de catégorie disponible"
        plus 6 category labels: 'stats.category.security|logic|performance|typeSafety|style|dependencies'
    - index.html wiring: add a stats-chart-card + <canvas id="stats-bugs-category"> in the
      charts row (~index.html:1142), import drawBugsByCategoryChart (~line 426), and call it
      inside the requestAnimationFrame block (~line 1160) using data.bugsByCategory from the payload.

  WIRING:
    routes: none added in src/main/routes.ts. The statsRoutes plugin already registers
            /api/stats; only its handler body changes (instantiate BugsByCategoryPresenter
            inside stats.routes.ts, stateless, no DI needed — matches OverviewPresenter usage).
    dependencies: none new to instantiate in the composition root.

  IMPLEMENTATION_ORDER:
    0. src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts
       — SDD outer loop FIRST. Encodes all 7 scenarios. RED until the slice is complete.
    1. WALKING SKELETON (thinnest vertical slice, Domain→Service→Presenter):
       a. src/modules/statistics-insights/entities/stats/bugCategory.ts
          — closed BugCategory union + ordered key list + emptyBreakdown() helper. Inside-out root.
       b. categoryBreakdown.schema.ts + categoryBreakdown.guard.ts
          — Zod schema (Record of the 6 keys → non-negative int) + guard exposing parse/safeParse/
            isValid + a `normalize(unknown)` path that drops unknown keys and fills missing with 0.
       c. projectStats.ts — add optional ReviewStats.categoryBreakdown + ProjectStats.categoryBreakdown.
       d. statsService.ts — parseReviewOutput reads marker breakdown; addReviewStats stores it;
          aggregation sums it. (Closes capture + aggregation scenarios.)
       e. bugsByCategory.presenter.ts — sorted 6-bar ViewModel + isEmpty. (Closes sorted/empty scenarios.)
       f. stats.routes.ts — expose bugsByCategory in /api/stats payload.
       → at this point the acceptance test for the data path goes GREEN.
    2. VIEW: drawBugsByCategoryChart in statsCharts.js + i18n keys + index.html canvas/wiring.
    3. HUMBLE GLUE (separate, manual): the review-skill prompt change that EMITS the extended
       [REVIEW_STATS:...] marker with category counts (audit→category mapping). Flagged below.

  REFERENCE_FILES:
    - src/modules/statistics-insights/entities/stats/projectStats.ts — shapes to extend
    - src/modules/statistics-insights/services/statsService.ts — parseReviewOutput / addReviewStats / aggregation (canonical capture path)
    - src/modules/statistics-insights/entities/stats/stats.gateway.ts — unchanged contract (confirms no gateway change)
    - src/modules/statistics-insights/entities/stats/recalculateBody.guard.ts — guard module convention to mirror
    - src/shared/foundation/guard.base.ts — createGuard(schema, instigator) API for the new guard
    - src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts — ViewModel + present() + isEmpty/emptyMessage pattern (incl. FR empty messages)
    - src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts — payload to extend
    - src/dashboard/modules/statsCharts.js — drawReviewActivityChart (style/HiDPI/gradient/no-data to mirror)
    - src/dashboard/modules/i18n.js — EN/FR key blocks (~203 / ~652) + 'stats.noChartData' pattern
    - src/dashboard/index.html:426,1086,1138-1169 — chart import + fetch + render/draw wiring points
    - src/tests/factories/projectStats.factory.ts — ReviewStatsFactory / ProjectStatsFactory to extend
    - src/tests/stubs/stats.stub.ts — InMemoryStatsGateway (used by route/acceptance tests, unchanged)
    - src/tests/units/services/statsService.addReview.test.ts — capture test to mirror/extend

ACCEPTANCE_TEST:
  file: src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
```

## Marker format (extension, capture contract)

Extend the existing reliable marker (Method 1 in `parseReviewOutput`). Backward-compatible:
the new segment is optional, legacy markers without it parse to `categoryBreakdown = null`.

```
[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X:categories=security=3,logic=5,performance=1]
```

- Only the 6 internal keys (`security, logic, performance, typeSafety, style, dependencies`) are accepted.
- Unknown keys (e.g. `cosmic=9`) are dropped by the guard (Rule: only known categories stored).
- Missing keys default to 0 (Scenario: partial breakdown → others 0).
- No `categories=` segment → `null` → legacy/zero contribution (Scenario: legacy review).

## Domain conventions enforced

- `null` (not `undefined`) for "no breakdown captured" on `ReviewStats.categoryBreakdown`.
- `CategoryBreakdown` is a closed `Record<BugCategory, number>` — every value a non-negative integer.
- No `as` assertions — closed-set enforcement via Zod guard + key iteration over the ordered list.
- Imports `@/...` alias + `.js`; no barrel `index.ts`; `async/await` only (none needed here, all sync).
- Aggregate maintained incrementally in `updateAggregatesForNewReview` AND backfilled in
  `initializeCumulativeCounters` so existing stats.json files (no aggregate yet) recompute on next add.

## Scenario → artifact map

| Spec scenario | Satisfied by |
|---|---|
| nominal capture (Security:3, Logic:5, Performance:1) | parseReviewOutput marker parse + addReviewStats store; `statsService.category.test.ts` |
| partial breakdown (Style:2 only → others 0) | categoryBreakdown guard `normalize` fills missing with 0; guard test |
| unknown category ignored (Cosmic dropped) | categoryBreakdown guard closed-set drop; guard test |
| aggregation across reviews (sum) | updateAggregatesForNewReview + initializeCumulativeCounters; `statsService.category.test.ts` |
| sorted output (DESC, zeros last) | BugsByCategoryPresenter sort; presenter test |
| legacy review without breakdown (zeros, unaffected) | `categoryBreakdown = null` → zero contribution; addReview + aggregation tests |
| empty project ("Aucune donnée de catégorie disponible") | presenter `isEmpty` + view drawNoDataMessage; presenter test + view test |

## HUMBLE GLUE (manual — flag for the implementer)

The TS code only **parses, persists, aggregates, exposes, renders**. The review **skills must EMIT**
the `categories=...` marker segment, mapping each audit to its category
(Security audit→security, SOLID/Clean Arch/DDD→logic, Performance→performance,
TypeScript→typeSafety, Code Quality/Testing→style, deps→dependencies).

This skill-prompt change cannot be unit-tested by the TS implementer (it depends on Claude emitting
the marker during a real review). It is a **separate capture-glue item requiring one manual review run**
to verify the breakdown lands in `stats.json` end-to-end. Treat like the SPEC-193 transport-gateway
glue: implement the parser to spec, then validate the emission manually.

## Open decisions for you to confirm

1. **Marker format**: `categories=security=3,logic=5,...` appended to the existing `[REVIEW_STATS:...]`
   line (recommended, backward-compatible) vs a separate `[REVIEW_CATEGORIES:...]` line. I recommend
   the appended segment — single source, single regex extension, legacy-safe.
2. **HTTP exposure**: extend `GET /api/stats` payload with `bugsByCategory` (recommended) vs new route.
   I recommend extending — the aggregate is already loaded, no new wiring.
3. **Chart orientation**: vertical bars (mirrors `drawReviewActivityChart`) vs horizontal
   (mirrors `drawScoreDistributionChart`, which is category-like). The spec says "bars ordered highest→lowest";
   horizontal reads category labels better with 6 long names. Confirm preference — plan currently assumes
   vertical to match the named reference, but horizontal is a defensible swap.
4. **Backfill**: out of scope per spec (legacy = zero). Confirm we do NOT touch the existing
   `recalculateWithBackfill` path for categories.
```
