# Fix the GitLab change-size source

## Status: implemented

## Implementation

- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` — additions/deletions sourced from GitLab GraphQL `diffStatsSummary`; `commitsCount` still from the REST `/commits` call (keeps `DiffStats` shape stable); a missing diff summary or fetch/parse error now throws instead of returning `null` silently.
- Failures surface as warnings via the existing `fetchDiffStatsSafely` wrapper (`claudeInvoker`) and the `gitlab.controller.ts:1209-1213` catch — constructor signature unchanged, no logger injection.
- Tests: unit `src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts` (11), acceptance `src/tests/acceptance/206-fix-gitlab-diff-stats-source.acceptance.test.ts` (3).
- GitHub gateway untouched (rule 4).

## Context

Every GitLab review records change-size data (lines added/deleted) as empty, so the
main project shows zero additions/deletions across 240 reviews and quality cannot be
correlated with change size. The GitLab fetch reads fields the REST merge-request
endpoint never returns; the correct numbers exist but were never read.

## Rules

- GitLab change-size data comes from the merge request diff summary (additions, deletions, files changed)
- a merge request that exposes a diff summary yields its real additions and deletions
- a fetch that returns no usable diff summary yields no change-size data and is logged as a warning, never swallowed silently
- GitHub change-size fetching keeps its existing behaviour, unchanged

## Scenarios

- gitlab with changes: {platform: "gitlab", project: "group/proj", mr: 5444} → additions 629 + deletions 3 + filesChanged 11
- gitlab no diff summary: {platform: "gitlab", project: "group/proj", mr: 9999} → no change-size data + warning logged
- gitlab fetch error: {platform: "gitlab", project: "missing", mr: 1} → no change-size data + warning logged
- github unchanged: {platform: "github", project: "owner/repo", mr: 252} → additions * + deletions *

## Out of Scope

- Backfilling historical reviews that already recorded empty change-size data (see spec-207)
- Rendering additions/deletions anywhere in the dashboard
- Populating change-size data on the GitLab webhook payload (the webhook does not expose it)

## Glossary

| Term | Definition |
|------|------------|
| change-size data | The additions, deletions and files-changed counts of a merge/pull request |
| diff summary | The platform-provided per-merge-request totals of lines added and removed |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Self-contained fetch fix |
| Negotiable | OK | Spec fixes the "what" (real numbers + logged failures), not the query mechanism |
| Valuable | OK | New GitLab reviews record real change size immediately |
| Estimable | OK | One gateway + its test |
| Small | OK | ~2 files |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.
