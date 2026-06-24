# ReviewFlow /stats — Prioritized UX Improvement Plan

> Multi-agent UI/UX audit (6 agents: visual hierarchy, metric relevance, interaction,
> accessibility, DNA-consistency/responsive → synthesis). All findings verified
> against the actual source.

> **Note on "Bugs detected" tile:** this audit flags the `bugsDetected` tile as
> redundant (`= blocking + warnings`). It was deliberately restored on explicit
> request (regression: the total had been lost). Keep unless the owner agrees to
> prune. See finding row "Remove the Bugs detected tile".

## Executive summary

- **The page has no focal point.** The five Volume hero tiles are visually identical and `hero-reviews` is the *only* tile with no color accent (`stats.html:135-138` skip it), so the metric that anchors the page reads as the least important. Fixing hierarchy here is the single highest-leverage change.
- **Two metrics are pure noise and should be deleted.** `bugsDetected` is literally `blocking + warnings` rendered next to its own components (`statsPage.js:124,140,144`), and **Total time** is a monotonic vanity number sitting in a section labeled QUALITY. Removing both *increases* signal while *reducing* code.
- **Charts are off-brand and inaccessible.** Every `ctx.font` in `statsCharts.js` uses `system-ui` instead of JetBrains Mono (breaks the Agentic OS DNA), and all five `<canvas>` elements have no `role`/`aria-label`/fallback — a WCAG 1.1.1 failure repeated across the whole analytics zone.
- **Animation and trend cues ignore assistive tech.** `animateCounter` (`statsCharts.js:629-662`) has no `prefers-reduced-motion` guard, and trend arrows + dev-filter state are conveyed by color/icon only with no `aria-pressed`/`sr-only` text — three high-severity a11y gaps that share one small CSS+JS fix.
- **A handful of token/font/responsive defects are near-zero-effort** (hardcoded `#ffca63` vs `var(--accent)`, missing `var(--font-mono)` on labels, no mid-range chart breakpoint) and can ship as one consistency pass.

## Findings (sorted by impact, deduped across dimensions)

| Severity | Area | Problem | Recommendation |
|---|---|---|---|
| High | Hierarchy / Layout | `hero-reviews` tile is the only Volume tile with no `::before` accent color (`stats.html:135-138`) and shares identical 2rem sizing — no anchor for the eye. | Give `hero-reviews::before` an accent color and bump its `stats-hero-value` font-size (or break it into a full-width hero row above the 4 code tiles). |
| High | IA / Relevance | `bugsDetected` is `blocking + warnings` rendered as a sibling tile to both components (`statsPage.js:124,140,144`; presenter `:98`) — zero added information. | Remove the "Bugs detected" tile; keep Blocking + Warnings as the actionable breakdown. *(Conflicts with explicit restore request — keep for now.)* |
| High | IA / Relevance | **Total time** is a monotonic vanity metric with no target/direction occupying prime space in the QUALITY grid (`statsPage.js:131-133`). | Remove Total time from QUALITY; keep Average time. Move raw totals to Volume/ops panel if needed for cost accounting. |
| High | Accessibility | All five `<canvas>` charts have no `role`, `aria-label`, or fallback text — WCAG 1.1.1 / 4.1.2 failure (`statsPage.js:182-202`). | Add `role="img"` + generated `aria-label` summary per canvas, set alongside the draw call in `statsCharts.js`. |
| High | Accessibility | `animateCounter` runs an 800ms rAF loop with no `prefers-reduced-motion` guard (`statsCharts.js:629-662`); also count-down on negative `netLines` and mid-animation `/10` suffix. | Short-circuit to final value when `(prefers-reduced-motion: reduce)`; append `/10` only on the final frame; render negative targets directly. |
| High | Accessibility | Trend arrows are color+icon only with no text; dev-filter `active` state has no `aria-pressed` (`statsPage.js:17-21,158-168`; `stats.html:308-318`) — invisible to screen readers (WCAG 4.1.2). | Add `aria-hidden="true"` to icons + `.sr-only` direction text; set `aria-pressed` on each dev-filter button in `filterScoreTrend`. |
| High | DNA Consistency | Every `ctx.font` in `statsCharts.js` uses `system-ui`/bare px, never JetBrains Mono — breaks the chart-label DNA across all 5 charts. | Replace all `ctx.font` assignments with `'10px "JetBrains Mono", monospace'` (incl. `drawNoDataMessage`). |
| High | Responsiveness | No breakpoint between 641px and the 2-col chart grid; 460px canvas fallback overflows ~300px cards (`styles.css:3267`; `statsCharts.js:43`). | Add `@media (max-width: 900px) { .stats-charts-row { grid-template-columns: 1fr } }` or lower fallback `cssWidth`. |
| High | Responsiveness | `bugs-category` canvas is 120px tall with 44px bottom padding → labels overlap bars past 4-5 categories (`styles.css:3208-3210`; `statsCharts.js:554,617`). | Raise `.stats-canvas-wide` to 180px (matching other charts) or cut bottom padding 44→30. |
| High | Hierarchy / DNA | Date-range banner (`.stats-period`) is styled almost identically to `.stats-section-eyebrow` (11px amber caps) and has no `//` eyebrow prefix (`stats.html:104-113`; `statsPage.js:215-219`). | Enlarge to `--type-base`, add a 4px amber left-border accent, prefix `// PERIOD`, and bump `margin-bottom` to `--space-6`. |
| High | Interaction | `.btn-secondary:disabled` is undefined, so the disabled Recalculate button looks unchanged during the 1.5s wait. | Add `.btn-secondary:disabled { opacity:.45; cursor:not-allowed }`, swap to a spinner icon + progress label while in-flight. |
| High | Interaction | No loading/skeleton state — `#stats-content` shows a literal `…` during sequential fetches (`stats.html:200,280-306`). | Render a skeleton mirroring period banner + 5 hero tiles + 6 KPIs + canvases, or the existing `.data-loading` spinner immediately. |
| Medium | IA / Relevance | Blocking has a trend icon but Warnings (the larger set) does not (`statsPage.js:140,144`). | Compute `trend.warnings` with the same 5-review window and render its icon next to Warnings. |
| Medium | IA / Relevance | Net lines is the weakest risk signal; churn (`(add+del)/commits`) is absent (`statsPage.js:93-96`). | Replace/augment Net with a `lines/MR` churn tile — computable from existing aggregates. |
| Medium | IA / Relevance | Score Distribution renders 0-2 at top → eye lands on failure bands first (`statsCharts.js:478-484`). | Reverse the ranges array so 8-10 sits on top (leaderboard convention). |
| Medium | IA / Relevance | Key Insight cards have no severity/direction cue — all look identical despite `key` + `strength` being available (`keyInsights.js:31-38`). | Pass `key` through the presenter and map to a modifier class (directional green/red, amber for dominant category). |
| Medium | Hierarchy | Volume and Quality eyebrows share identical styling — flat narrative (`stats.html:97-103`). | Elevate `// VOLUME` to `var(--ink-1)`/`var(--accent)` + `font-weight:600`; keep `// QUALITY` at `--ink-2`. |
| Medium | Hierarchy | Charts block has no eyebrow — floats unlabeled between Quality and Key Insights (`statsPage.js:176-205`). | Wrap charts in a `<section>` with a `// TRENDS` / `// ANALYSIS` eyebrow. |
| Medium | Interaction | Project select fires `window.location.href` immediately, killing in-progress animations with no feedback (`stats.html:256-258`). | Debounce ~300ms + show a loading overlay/cursor-wait during reload. |
| Medium | Interaction / a11y | Project select and dev-filter buttons lack hover/focus border feedback; active dev-filter focus ring clashes with the blue active tint. | Add `:hover`/`:focus` border rules + a distinct `.dev-filter-btn:focus-visible { outline:2px solid var(--accent) }`. |
| Medium | DNA Consistency | Key-insight border uses hardcoded `#ffca63` instead of `var(--accent)`; several label selectors don't use `var(--font-mono)`. | Swap to `var(--accent)` and `var(--font-mono)`; centralize the `//` eyebrow via a helper. |
| Medium | a11y / IA | Ratio bar is `aria-hidden` with no textual equivalent of the add/del split (`statsPage.js:47-58`). | Inject an `.sr-only` summary ("68% additions, 32% deletions") reusing computed percentages; add a visible mini-label. |
| Low | IA / Relevance | Review Activity (weekly) duplicates Reviews per Month (monthly). | Drop weekly chart or replace with per-developer review-count breakdown. |
| Low | a11y | Chart-title icons + back/recalculate icons aren't `aria-hidden`; Key Insights section has no accessible name. | Add `aria-hidden="true"` to decorative `<i>`; make `.key-insights-title` an `<h2>` with `aria-labelledby`. |
| Low | Interaction | Canvas charts have no hover tooltip and Score Trend has no legend for amber/blue point types. | Add `mousemove` hit-testing tooltip; at minimum a static legend below Score Trend. |
| Low | Interaction | Back link has no `title`/keyboard shortcut. | Add `title` + wire `Alt+ArrowLeft` to `/dashboard/`. |

## Top 5 quick wins (high impact, low effort)

1. **Delete the two noise metrics** — remove the `bugsDetected` tile and the Total time tile. Net negative LOC, immediate signal gain. *(bugsDetected conflicts with explicit restore request.)*
2. **Give Reviews a color identity** — `.hero-reviews::before { background: var(--accent) }` + one-tile font-size bump. One CSS rule establishes the missing page anchor.
3. **Reduced-motion + suffix guard in `animateCounter`** — one `matchMedia` check fixes a high-severity WCAG gap and the `3.2/10` mid-animation glitch.
4. **JetBrains Mono on chart labels + token cleanup** — find/replace every `ctx.font`, swap `#ffca63`→`var(--accent)`, add `var(--font-mono)` to label selectors. Pure consistency pass.
5. **`aria-pressed` + `.sr-only` trend text + `aria-hidden` icons** — small edits clear three a11y findings at once.

## Bigger bets (higher effort / cross-cutting)

- **Canvas accessibility layer** — generate a textual summary per chart, set `role="img"` + `aria-label` from the draw functions.
- **Skeleton loading state** — placeholder markup mirroring real layout, wired into the sequential fetch flow.
- **Volume metric redesign** — replace Net lines with churn (`lines/MR`) and re-balance the hero grid.
- **Interactive chart tooltips** — store point coordinates during draw, add `mousemove` hit-testing across canvases.
- **Section hierarchy + narrative pass** — two-tier eyebrows, `// TRENDS` charts eyebrow, elevated period banner as one coherent rhythm change.

## Next steps — ReviewFlow spec candidates

- `spec: stats-hero-anchor` — Give the Reviews tile a color accent + size bump so Volume has one clear focal metric.
- `spec: stats-prune-noise-metrics` — Remove Total time tile (and reconsider `bugsDetected`); drop derived fields from presenter.
- `spec: stats-canvas-a11y` — Add `role="img"` + generated `aria-label`/fallback summaries to all five charts.
- `spec: stats-reduced-motion-counters` — Guard `animateCounter` with `prefers-reduced-motion` and fix negative/suffix edge cases.
- `spec: stats-trend-and-filter-a11y` — `aria-pressed` on dev filters, `.sr-only` direction text on trend arrows, `aria-hidden` on decorative icons.
- `spec: stats-chart-mono-and-tokens` — JetBrains Mono on all canvas labels; replace hardcoded `#ffca63` with `var(--accent)`.
- `spec: stats-chart-responsive` — 900px chart breakpoint; fix bugs-by-category canvas height/padding clipping.
- `spec: stats-loading-skeleton` — Replace `…` placeholder with a layout-matching skeleton.
- `spec: stats-warnings-trend` — Compute and render `trend.warnings` symmetrically with `trend.blocking`.
- `spec: stats-churn-metric` — Replace the Net lines tile with a `lines/MR` churn indicator.
- `spec: stats-period-banner-elevation` — Promote the date-range banner to a page-level header with `// PERIOD` eyebrow and accent stripe.
- `spec: stats-insight-severity-cues` — Thread `KeyInsight.key` through the presenter to apply directional color/severity classes to insight cards.
