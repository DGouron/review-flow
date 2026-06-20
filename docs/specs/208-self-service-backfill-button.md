# Make the Recalculate button backfill change-size data

## Context

The dashboard `Recalculate` button is meant to backfill missing change-size data, but it
never actually fetches: the action cannot resolve a project's platform (config has no
`platform` field, so it is treated as `null` and the backfill is skipped), and the backfill
feeds the local filesystem path to the platform gateway, which expects the platform project
identifier (`group/project` for GitLab, `owner/repo` for GitHub). Historical data could only
be repaired by an out-of-band script. This makes the button self-service.

## Depends on

- spec-206 (gateway must return real numbers) and spec-207 (backfill must retry null reviews) — both shipped

## Rules

- the backfill resolves each project's platform (GitLab or GitHub) without requiring manual configuration
- the backfill fetches change-size data using the platform project identifier (GitLab namespace / GitHub owner-repo), not the local filesystem path
- a project whose platform or project identifier cannot be resolved is rejected with a clear message, not silently skipped
- after a backfill run the count of reviews that have change-size data is recomputed alongside the totals and averages
- triggering the backfill from the dashboard button populates the missing reviews and the dashboard then shows non-zero totals

## Scenarios

- gitlab project: {localPath: "/.../main-app-v3/frontend", remote: "gitlab.com/group/proj"} → backfill fetches against "group/proj" + reviews populated
- github project: {localPath: "/.../review-flow", remote: "github.com/owner/repo"} → backfill fetches against "owner/repo" + reviews populated
- unresolvable platform: {localPath: "/.../local-only", remote: none} → reject "Plateforme du projet introuvable"
- count maintained: {project with 40 reviews, 40 fetchable} → diffStatsReviewCount 40 + totals/averages recomputed
- nothing missing: {all reviews already have change-size data} → backfill fetches nothing + totals unchanged

## Out of Scope

- Rendering additions/deletions anywhere in the dashboard (separate UI follow-up)
- Backfilling fields other than change-size data
- Inferring platform for projects that have no git remote

## Glossary

| Term | Definition |
|------|------------|
| platform project identifier | The namespace the platform API needs: `group/project` (GitLab) or `owner/repo` (GitHub), distinct from the local filesystem path |
| change-size data | The additions, deletions and files-changed counts of a merge/pull request |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | 206/207 already shipped; this is a self-contained wiring fix |
| Negotiable | OK | "Resolve platform + project identifier" leaves the mechanism (git remote vs config) free |
| Valuable | OK | The button becomes self-service — no out-of-band script needed |
| Estimable | OK | Resolver + pass-through + count fix |
| Small | OK | <10 files |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.
