# Report: 223 — Update a source-checkout install from the dashboard

- Spec: [docs/specs/223-source-checkout-self-update.md](../specs/223-source-checkout-self-update.md)
- Plan: [docs/plans/223-source-checkout-self-update.plan.md](../plans/223-source-checkout-self-update.plan.md)
- Branch: `feat/223-source-checkout-self-update`
- Date: 2026-08-05

## Outcome

The dashboard's update button now performs the update on a source-checkout install instead of printing a
command to copy. Five ordered preconditions gate it, the first unmet one refusing everything, and every
refusal reaches the user as a toast worded in their language.

Two of those preconditions turned out not to be checkout-specific and now guard the global-install path as
well — that path could previously be reinstalled and restarted by any machine on the network, and during a
running review.

## What was verified

```
yarn verify   → typecheck + lint + format:check + test:ci
  typecheck     0 errors
  lint          0 errors (pre-existing warnings only, unchanged)
  format:check  all files correctly formatted
  test:ci       4406 tests passed / 4406, 521 files, 0 failures
```

Acceptance test: `src/tests/acceptance/223-source-checkout-self-update.acceptance.test.ts`, 16 cases,
**GREEN**. It stayed RED through iterations 1 and 2 as the outer loop requires: 3 failures after iteration
1 (2 route-level, 1 dashboard-level), 1 after iteration 2 (dashboard-level), 0 after iteration 3.

## Files

### Production (10)

| File | Change |
|------|--------|
| `entities/selfUpdateSequence/localOrigin.ts` | new — `isLocalOrigin(ip)` |
| `entities/selfUpdateSequence/selfUpdateRefusalMotive.ts` | new — 7-variant discriminated union |
| `entities/selfUpdateSequence/queueActivity.gateway.ts` | new — port |
| `entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.ts` | new — port, 5 methods |
| `entities/packageVersion/packageVersion.ts` | `'refused'` added, `'source-checkout'` removed |
| `usecases/version/runSourceCheckoutSelfUpdate.usecase.ts` | new — preconditions 3-5 + fetch + rebuild |
| `usecases/version/triggerSelfUpdate.usecase.ts` | preconditions 1-2 before dispatch |
| `interface-adapters/gateways/queueActivity.pQueue.gateway.ts` | new — wraps `getQueueStats` |
| `interface-adapters/gateways/sourceCheckoutUpdate.cli.gateway.ts` | new — git/yarn execution |
| `interface-adapters/gateways/selfUpdate.cli.gateway.ts` | pid-file fix via `buildRestartArgs` |

Plus `interface-adapters/controllers/http/version.routes.ts`, `main/routes.ts`, and the three dashboard
files (`versionUpdate.js`, `index.html`, `i18n.js`).

### Tests (12)

4 new unit files (`localOrigin`, `selfUpdateRefusalMotive`, the two new gateways,
`runSourceCheckoutSelfUpdate`), 2 new stubs (`queueActivity.stub.ts`, `sourceCheckoutUpdate.stub.ts`),
1 new acceptance file, and 5 existing files extended (`packageVersion`, `triggerSelfUpdate`,
`version.routes`, `selfUpdate.cli.gateway`, `versionUpdate` + `installTypeDetector.stub`).

## Bug fixed along the way

`defaultSpawnDaemonDelayed` respawned the daemon with `['start', '--skip-dependency-check']` and **no
`--daemon`**, right after removing the pid file. The respawned process therefore took the foreground
branch, never reached `StartDaemonUseCase`, and never rewrote the pid file — leaving `reviewflow status`
reporting `stopped` and `reviewflow stop` unable to find a daemon that was in fact running. Reproduced by
hand before the fix, then fixed by extracting `buildRestartArgs(port)` and adding the flag. Both restart
paths share that function, so the global-install path is fixed by the same change.

The previous test suite never exercised the production `spawnDaemonDelayed` — only the injected fake — so
this gap was real. A test now asserts the flag is present.

## Two things deliberately not done

- **Scenario "restarted server is controllable" is verified at the argument level**, not by spawning a
  real process: `buildRestartArgs(port)` contains `--daemon`, and the already-tested `StartDaemonUseCase`
  is trusted to write the pid file from there. A process-level test would be slow and platform-sensitive,
  and this suite has no precedent for one.
- **No per-step progress in the button.** The spec excludes streaming, and the whole sequence is one HTTP
  call, so the button reports "update in progress" and nothing finer. The spec rule was corrected during
  planning to say exactly that — it originally asked for the current step, which was not achievable
  alongside the streaming exclusion.

## Follow-ups worth tracking separately

- `POST /api/settings/*` and `POST|DELETE|PATCH /api/repositories` remain unauthenticated on a server bound
  to `0.0.0.0`. This feature only restricted the update operation; the rest of the write API is unchanged
  and out of scope here.
- `DEFAULT_BRANCH` is the literal `'master'` in `runSourceCheckoutSelfUpdate`. Matches the spec, but a repo
  whose default branch is named otherwise would always be refused.
