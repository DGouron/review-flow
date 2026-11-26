# Report — 234 Dashboard Monitoring view

Spec: [234-dashboard-monitoring-tab](../specs/234-dashboard-monitoring-tab.md) — Plan:
[234-dashboard-monitoring-tab.plan](../plans/234-dashboard-monitoring-tab.plan.md)

## Status: complete

## Files

### Created

| File | Role |
|------|------|
| `src/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.ts` | `measureProcessTree`, `cpuPercentBetween` |
| `src/modules/runtime-monitoring/entities/resourceUsage/processTable.gateway.ts` | contract |
| `src/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.ts` | contract + runtime types |
| `src/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.ts` | contract |
| `src/modules/runtime-monitoring/entities/monitoringSnapshot/monitoringSnapshot.ts` | endpoint data shape |
| `src/modules/runtime-monitoring/usecases/getMonitoringSnapshot.usecase.ts` | snapshot assembly, CPU samples |
| `src/modules/runtime-monitoring/interface-adapters/gateways/processTable.procfs.gateway.ts` | Linux `/proc` reader |
| `src/modules/runtime-monitoring/interface-adapters/gateways/serverRuntime.node.gateway.ts` | Node `process` / `os` |
| `src/modules/runtime-monitoring/interface-adapters/gateways/reviewSessionListing.claude.cli.gateway.ts` | `claude agents --json` |
| `src/modules/runtime-monitoring/interface-adapters/controllers/http/monitoring.routes.ts` | `GET /api/monitoring` |
| `src/dashboard/modules/monitoringView.js` | view model + HTML |
| `src/dashboard/modules/monitoringPolling.js` | fetch + 5 s poller |
| `src/dashboard/modules/monitoringTranslations.js` | EN / FR wording |
| `src/tests/acceptance/234-dashboard-monitoring-tab.acceptance.test.ts` | outer loop |
| `src/tests/factories/monitoring.factory.ts`, `src/tests/stubs/{processTable,serverRuntime,reviewSessionListing}.stub.ts` | test data |
| 9 unit test files under `src/tests/units/modules/runtime-monitoring/` and `src/tests/units/dashboard/modules/` | inner loop |

### Modified

| File | Change |
|------|--------|
| `src/main/routes.ts` | registers `monitoringRoutes` |
| `src/dashboard/index.html` | Monitoring view container, poller started / stopped by `setActiveView` |
| `src/dashboard/modules/viewNavigation.js` | fourth view `monitoring` |
| `src/dashboard/modules/i18n.js` | merges the Monitoring translations |
| `src/tests/units/dashboard/modules/viewNavigation.test.ts` | Monitoring view case |

## Tests

- Acceptance: 13 scenarios GREEN (`234-dashboard-monitoring-tab.acceptance.test.ts`)
- Inner loop: entity 10, use case 8, gateways 13, route 1, dashboard 26 tests
- `yarn verify`: 581 files, 5053 tests passed; typecheck, lint (no warning on new files), format OK
- Smoke on macOS: the CLI gateway parses the real `claude agents --json`; procfs reports `null`
  (per-session measures "indisponible") as specified

## Spec coverage

| Scenario | Test |
|----------|------|
| nominal server / supervisor down / process memory | acceptance + use case |
| first measure / second measure | acceptance + `resourceUsage.test.ts` |
| review session listed (tree aggregation) | acceptance + `resourceUsage.test.ts` |
| session CPU | acceptance + use case |
| foreign session ignored | `reviewSessionListing.claude.cli.gateway.test.ts` |
| no process table | acceptance + procfs gateway |
| session process gone | acceptance |
| listing failure | acceptance + CLI gateway |
| view polling | acceptance + `monitoringPolling.test.ts` |
| view rendering (empty / unavailable) | acceptance + `monitoringView.test.ts` |

## Known limitations

- **Per-session CPU is an approximation.** It sums `utime + stime` of the processes alive in the
  tree at each measure. A child that exits between two measures takes its CPU time with it (Linux
  only folds it into the parent's `cutime` after `wait`, which is not summed), so the delta can
  under-report, and is clamped to 0 when the sum goes down. A descendant re-parented to init
  (double fork) leaves the tree.
- Linux constants are assumed (100 ticks/s, 4096-byte pages).
- Each refresh runs `claude agents --json` (a Node CLI start) while the Monitoring view is open.
- Never exercised on the production Linux host: the procfs gateway is covered by a fake `/proc`.
