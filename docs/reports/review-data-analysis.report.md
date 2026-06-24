# ReviewFlow Review-Data: Action Report

> Data-analyst swarm (7 agents): discovery inventory over 3 real datasets
> (students-app 100 reviews, review-automation 43, main-app-v3 100 retained / 104 lifetime)
> → 5 analysis angles (captured-vs-missing, unsurfaced metrics, actionability, data quality,
> trends/correlations) → synthesis. Every claim is backed by a number computed from the data.

> **Verified by main thread:** main-app-v3 `averageScore`=7.7247 (=2850.4/369) while the
> mean over the 89 visible scored records is **8.2393**. `scoredReviewCount`=369 vs 89 scored
> in a `reviews[]` trimmed to 100. The headline/visible mismatch is real. Whether 7.72 is an
> intentional lifetime average or a write-path double-count needs a read of the aggregate
> write path before calling it a bug.

## Executive summary

- **The headline score may mislead.** main-app-v3 `averageScore` reads **7.72** but the mean over the 89 visible scored records is **8.24** — a **-0.51 pt (-6.2%)** gap, because `scoredReviewCount` (369) is a lifetime counter while `reviews[]` is trimmed to 100. Score-based targets/trends rest on a baseline that doesn't match the visible data.
- **Two whole subsystems are inert: category breakdown and thread counts.** `categoryBreakdown` has **0 real values across all 243 records** (9 occurrences, all `null`) because the review skill never emits the `categories=` marker — the parser is correct, the emitter is silent. `threadsOpened`/`threadsClosed` are computed in the tracking use case but **never persisted**. Both are near-free wins unlocking entire chart classes.
- **Scoring silently breaks and nobody is alerted.** review-automation ran **41.9% null scores (18/43)**, **15-16 clustered in a single 7-day window (2026-05-23 → 29)** — a parser/emitter regression undetected for a month. No scoring-coverage indicator, so the displayed average (7.88) silently rests on 25 of 43 reviews.
- **The richest untapped signal is commit count.** `r(commits, score) = -0.41`, replicated in both modern datasets (-0.406 / -0.411), surviving control for diff size (additions residual r≈-0.07). Commit count predicts quality better than raw lines and is known *before* the review runs — a pre-review "split this MR" nudge + coaching chart.
- **The quality story is real but unshown.** main-app-v3 has a **67-review blocking-free streak since 2026-05-22**, "excellent" (≥8.5) share rose **50% → 62%** over 6 weeks, and all 4 shared developers improved **+0.59 to +1.65** over 3 months. The dashboard shows only cumulative totals.

## Prioritized recommendations (deduped across angles)

| Impact | Effort | Insight | Recommended action | Data evidence |
|---|---|---|---|---|
| High | Low | main-app-v3 `averageScore` mismatch (lifetime counter vs trimmed window) | Derive `averageScore` on the frontend from `reviews[]` (filter `score!==null`, sum/count); stop displaying the aggregate counter as the headline | aggregate 7.7247 (2850.4/369) vs record mean 8.2393; `scoredReviewCount`=369 vs 89 scored / 100 retained |
| High | Medium | Suspected write-path double-count of `scoredReviewCount` on followups/re-reviews | In the aggregate update, increment only when `score!=null` AND record `id` is new; then one-time `recalculateProjectStats` for all 3 datasets | counter 369 vs 89; drift also in totalBlocking/totalWarnings |
| High | Medium | `categoryBreakdown` inert — 0/243 real values; chart permanently empty | Add `categories=security=…,logic=…` to the `[REVIEW_STATS:]` marker the review skill emits (parser already supports it); failing test for a populated breakdown | 9/100 main-app-v3 keys all `null`; 0/243 populated |
| High | Low | Commit count is the strongest score predictor, available pre-review | "Score by commit count" bar chart (1 / 2-3 / 4-6 / 7+) + pre-review warning at `commitsCount>=10` or `additions>=3000` | r(commits,score)=-0.411 (n=89) & -0.406 (n=25); 1 commit→8.83, 7+→7.73 |
| High | Medium | Per-developer blocking/score spread (4-20x) buried under team totals | Per-developer table: review count, null-safe avg score, blocking/review, zero-blocking %, 10-review trend; coaching alert at blocking/review > 1.0 | students-app zero-blocking 85% (damien) vs 20% (mathys); main-app-v3 blocking/review 0.06 vs 1.29; `assignedBy` 242/243 |
| High | Low | Score-tier shift (50%→62% excellent) and 67-review blocking-free streak unshown | Stacked weekly score-tier chart (<7 / 7-8.5 / ≥8.5) + "blocking-free streak" widget | tiers: 50%→39%→62% excellent; last blocking 2026-05-22, 67 clean since |
| Medium | Medium | Developer growth measurable across 3 months for 4 shared devs | Per-developer score line chart (bi-weekly / rolling 10) | dariu5 +1.65, mathys4 +1.34, augegauthier +0.59, damien +0.60 |
| Medium | Low | Scoring breaks silently (41.9% null in review-automation, regression-shaped) | "Scoring coverage" KPI (scored/total); alert when null rate > 15% in any 7-day window; warn-log every `score=null` write | 16/18 nulls in 7 days (2026-05-23→29); null MRs avg additions 1352 vs 1109 scored |
| Medium | Low | Duration is an inverse quality proxy, not a throughput vanity metric | Replace headline `totalDuration` with a duration-band histogram; flag `>10min AND score<7` for inspection | r(duration,score)=-0.492 (n=89); <5min→8.94, >10min→7.48 |
| Medium | Low | Blocking≥3 is an unambiguous merge-gate signal independent of score | Hard "do not merge" badge at blocking≥3, soft "needs attention" at blocking≥1 | main-app-v3 p90 blocking=0; MR#5019 (9, 4.2), #5341 (5, 6.0), #5332 (3, 6.2) |
| Medium | Low | Weekly throughput + day/hour seasonality never displayed | reviews/week sparkline (4-week rolling vs all-time) + day×hour volume heatmap | students-app 19.9/wk, main-app-v3 17.0/wk; Tue+Wed = 51%; afternoon (12-18 UTC) 58 vs morning 33 |
| Medium | Low | Thread counts computed in tracking but discarded | Add `threadsOpened`/`threadsClosed` to the stats schema and persist from `RecordReviewCompletionUseCase` | 0/243 records carry thread fields; use case receives them, writes only to `TrackedMr` |
| Medium | Medium | Re-review score deltas untracked (feedback-loop signal) | On duplicate `mrNumber`, compute/store `scoreDelta`/`blockingDelta`; surface re-review improvement rate per dev | students-app 5/8 re-reviews improved (MR#4879 +2.5); main-app-v3 MR#5340 +1.2, blocking 2→0 |
| Low | Low | 11.9% of records fully opaque (null score + all-zero signals) | Add `parseFailure: true` flag + structured log when all four signals resolve to zero | 29/243 opaque; 15/18 automation clustered in 7 days |
| Low | Low | review-automation aggregate missing `totalCommits`/`averageCommits` despite data present | Run existing `recalculateProjectStats` for that project — no code change | commitsCount on 43/43; sum=151, mean=3.51; aggregate fields `undefined` |
| Low | Medium | `diffStatsReviewCount` drift (18 vs 43 on review-automation) | Reset counter to `count(diffStats!=null)`; remove the `initializeCumulativeCounters` early-return blocking sibling resets | review-automation 18 vs 43; main-app-v3 104 vs 100 |
| Low | Low | Aggregate totals (`totalAdditions/Deletions`) are vanity + drift-inflated | Demote from hero; show per-review median/p90 + additions:deletions ratio | totalAdditions 121,850 vs record sum 113,543 (+8,307); ratio 4.27:1 |
| Medium | Low | 41.2% of corpus (legacy students-app) has no diffStats — size charts misleading | Show diffStats-covered count (143) separately from total (243); filter legacy out of size-normalized charts | students-app 0/100 diffStats; modern 143/143; backfill needs GitLab API per MR |

## Capture more / fix data (pipeline + integrity)

- **Investigate the score-counter (write path).** Confirm whether `scoredReviewCount` double-increments on followup re-reviews; if so, increment only when `score` is non-null and the record `id` is new. Then run a one-time `recalculateProjectStats` across all three projects. Add a Vitest guard that a re-review of an existing `id` does not move the counter.
- **Emit `categories=` from the review skill.** Single addition to the skill's summary prompt mapping the 6 existing keys. Failing test asserting a sample marker parses to a non-null `CategoryBreakdown`. Until this lands, the category chart is dead for 100% of new reviews.
- **Persist thread counts.** Add `threadsOpened`/`threadsClosed` to the stats record schema, write them from `RecordReviewCompletionUseCase` (already received as inputs). Zero new collection.
- **Make scoring failures detectable.** Structured log whenever a record is written with `score=null` (or all four signals zero) + a `parseFailure` flag. Would have surfaced the May 2026 regression operationally.
- **Fix the `score=null` parser regression.** Audit the score-extraction regex against actual Claude output from May 2026 onward; CI test for the current marker format; test that score-absent returns `null` (never 0). Investigate why large MRs (>1000 additions) are ~22% more likely to yield null scores.
- **Reset stale diff counters.** Recompute `diffStatsReviewCount` (and `totalCommits`/`averageCommits` for review-automation) via the existing recalculation use case.
- **Decide the trim model.** main-app-v3 trims `reviews[]` to 100 but counters run monotonically. Either document running counters as intentional lifetime KPIs and switch diff/score averages to window-based over retained records, or raise the retention cap (100→500). Add an "averages reflect last N reviews" UI label.
- **Legacy diffStats gap (optional, high effort).** Backfill via the GitLab GraphQL `diffStatsSummary` per historical `mrNumber`. Until done, filter legacy records out of cross-project volume charts and show a data-gap warning.

## Surface more / new dashboard insights (charts, KPIs, alerts)

- **Frontend-derived score** computed from `reviews[]`.
- **Score-by-commit-count bar chart** (1 / 2-3 / 4-6 / 7+) with the team's target line — highest-signal missing chart.
- **Duration vs Score scatter** with regression line.
- **Weekly score-tier stacked chart** (<7 / 7-8.5 / ≥8.5) + **blocking-free streak widget** + **blocking/week sparkline**.
- **Per-developer leaderboard** + **per-developer growth line chart**.
- **Reviews/week sparkline** + **day×hour volume heatmap** (Tue/Wed peak, afternoon-heavy).
- **KPIs/alerts:** scoring-coverage % (alert < 80% / >15% null in 7 days); merge-gate badge (blocking≥3 hard, ≥1 soft); pre-review large-MR warning; "categorized review count" pipeline-health stat; diffStats-covered count (143) shown alongside total (243).
- **Empty-state the category chart** until real data flows.

## Top 5 to build next (spec candidates, ordered by impact/effort)

1. **`fix(stats): correct score aggregation`** — derive `averageScore` from `reviews[]` on the frontend + investigate/stop `scoredReviewCount` double-increment + one-time recalculation across all 3 projects. (High / low-med; fixes the -0.51pt headline mismatch.)
2. **`feat(stats): score-by-commit-count chart + large-MR pre-review warning`** — surface the replicated r=-0.41 commit-vs-score signal; nudge MR splitting at `commitsCount>=10`/`additions>=3000`. (High / low.)
3. **`feat(skill): emit category breakdown marker`** — add `categories=` to `[REVIEW_STATS:]` so the existing parser/aggregate/chart finally receive data. (High / medium; unblocks a shipped-but-inert subsystem.)
4. **`feat(stats): per-developer quality panel + growth line`** — review count, null-safe score, blocking/review, zero-blocking %, trend; coaching alert at blocking/review>1.0. (High / medium.)
5. **`feat(stats): scoring-coverage KPI + null-score alert`** — display scored/total; alert at >15% null in any 7-day window; log every null-score write. (Medium / low.)
