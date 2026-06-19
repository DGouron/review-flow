# Report — SPEC-205: Show key insight cards on the analytics overview

> Spec: `docs/specs/205-analytics-key-insight-cards.md`
> Plan: `docs/plans/205-analytics-key-insight-cards.plan.md`
> Module: `statistics-insights`
> Date: 2026-06-19

## Status

- **Acceptance test: GREEN** (8/8) — SDD outer loop closed.
- **`yarn verify`: GREEN** — typecheck OK, lint OK (no new warnings), format OK, tests 463 files / 3853 passed / 0 failed.

## Approach

Inside-out TDD (Detroit), walking-skeleton slice: deriver → presenter → `/api/stats` route → acceptance, then humble view + i18n + dashboard glue. No new entity class / value object / use case / gateway — the three candidate insights are a pure stat transformation over the already-recorded `ProjectStats` (mirrors `monthlyVolume.ts`).

## Files created

| File | Role |
|------|------|
| `src/modules/statistics-insights/entities/stats/keyInsights.ts` | Pure `deriveKeyInsights(stats, now)` — windowing, % change, thresholds, dominant-category pick, ranking, edges (the bulk of the logic) |
| `src/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.ts` | `KeyInsightsPresenter.present(stats, now)` → `{ cards: {title, body}[0..3], isEmpty, emptyMessage }`; truncate to 3, FR empty message |
| `src/dashboard/modules/keyInsights.js` | Humble render object (text cards, JSDoc-typed, zero logic, defensive empty-state default) |
| `src/tests/acceptance/205-analytics-key-insight-cards.acceptance.test.ts` | 8 acceptance tests (6 scenarios + 2 HTTP exposure) |
| `src/tests/units/modules/statistics-insights/entities/stats/keyInsights.test.ts` | 16 deriver unit tests |
| `src/tests/units/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.test.ts` | 4 presenter unit tests |
| `src/tests/units/dashboard/modules/keyInsights.test.ts` | 4 view unit tests (one-per-module coverage guard) |

## Files modified

| File | Change |
|------|--------|
| `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` | Instantiate `KeyInsightsPresenter` once at plugin scope; add `keyInsights` to both single-project and all-projects branches (`new Date()` injected) |
| `src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts` | +3 assertions (single-project non-empty, single-project empty, all-projects payload) |
| `src/dashboard/modules/i18n.js` | `stats.keyInsights` (EN "Key Insights" / FR "Insights clés") + `stats.noKeyInsights` (FR in both locales) |
| `src/dashboard/index.html` | Import `renderKeyInsightsHtml`; build `keyInsightsMarkup` from `data.keyInsights` (same `/api/stats` fetch, no new request); mount as the last row of the analytics overview block |

> `docs/feature-tracker.md` and `docs/specs/205-...md` show as modified in the worktree but were NOT touched by this implementation — they are the planner's pre-existing `drafted→planned` + spec-rewrite work. Feature-tracker status (`implemented`) and commit are left to the user.

## Test counts

| Suite | Tests | Result |
|-------|-------|--------|
| Acceptance (205) | 8 | PASS |
| Deriver unit | 16 | PASS |
| Presenter unit | 4 | PASS |
| Route unit (extended) | 21 | PASS |
| View unit | 4 | PASS |
| Full `yarn verify` | 3853 (463 files) | PASS |

## Spec scenario → test mapping

| Spec scenario | Test | Status |
|---------------|------|--------|
| volume rising: 12 vs 6 → increase card | acceptance "volume rising…" + deriver "states the increase…" | GREEN |
| dominant category: security 4, logic 12, style 2 → Logic, count 12 | acceptance "dominant category…" + deriver "names the category with the most findings…" | GREEN |
| review time improving: recent avg < previous → drop card + magnitude | acceptance "review time improving…" + deriver "states a drop…" | GREEN |
| ranking and truncation: four candidates → top three, strongest first | acceptance "ranking and truncation…" + presenter "presents one card per derived insight, ordered…" (cap = `MAX_CARDS` 3) + deriver "orders the insights by strength descending" | GREEN |
| not enough data → candidates omitted | acceptance "not enough data…" + deriver "omits the candidate when a window has fewer than the minimum samples" / "…previous average is zero" / "…below the ten percent floor" | GREEN |
| empty: no candidate → "Aucun insight disponible pour le moment" | acceptance "empty…" + presenter "flags the empty state with the French message" + view "renders the empty-state message when isEmpty" | GREEN |
| HTTP exposure on `GET /api/stats` (both branches) | acceptance "carries the keyInsights…" / "flags the empty keyInsights…" + route "should carry the keyInsights…" / "should flag the empty keyInsights…" / "should include enabled repositories with stats" | GREEN |

## Decisions locked (per plan)

1. `VOLUME_MIN_RELATIVE_CHANGE = 0.10`, `TIME_MIN_RELATIVE_CHANGE = 0.10` — relative 10% floor ("never a flat card").
2. Single unscaled `strength`, sorted descending. No cross-type weighting.
3. Card titles/bodies generated in English; only the empty-state message is French.
4. Transport: extended `GET /api/stats` with `keyInsights`. `/api/insights` and `src/main/routes.ts` untouched; no new route.

## Deviation from the plan (with rationale)

- **Review-volume window is date-based (30-day periods), not the plan's `slice(-5)`/`slice(-10,-5)`.**
  The spec scenario `{12 reviews in the recent period vs 6 in the previous}` is impossible with a 5-element slice (both windows would max out at 5 → a meaningless 5-vs-5 comparison). The faithful reading of "recent period vs previous comparable period" is a calendar window: recent = reviews in `[now-30d, now]`, previous = `[now-60d, now-30d]`, each gated by `MIN_WINDOW_SAMPLES = 3`. `now` is injected, so the deriver stays pure/deterministic. This is why volume counts are timestamp-anchored, and why the HTTP acceptance test (whose route calls the real `new Date()`) uses a `categoryBreakdown` fixture (a `now`-independent candidate) rather than timestamped reviews.
  - **Review-time trend KEEPS the plan's `slice(-5)`/`slice(-10,-5)` sample windows** (averaging durations is a per-sample measure, consistent with `getStatsSummary`).

## Self-review

- No `as` / `any` / non-null `!` in new TS files. JSDoc `@type` casts in the view follow the existing humble-object convention (`overview.js`, `statsCharts.js`).
- All imports `@/` + `.js`; no relative imports; no barrel/`index.ts`.
- `null` (not `undefined`) for intentional absence in the deriver.
- Factories used throughout; mocks limited to the in-memory stats gateway at the HTTP boundary.
- Dashboard-module coverage guard satisfied (exactly one test file for `keyInsights.js`).
