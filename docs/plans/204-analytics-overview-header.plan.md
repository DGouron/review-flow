# Plan — SPEC-204 Show the analytics overview header

Spec: `docs/specs/204-analytics-overview-header.md`
Module: `src/modules/statistics-insights/` (sibling slice to SPEC-203, mirror its patterns)

```
PLAN:
  scope: analytics overview header (3 KPI cards + reviews-per-month line chart)
  is_new_module: false
```

## Scope challenge (`/anti-overengineering`)

Verdict: this is a **presenter-first read-only slice over an existing entity**. No new
capture, no use case, no gateway, no new route. The only judgement calls:

- **No new entity class / value object.** `ProjectStats` already carries every figure.
  Monthly aggregation is the only piece of real logic; it is isolated as a tiny **pure
  helper function + a flat type** in the entity layer (`monthlyVolume.ts`) because it is
  worth unit-testing in isolation and is the only logic the presenter cannot trivially
  inline. No class, no VO — a `function` returning `{ month: string; count: number }[]`.
- **No new use case.** A use case would be pure boilerplate wrapping one presenter call
  (business logic < boilerplate → forbidden by anti-overengineering rule). The presenter
  is invoked directly in the route, exactly like `BugsByCategoryPresenter`.
- **Delta**: the existing `trend` in `getStatsSummary` is a coarse up/down/stable flag
  (last-5 vs previous-5), NOT a period-over-period percentage. See OPEN DECISIONS — the
  recommendation is to **omit numeric deltas for v1** (each KPI card carries `delta: null`),
  satisfying spec rule "no delta when history is thin" trivially and honouring YAGNI. The
  ViewModel keeps a `delta` field shaped for a future fill so the view never changes.

## ENTITIES

Only a pure aggregation helper is added — no new entity class / schema / guard / gateway.

```
ENTITIES:
  - name: monthlyVolume (pure helper + type, NOT a class)
    file: src/modules/statistics-insights/entities/stats/monthlyVolume.ts
    schema: N/A (no boundary input — derived from already-validated ProjectStats)
    guard: N/A
    gateway_contract: N/A
    test: src/tests/units/modules/statistics-insights/entities/stats/monthlyVolume.test.ts
    factory: reuse src/tests/factories/projectStats.factory.ts (ReviewStatsFactory)
    exports:
      - type MonthlyVolumePoint = { month: string; count: number }   // month = 'YYYY-MM'
      - function reviewsPerMonth(reviews: ReviewStats[], now: Date): MonthlyVolumePoint[]
    logic:
      - bucket reviews by calendar month (UTC, from review.timestamp ISO string)
      - emit exactly the trailing 12 months ending at `now` (months with 0 reviews → count 0)
      - `now` injected as a parameter (deterministic tests; no hidden Date.now())
    LIMITATION to document in code-adjacent JSDoc + report: `reviews[]` is capped at the
      last 100 entries by statsService (line 283). For very active projects older months
      in the trailing 12 may undercount. Acceptable for v1 (spec is "at-a-glance"); noted
      in OPEN DECISIONS for the human.
```

Note on `formatDuration`: it currently lives as a **local closure inside
`getStatsSummary`** (`statsService.ts:369`). The dashboard `formatting.js#formatDuration`
has a different signature (start/end strings) and is browser JS — not reusable from TS.
Decision (see OPEN DECISIONS): the presenter needs ms→"4m"/"1h 12m". Options are (a) export
the existing closure from `statsService`, or (b) a 4-line local formatter in the presenter.
Recommended: **(a) extract & export `formatReviewDuration(ms): string` from
`statsService.ts`** and have `getStatsSummary` call it — removes duplication, single source
of truth, tiny scope. Flagged for confirmation.

## USECASES

```
USECASES:
  (none — intentionally. A use case here would be pure boilerplate over one presenter call.
   The presenter is invoked directly in the route, mirroring BugsByCategoryPresenter.)
```

## GATEWAYS

```
GATEWAYS:
  (none — reads the existing StatsGateway already injected into stats.routes.
   No new contract, implementation, or stub.)
```

## CONTROLLERS

No new controller file. The existing HTTP route plugin is **extended**, mirroring how
SPEC-203 added `bugsByCategory`.

```
CONTROLLERS:
  - name: statsRoutes (EXTEND — existing FastifyPluginAsync)
    file: src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts
    test: src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts (EXTEND)
    change:
      - instantiate `const analyticsHeaderPresenter = new AnalyticsHeaderPresenter();`
        once at plugin scope (next to bugsByCategoryPresenter, line ~32)
      - single-project branch (line ~47): add `analyticsHeader: analyticsHeaderPresenter.present(stats)`
      - all-projects branch (line ~59): add the same field to each pushed entry
    dependencies: [existing StatsGateway, getRepositories] — unchanged
    satisfies scenarios: nominal, bugs-exclude-suggestions, monthly volume, empty project
```

## PRESENTERS

```
PRESENTERS:
  - name: AnalyticsHeaderPresenter
    file: src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts
    test: src/tests/units/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.test.ts
    input: ProjectStats (+ now: Date defaulted to new Date() at the call boundary; the
           present() method takes (stats, now) so tests are deterministic — mirror the
           helper signature)
    output: AnalyticsHeaderViewModel
    shape:
      interface AnalyticsHeaderKpi {
        labelKey: string;           // i18n key, e.g. 'stats.kpi.prsReviewed'
        value: string | number;     // PRs Reviewed → number; Avg Time → formatted string
        delta: null;                 // v1: always null (see OPEN DECISIONS); field reserved
      }
      interface AnalyticsHeaderViewModel {
        prsReviewed: AnalyticsHeaderKpi;     // value = stats.totalReviews
        bugsCaught: AnalyticsHeaderKpi;      // value = stats.totalBlocking + stats.totalWarnings (suggestions EXCLUDED)
        averageReviewTime: AnalyticsHeaderKpi; // value = formatReviewDuration(stats.averageDuration)
        reviewsPerMonth: MonthlyVolumePoint[]; // from reviewsPerMonth(stats.reviews, now)
        isEmpty: boolean;            // stats.totalReviews === 0
        emptyMessage: string;        // 'Aucune review enregistrée' (FR, end-user facing)
      }
    notes:
      - EMPTY_MESSAGE constant 'Aucune review enregistrée' (mirror bugsByCategory.presenter EMPTY_MESSAGE)
      - presenter delegates month bucketing to entities/stats/monthlyVolume.reviewsPerMonth
      - presenter delegates ms formatting to statsService.formatReviewDuration (see decision)
      - "Bugs Caught" uses totals already on ProjectStats (no per-review iteration needed)
    satisfies scenarios: nominal, bugs-exclude-suggestions, delta-hidden, empty-project
```

## VIEWS

Humble Objects only — zero logic. All presentation logic lives in the presenter; the
chart renders points already computed, the HTML renders ViewModel fields.

```
VIEWS:
  - name: drawReviewsPerMonthChart (NEW export in existing module — do NOT create a new file)
    file: src/dashboard/modules/statsCharts.js
    test: src/tests/units/dashboard/modules/statsCharts.test.ts  (EXTEND — MANDATORY same file;
          the dashboardModulesCoverage acceptance guard forbids a new statsChartsXxx.test.ts)
    signature: drawReviewsPerMonthChart(canvasId, monthlyVolume)
      // monthlyVolume = Array<{ month: string, count: number }> (already 12 trailing months)
    rendering: LINE chart mirroring drawScoreTrendChart (smooth bezier path, area fill, HiDPI
      via setupHiDpiCanvas, getCanvasContext, drawNoDataMessage for empty). X labels = month
      ('YYYY-MM' → short month). Y = review count (integer ticks, mirror drawReviewActivityChart
      y-tick logic which already handles integer counts). Empty/no-data → drawNoDataMessage
      with t('stats.noChartData').

  - name: KPI cards + chart canvas markup (EDIT existing fetchProjectStats block)
    file: src/dashboard/index.html  (~line 1101 statsEl.innerHTML; ~line 1166 draw block)
    change:
      - prepend a 3-card KPI row (PRs Reviewed, Bugs Caught, Average Review Time) reading
        data.analyticsHeader; use `data-target` + animateCounter for the two numeric cards
        (PRs Reviewed, Bugs Caught), plain text for the formatted Average Review Time
      - when data.analyticsHeader.isEmpty → render single empty-state div with
        data.analyticsHeader.emptyMessage instead of cards+chart (scenario: empty project)
      - add a stats-charts-row with a `<canvas id="stats-reviews-per-month">` titled
        t('stats.reviewsPerMonth')
      - in the requestAnimationFrame draw block (~line 1166) add:
        `if (data.analyticsHeader) drawReviewsPerMonthChart('stats-reviews-per-month', data.analyticsHeader.reviewsPerMonth);`
      - import drawReviewsPerMonthChart alongside the existing statsCharts imports
    NOTE: delta UI intentionally not rendered in v1 (delta === null). Card markup leaves no
          delta element — future spec adds it without touching the presenter contract.

  - name: i18n labels (EDIT existing module — EN + FR tables)
    file: src/dashboard/modules/i18n.js
    keys to add (both en and fr blocks, near the other 'stats.*' keys):
      'stats.kpi.prsReviewed'    → EN 'PRs Reviewed'        / FR 'PR examinées'
      'stats.kpi.bugsCaught'     → EN 'Bugs Caught'         / FR 'Bugs détectés'
      'stats.kpi.averageReviewTime' → EN 'Average Review Time' / FR 'Durée moyenne de review'
      'stats.reviewsPerMonth'    → EN 'Reviews per Month'    / FR 'Reviews par mois'
    (exact FR wording is a human call — proposals above; 'Aucune review enregistrée' is the
     presenter-owned empty message and is NOT an i18n key, matching bugsByCategory's pattern.)
```

## WIRING

```
WIRING:
  routes: none — no new route registered in src/main/routes.ts. The change is internal to
          the already-wired statsRoutes plugin (presenter instantiated at plugin scope).
  dependencies: none new — AnalyticsHeaderPresenter is parameterless, instantiated inside
                statsRoutes exactly like BugsByCategoryPresenter (composition stays local
                to the plugin, no DI wiring required).
```

## IMPLEMENTATION_ORDER

Inside-out. Acceptance test written first (RED), stays RED until the last view step.

```
IMPLEMENTATION_ORDER:
  0. src/tests/acceptance/204-analytics-overview-header.acceptance.test.ts
     — Walking Skeleton outer loop. Maps every spec scenario. RED from the start.
  1. src/modules/statistics-insights/entities/stats/monthlyVolume.ts (+ its unit test)
     — innermost logic; the only piece worth isolating. Pure, deterministic (now injected).
  2. (decision-gated) export formatReviewDuration from statsService.ts
     — extract the local closure so the presenter and getStatsSummary share one formatter.
       Adjust getStatsSummary to call it; existing statsService tests must stay green.
  3. src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts
     (+ its unit test) — composes the 3 KPIs + monthly series + empty flag. Vertical slice
       now reaches the application boundary.
  4. Extend stats.routes.ts + stats.routes.test.ts — expose `analyticsHeader` on GET /api/stats
       (both branches). Acceptance HTTP assertions go green here.
  5. drawReviewsPerMonthChart in statsCharts.js + extend statsCharts.test.ts (same file!)
       — Humble Object line chart.
  6. i18n.js EN/FR labels.
  7. src/dashboard/index.html — KPI card markup, empty-state branch, canvas + draw call,
       import. LAST step (wiring/view). Acceptance fully GREEN.
```

Walking Skeleton (step 1 vertical slice crossing all layers): `monthlyVolume` helper →
`AnalyticsHeaderPresenter` → `GET /api/stats` payload → acceptance assertion on the
`analyticsHeader` field. The dashboard view (steps 5-7) is the outermost shell.

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/204-analytics-overview-header.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
  structure: mirror 203-bugs-found-by-category.acceptance.test.ts (describe-per-rule,
             it-per-scenario; exercise presenter directly + GET /api/stats via Fastify.inject
             with InMemoryStatsGateway; build data with ProjectStatsFactory / ReviewStatsFactory).
  scenario map:
    - nominal               → ProjectStats {43 reviews, 16 blocking, 41 warnings, avgDuration 252000}
        ⇒ prsReviewed.value=43, bugsCaught.value=57, averageReviewTime.value='4m'
    - bugs exclude suggestions → totalBlocking 3 + totalWarnings 5 (+ suggestions present)
        ⇒ bugsCaught.value=8  (suggestions never read)
    - monthly volume        → reviews dated across Jan–Dec ⇒ reviewsPerMonth has 12 entries,
        one per trailing month, each carrying that month's count
    - delta hidden on thin history → single period of data ⇒ every kpi.delta === null
    - empty project         → totalReviews 0 ⇒ isEmpty true & emptyMessage 'Aucune review enregistrée';
        and GET /api/stats payload carries analyticsHeader.isEmpty === true
```

## Unit test list

```
- src/tests/units/modules/statistics-insights/entities/stats/monthlyVolume.test.ts
    • buckets reviews by calendar month
    • always returns exactly 12 trailing months ending at `now`
    • months with no reviews report count 0
    • respects `now` injection (deterministic window)
- src/tests/units/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.test.ts
    • prsReviewed = totalReviews
    • bugsCaught = totalBlocking + totalWarnings, suggestions excluded
    • averageReviewTime formatted ('4m', '1h 12m')
    • reviewsPerMonth delegates to the helper (12 points)
    • every kpi.delta is null (v1)
    • empty project → isEmpty true + FR message
- src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts  (EXTEND)
    • single-project payload carries analyticsHeader
    • all-projects payload carries analyticsHeader per project
    • empty project → analyticsHeader.isEmpty true
- src/tests/units/dashboard/modules/statsCharts.test.ts  (EXTEND — same file)
    • drawReviewsPerMonthChart renders the no-data message on empty series
    • draws the line/area (gradient created) when points present
    • draws month labels below the axis
    • does nothing when the canvas is absent
- (decision-gated) statsService formatReviewDuration covered via existing getStatsSummary tests
```

## REFERENCE_FILES

```
REFERENCE_FILES:
  - docs/specs/204-analytics-overview-header.md — Rules/Scenarios/Out-of-Scope source of truth
  - docs/plans/203-bugs-found-by-category.plan.md (sibling) — pattern this plan mirrors
  - src/modules/statistics-insights/entities/stats/projectStats.ts — ProjectStats/ReviewStats shape
  - src/modules/statistics-insights/services/statsService.ts — formatDuration closure (l.369), trend (l.376), 100-cap (l.283)
  - src/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.ts — presenter shape to mirror
  - src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts — route to extend (l.32/47/59)
  - src/dashboard/modules/statsCharts.js — drawScoreTrendChart (line chart to mirror), animateCounter, HiDPI helpers
  - src/dashboard/modules/i18n.js — EN/FR tables, 'stats.*' block
  - src/dashboard/index.html — fetchProjectStats block (l.1101 markup, l.1166 draw block)
  - src/tests/factories/projectStats.factory.ts — ProjectStatsFactory / ReviewStatsFactory
  - src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts — acceptance structure to mirror
  - src/tests/units/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.test.ts — presenter test style
  - src/tests/units/dashboard/modules/statsCharts.test.ts — recordingContext chart-test harness to reuse
  - src/tests/acceptance/dashboardModulesCoverage.acceptance.test.ts — guard: ONE test file per dashboard module
```

## OPEN DECISIONS (confirm before / during implementation)

1. **Delta rendering.** The existing `trend` is a coarse up/down/stable flag (last-5 vs
   previous-5 reviews), not a period-over-period percentage as the glossary describes.
   Reusing it as a numeric "delta" would misrepresent it. **Recommendation: omit numeric
   deltas in v1** — every `kpi.delta` is `null`, satisfying the spec rule "no delta when
   history is thin" by always hiding it, and the ViewModel keeps the reserved `delta` field
   so a later spec can fill it (true period-over-period) without changing the view contract.
   Alternative if you want a visible delta now: reuse `trend` as a directional arrow only
   (no percentage). Confirm which.

2. **`formatReviewDuration` location.** Recommended: extract the local `formatDuration`
   closure from `getStatsSummary` into an exported `formatReviewDuration(ms): string` in
   `statsService.ts` (single source of truth, getStatsSummary calls it). Alternative:
   duplicate a 4-line formatter inside the presenter (zero cross-file change, minor dup).
   Confirm extract-and-export vs duplicate.

3. **100-review cap.** `statsService` keeps only the last 100 reviews (l.283). The monthly
   chart therefore undercounts older months for very active projects. v1 ships with this
   limitation (acceptable for an at-a-glance header). Flagging it explicitly; raise a
   follow-up spec if full-history monthly volume is later required.
```
