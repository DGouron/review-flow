# Report — 231 Dashboard Team and Worktrees views

Spec: [231-dashboard-team-and-worktree-views](../specs/231-dashboard-team-and-worktree-views.md)

## Status: complete

## Files

Created: `src/dashboard/modules/teamView.js`, `src/dashboard/modules/worktreeView.js`, their unit
tests, `src/tests/acceptance/231-dashboard-team-and-worktree-views.acceptance.test.ts`.

Modified: `src/dashboard/index.html` (team and worktree rendering, member filter, purge),
`src/dashboard/shell.css`, `src/dashboard/modules/shellTranslations.js`,
`src/tests/units/dashboard/dashboardLayout.test.ts`.

## Tests

`yarn verify` green. Acceptance test 231: 6 scenarios GREEN.

## Self-review

- Headless captures checked at 1440 px: team view (health, three member cards, stale analysis)
  and worktrees view (counters, table without horizontal page scroll, sweep card).
- Legacy `#worktree-section` styles forced a monospace font and a column layout; `shell.css`
  overrides them inside the shell only.

## Spec coverage

| Rule | Covered by |
|------|------------|
| Member card linked to the queue | `teamView.test.ts`, acceptance |
| Developer sheet reachable | `teamView.test.ts`, acceptance |
| Analysis age, missing members, regenerate, export | `teamView.test.ts`, acceptance |
| No score out of 10 | `teamView.test.ts`, acceptance |
| Worktree table contained, paths shortened | `worktreeView.test.ts`, acceptance, headless capture |
| Sweep, retention, purge with confirmation | `worktreeView.test.ts`, acceptance |
| Worktrees in error | `worktreeView.test.ts` |
