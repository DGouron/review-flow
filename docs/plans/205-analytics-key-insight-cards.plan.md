# Plan — SPEC-205: Key Insight cards on the analytics overview

> Spec: `docs/specs/205-analytics-key-insight-cards.md`
> Module: `statistics-insights`
> Author: feature-planner (architect role)
>
> **RE-PLAN.** The earlier 205 plan (reuse `teamInsight.tips` / `/api/insights` AI pipeline) is DEAD.
> New direction, decided with the user: Key Insight cards are computed by a small **deterministic
> formatter over the already-recorded `ProjectStats`** — NO AI, NO `/api/insights` reuse, NO new capture.

## PLAN

```
PLAN:
  scope: Key Insight cards (deterministic, stat-derived) on the analytics overview
  is_new_module: false   # extends src/modules/statistics-insights/
```

---

## DIRECTION & SCOPE CHALLENGE (anti-overengineering)

The spec defines a **fixed, closed set of 3 candidate insights**, each gated by a data/threshold test,
ranked by signal strength, truncated to 3, with a FR empty state. ALL three inputs are already on
`ProjectStats` (served by `GET /api/stats`):

| Candidate | Source field(s) on `ProjectStats` | Confirmed at |
|-----------|-----------------------------------|--------------|
| Review-volume trend | `reviews[].timestamp` (count in recent vs previous window) | `projectStats.ts:33` |
| Dominant bug category | `categoryBreakdown?: Record<BugCategory, number>` (SPEC-203 aggregate) | `projectStats.ts:42` |
| Average-review-time trend | `reviews[].duration` (avg recent vs previous window) | `projectStats.ts:15` |

**No new entity class / value object / use case / gateway is justified.** This is pure stat logic over an
existing shape → a **pure function module at the entity layer** (alongside `monthlyVolume.ts`), plus a thin
presenter and a humble view. The business logic lives entirely in the deriver; the presenter only wraps
into a ViewModel (truncate, empty message); the view only renders text. KISS/YAGNI: no insight plugin
system, no configurable thresholds (spec Out of Scope), no scoring model beyond a single `strength` number.

---

## ENTITIES / DOMAIN — the deriver (where the real logic lives)

```
ENTITIES:
  - name: keyInsights (pure stat-derivation module — NOT a class/VO)
    file: src/modules/statistics-insights/entities/stats/keyInsights.ts
    test: src/tests/units/modules/statistics-insights/entities/stats/keyInsights.test.ts
    factory: (none new — reuse ProjectStatsFactory / ReviewStatsFactory)
```

Rationale for location: mirrors `monthlyVolume.ts` (a pure `ProjectStats`-derived helper that lives in
`entities/stats/`, injects `now` for determinism, has no class). The deriver is the same kind of object.
No schema/guard/gateway: the input is an already-validated in-memory `ProjectStats`, not a boundary.

### Result type (flat, no class — interface in the deriver file)

```
export type KeyInsightKey = 'reviewVolume' | 'dominantCategory' | 'reviewTime';

export interface KeyInsight {
  key: KeyInsightKey;
  title: string;     // English, generated (e.g. "Review volume is up")
  body: string;      // English, one line (e.g. "12 reviews recently vs 6 before (+100%)")
  strength: number;  // ranking weight, larger = more notable; never surfaced to the user
}
```

### Public function

```
export function deriveKeyInsights(stats: ProjectStats, now: Date): KeyInsight[]
```

- Evaluates the 3 candidates, keeps only those that pass their gate, returns them **sorted by `strength`
  descending** (tie-break by a stable candidate order: volume, category, time). Truncation to 3 is left to
  the presenter (the spec ties "up to three" + "empty state" to the section, a presentation concern) — but
  since there are exactly 3 candidates, the list is already ≤3; the 4→3 truncation scenario is exercised by
  passing a deriver-shaped list straight to the presenter (see PRESENTER tests).
- `now` is injected (deterministic, never reads wall clock) — same contract as `reviewsPerMonth`.
- Returns `[]` when no candidate qualifies (drives the empty state).

### Windowing & thresholds (CHOSEN — reuse the `getStatsSummary` convention)

`statsService.getStatsSummary` (`statsService.ts:382-404`) already defines the project's only window scheme:
`recent = reviews.slice(-5)`, `previous = reviews.slice(-10, -5)`, and **requires `recent.length >= 3 &&
previous.length >= 3`** before computing any trend. **The two trend candidates REUSE this exact scheme**
(constants named, not magic):

```
const TREND_WINDOW = 5;          // last 5 vs previous 5 — matches getStatsSummary
const MIN_WINDOW_SAMPLES = 3;    // each window needs >= 3 — matches getStatsSummary
```

Per-candidate gates and `strength`:

1. **Review-volume trend** (`reviewVolume`)
   - Windows over `reviews` ordered by `timestamp` (reviews are already appended in order; sort defensively
     by `timestamp` ascending before slicing).
   - Gate: both windows have `>= MIN_WINDOW_SAMPLES` reviews **and** the relative change is meaningful
     (`|recentCount - previousCount| / previousCount >= VOLUME_MIN_RELATIVE_CHANGE`), `previousCount > 0`
     (guards div-by-zero).
   - `strength = relativeChange` (absolute value of the signed % as a 0..n ratio).
   - Direction: up if `recentCount > previousCount`, else down. Title/body state direction + magnitude
     (e.g. `"Review volume is up"` / `"12 recent reviews vs 6 before (+100%)"`).
   - Scenario `volume rising: 12 vs 6` → up, +100%.

2. **Dominant bug category** (`dominantCategory`)
   - From `stats.categoryBreakdown ?? null`. Pick the category with the **max count**, tie-broken by
     `BUG_CATEGORY_KEYS` order (same precedence convention as `bugsByCategory.presenter.ts:33`).
   - Gate: a breakdown exists **and** the max count `>= 1` (spec: "shown only when at least one categorized
     bug exists"). Uses `BUG_CATEGORY_LABELS[key]` for the display name.
   - `strength = dominanceShare = maxCount / totalCategorizedBugs` (0..1) — "larger category dominance ranks
     higher" (spec). Normalized to be comparable against the trend ratios; if needed for ordering parity, the
     deriver may scale it (decision flagged below).
   - Body names the category + its count (e.g. `"Logic is the most common finding"` / `"12 findings across
     all reviews"`). Scenario `security 4, logic 12, style 2` → names **Logic**, count **12**.

3. **Average-review-time trend** (`reviewTime`)
   - Recent vs previous window average of `reviews[].duration`. Same window scheme + `MIN_WINDOW_SAMPLES`
     gate as volume.
   - Gate: both windows `>= MIN_WINDOW_SAMPLES`, `previousAvg > 0`, relative change
     `>= TIME_MIN_RELATIVE_CHANGE`.
   - `strength = relativeChange`. Direction: **down (improving) is good** — body states drop/rise with
     magnitude (e.g. `"Review time dropped"` / `"avg 3m recently vs 5m before (-40%)"`). Reuse
     `formatReviewDuration` (already exported from `statsService.ts:357`) for the human-readable durations.
   - Scenario `recent avg below previous` → "review time dropped" + magnitude.

**Threshold values chosen (and why):**

```
const VOLUME_MIN_RELATIVE_CHANGE = 0.10;   // 10% — a candidate must move >=10% to count as a trend
const TIME_MIN_RELATIVE_CHANGE   = 0.10;   // 10% — same bar for review-time
```

- 10% relative is the minimal-complexity expression of the spec rule *"never shown as a zero or flat card"*
  and *"states the direction and the magnitude"*. The existing `getStatsSummary` uses an **absolute** 0.5
  delta on scores/blocking — that scale does not transfer to counts/durations, so a **relative** floor is the
  faithful equivalent. 10% is a single, conservative number (no per-candidate tuning, no config — Out of
  Scope). Flagged as an OPEN DECISION for the user to lock or adjust.
- The `MIN_WINDOW_SAMPLES = 3` / `TREND_WINDOW = 5` values are NOT invented — they are lifted verbatim from
  `getStatsSummary` so the three trend gates stay consistent with the existing score/blocking trend.

> Edge handling (unit-tested): `previousCount === 0` or `previousAvg === 0` → candidate omitted (no
> div-by-zero, never an Infinity% card). Fewer than `MIN_WINDOW_SAMPLES` in either window → omitted. Missing
> `categoryBreakdown` or all-zero breakdown → category candidate omitted.

---

## USECASES

```
USECASES: (none new)
```

No use case. The deriver is a pure function consumed directly by the presenter in the route, exactly as
SPEC-204's `AnalyticsHeaderPresenter` consumes `ProjectStats`/`reviewsPerMonth` in `stats.routes.ts`. A use
case here would be boilerplate over a single transformation (anti-overengineering).

---

## GATEWAYS

```
GATEWAYS: (none new)
```

No gateway. Reuses `StatsGateway` already wired into `stats.routes.ts`. The data is already on
`ProjectStats`; no new external access.

---

## PRESENTERS

```
PRESENTERS:
  - name: KeyInsightsPresenter
    file: src/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.ts
    test: src/tests/units/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.test.ts
    input: (stats: ProjectStats, now: Date)
    output: KeyInsightsViewModel
```

ViewModel (interface in the presenter file — mirrors `BugsByCategoryViewModel` / `AnalyticsHeaderViewModel`):

```
export interface KeyInsightCard { title: string; body: string }   // strength + key dropped — UI doesn't need them

export interface KeyInsightsViewModel {
  cards: KeyInsightCard[];   // length 0..3, ordered most-notable first
  isEmpty: boolean;          // cards.length === 0
  emptyMessage: string;      // FR "Aucun insight disponible pour le moment"
}
```

Presenter responsibilities (thin — all gating/ranking already done by the deriver):

```
const MAX_CARDS = 3;
const EMPTY_MESSAGE = 'Aucun insight disponible pour le moment';

present(stats: ProjectStats, now: Date): KeyInsightsViewModel {
  const cards = deriveKeyInsights(stats, now)
    .slice(0, MAX_CARDS)
    .map(({ title, body }) => ({ title, body }));
  return { cards, isEmpty: cards.length === 0, emptyMessage: EMPTY_MESSAGE };
}
```

- Takes `(stats, now)` — same signature shape as `AnalyticsHeaderPresenter.present`, so the route call is
  symmetrical (`new Date()` injected by the route).
- The 4→3 truncation scenario: the deriver yields at most 3 candidates today, so to test "more than 3 → top
  3" the presenter test injects a deriver-shaped list of 4 via a tiny seam (either test the `slice(0,3)`
  through a list helper, or assert the deriver→presenter contract caps at 3). Decision: keep `MAX_CARDS`
  truncation in the presenter so the cap is explicit and future-proof; unit-test it by feeding the presenter
  a `ProjectStats` that legitimately produces all 3 candidates and asserting `cards.length === 3` plus order,
  and separately unit-test the deriver's ranking with a synthetic 4-candidate-style ordering check at the
  array level. (See TESTS.)

---

## HTTP — extend `GET /api/stats` (DECIDED transport, no new route)

```
WIRING (http):
  file: src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts
  - instantiate once at plugin scope:  const keyInsightsPresenter = new KeyInsightsPresenter();
  - single-project branch (after analyticsHeader, ~line 53):
      keyInsights: keyInsightsPresenter.present(stats, new Date()),
  - all-projects branch (inside the push, ~line 68):
      keyInsights: keyInsightsPresenter.present(stats, new Date()),
  test: extend src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts  (legacy path — NOT under modules/)
```

This mirrors SPEC-203/204 exactly (`bugsByCategoryPresenter` / `analyticsHeaderPresenter` are instantiated
once and added to BOTH branches). NO `/api/insights` change. The dashboard already fetches `/api/stats` in
`fetchProjectStats`, so the view consumes `data.keyInsights` for free (no extra fetch).

> `src/main/routes.ts` is NOT touched — `statsRoutes` is already registered and the presenter is internal to
> the plugin (stateless, like the sibling presenters). The "wiring last" rule applies to the dashboard glue.

---

## VIEWS — humble dashboard object

```
VIEWS:
  - name: keyInsights (dashboard humble object — text cards, zero logic)
    file: src/dashboard/modules/keyInsights.js
    test: src/tests/units/dashboard/modules/keyInsights.test.ts   # OWN single file (dashboardModulesCoverage guard)
```

View contract (JSDoc-typed browser JS, mirrors `overview.js` / `html.js` `escapeHtml` usage):

```
/** @typedef {{ title: string, body: string }} KeyInsightCard */
/** @typedef {{ cards: KeyInsightCard[], isEmpty: boolean, emptyMessage: string }} KeyInsightsViewModel */

export function renderKeyInsightsHtml(viewModel): string
```

- Renders a `// KEY INSIGHTS` panel (Agentic-OS DNA: monospace `// LABEL` prefix) titled via
  `t('stats.keyInsights')`, then one text card per `cards[]` entry (`escapeHtml(title)` + `escapeHtml(body)`,
  no chart, no canvas).
- When `isEmpty` (or the view-model is missing/malformed) → renders an empty-state div with `emptyMessage`
  (falling back to `t('stats.noKeyInsights')`), same defensive default as `overview.js`.
- ZERO logic: no gating, no ranking, no text-building — all of that is in the deriver/presenter.

### dashboard glue (`src/dashboard/index.html`, in `fetchProjectStats`)

```
- import { renderKeyInsightsHtml } from './modules/keyInsights.js'   (module import block near other dashboard modules)
- build keyInsightsMarkup = data.keyInsights ? renderKeyInsightsHtml(data.keyInsights) : ''
- mount it in the analytics overview block of statsEl.innerHTML (after the analyticsHeaderMarkup / KPI row,
  before or after the charts rows — placed at the END of the overview as the "Key Insights" row per the spec)
- no new fetch, no new chart draw call (text only)
```

### i18n (`src/dashboard/modules/i18n.js`, in both EN and FR `stats.*` blocks)

```
EN: 'stats.keyInsights': 'Key Insights',  'stats.noKeyInsights': 'Aucun insight disponible pour le moment'
FR: 'stats.keyInsights': 'Insights clés', 'stats.noKeyInsights': 'Aucun insight disponible pour le moment'
```

> The empty message is identical FR in both locales (spec fixes the FR string). The card titles/bodies are
> English generated text (consistent with the English `kpi.*` labels and the target image); the view does NOT
> translate bodies. Only the section title is locale-switched.

---

## IMPLEMENTATION_ORDER (inside-out; walking skeleton first)

The walking skeleton vertical slice = **deriver → presenter → `/api/stats` → acceptance** (no controller/use
case/gateway exist for this slice). Order:

1. `src/tests/acceptance/205-analytics-key-insight-cards.acceptance.test.ts` — SDD outer loop FIRST; encodes
   all 6 spec scenarios; RED until deriver + presenter + route land. (Mirrors `204-*.acceptance.test.ts`.)
2. `src/modules/statistics-insights/entities/stats/keyInsights.ts` (+ unit test) — **the bulk of the logic**:
   windowing, % change, thresholds, dominant-category pick, ranking, edge cases. Innermost new unit.
3. `src/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.ts` (+ unit test) —
   wraps deriver → ViewModel, truncate to 3, FR empty message.
4. Extend `stats.routes.ts` to expose `keyInsights` on `GET /api/stats` (both branches) + extend
   `stats.routes.test.ts` — turns the HTTP half of the acceptance test GREEN (Fastify.inject).
5. `src/dashboard/modules/keyInsights.js` (+ its single test) — humble view; render cards / empty state.
6. i18n keys in `src/dashboard/modules/i18n.js` (EN + FR).
7. Dashboard glue in `src/dashboard/index.html` — import + build markup + mount in the analytics overview.
   (LAST — wiring.)

---

## TESTS

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/205-analytics-key-insight-cards.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
```

### Acceptance — scenario → assertion mapping (exercise presenter directly + GET /api/stats via Fastify.inject)

| Spec scenario | Test |
|---------------|------|
| `volume rising: 12 recent vs 6 previous` | reviews windowed so recent count 12 > previous 6 → a `reviewVolume` card, body states the increase (+100%) |
| `dominant category: security 4, logic 12, style 2` | `categoryBreakdown` set → a card naming **Logic**, count **12** |
| `review time improving: recent avg < previous` | durations windowed recent<previous → a `reviewTime` card stating the drop + magnitude |
| `ranking and truncation: four candidates qualify` | feed a ranked 4-item input → only top 3 shown, strongest first (presenter `MAX_CARDS`) |
| `not enough data` | `< MIN_WINDOW_SAMPLES` per window + flat trends + no categorized bugs → those candidates omitted |
| `empty` | nothing qualifies → `isEmpty === true`, `emptyMessage === 'Aucun insight disponible pour le moment'` |
| HTTP exposure | `GET /api/stats?path=...` body carries `keyInsights` view-model (non-empty + empty cases), both branches |

### Unit tests

- **`keyInsights.test.ts` (deriver — the bulk):** each candidate's gate + magnitude (volume up/down,
  category dominance + tie-break by `BUG_CATEGORY_KEYS`, time drop/rise); ranking by `strength`;
  truncation/ordering of a 4-candidate-style synthetic array; edges: `previousCount===0`,
  `previousAvg===0` (no Infinity), windows below `MIN_WINDOW_SAMPLES`, missing/all-zero `categoryBreakdown`,
  exact 10% threshold boundary (just-below omitted, at/above shown). Uses `ProjectStatsFactory.withReviews`
  + `ReviewStatsFactory.create({ timestamp, duration, categoryBreakdown })` and an injected `NOW`.
- **`keyInsights.presenter.test.ts`:** nominal (3 cards), 1 card, truncation to 3 + order preserved, empty +
  FR message. Mirrors `bugsByCategory.presenter.test.ts`.
- **`stats.routes.test.ts` (extend, at `src/tests/units/interface-adapters/controllers/http/`):** `keyInsights` present on single-project payload + all-projects payload.
- **`keyInsights.test.ts` (dashboard view, single file per the coverage guard):** smoke render of cards HTML,
  empty-state render, defensive render on missing/malformed view-model.

---

## REFERENCE_FILES

- `docs/specs/205-analytics-key-insight-cards.md` — the (rewritten) spec: 9 rules + 6 scenarios + Out of Scope.
- `src/modules/statistics-insights/entities/stats/projectStats.ts` — `ProjectStats` / `ReviewStats` shape: all 3 inputs (`reviews[]`, `averageDuration`, `categoryBreakdown`). CONFIRMED.
- `src/modules/statistics-insights/entities/stats/bugCategory.ts` — `BUG_CATEGORY_KEYS`, `BUG_CATEGORY_LABELS`, `CategoryBreakdown`, `emptyBreakdown` for the dominant-category candidate.
- `src/modules/statistics-insights/entities/stats/monthlyVolume.ts` — the pure `ProjectStats`-derived helper to MIRROR for the deriver (location, `now` injection, no class, JSDoc, `MONTHS_IN_WINDOW`-style named constants).
- `src/modules/statistics-insights/services/statsService.ts` — `getStatsSummary` (window scheme `slice(-5)`/`slice(-10,-5)`, `>=3` gate) to REUSE; `formatReviewDuration` (export) for the review-time body.
- `src/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.ts` — presenter pattern to mirror (`isEmpty` + FR `EMPTY_MESSAGE`, tie-break by category key order).
- `src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts` — sibling presenter (SPEC-204); `present(stats, now)` signature to match.
- `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` — exact spot to add `keyInsights` (both branches), presenter instantiated once at plugin scope.
- `src/tests/acceptance/204-analytics-overview-header.acceptance.test.ts` — acceptance skeleton + Fastify.inject pattern + `InMemoryStatsGateway` usage to mirror.
- `src/tests/factories/projectStats.factory.ts` — `ProjectStatsFactory` / `ReviewStatsFactory` (note: `categoryBreakdown` + `duration` + `timestamp` passed via overrides; no factory change needed).
- `src/tests/stubs/stats.stub.ts` — `InMemoryStatsGateway` for the HTTP test.
- `src/dashboard/modules/overview.js` + `src/dashboard/modules/html.js` — humble-object render + `escapeHtml` + defensive-default pattern for `keyInsights.js`.
- `src/dashboard/modules/i18n.js` — EN block (~217-229) and FR block (~679-691) `stats.*` keys to extend.
- `src/dashboard/index.html` (~1086 fetch, ~1100-1209 render) — `fetchProjectStats` mount site; `data.keyInsights` consumed like `data.bugsByCategory` (same `/api/stats` fetch, no new request).
- `src/tests/acceptance/dashboardModulesCoverage.acceptance.test.ts` — the one-test-per-dashboard-module guard (forces `keyInsights.test.ts`).

---

## OPEN DECISIONS (confirm before / during implementation)

1. **Relative-change threshold = 10%** (`VOLUME_MIN_RELATIVE_CHANGE` / `TIME_MIN_RELATIVE_CHANGE`). Chosen as
   the minimal faithful expression of "never a flat card" (the existing `getStatsSummary` uses an absolute
   0.5 delta that does not transfer to counts/durations). **Lock 10%, or prefer another single value?**
2. **Ranking parity across candidate types.** Trend `strength` is a relative ratio (e.g. 1.0 = +100%);
   category `strength` is a dominance share (0..1). They are comparable in the common case, but a very strong
   trend will always outrank a category insight. The spec says "larger relative change OR larger category
   dominance ranks higher" without defining cross-type weighting. Plan keeps a single numeric `strength` with
   no scaling (simplest). **Confirm this is acceptable, or specify a weighting** (would add minor complexity).
3. **Card titles are generated English** (e.g. "Review volume is up", "Logic is the most common finding",
   "Review time dropped"); only the empty-state message is FR. Consistent with SPEC-203/204. **Confirm.**
4. **Transport = extend `GET /api/stats`** (data already there; dashboard already fetches it). Confirm (this
   reverses the dead plan's `/api/insights` recommendation — the new direction makes `/api/stats` correct).
```
