# Plan — 234 Dashboard Monitoring view

Spec: [234-dashboard-monitoring-tab](../specs/234-dashboard-monitoring-tab.md)

## Key finding

Review sessions are **not** children of ReviewFlow: they are dispatched with `claude --bg` and owned
by the Claude daemon. `claude agents --json` returns each session with `id`, `pid` and `cwd` — the
authoritative listing. ReviewFlow sessions are the ones whose `cwd` is under `WORKTREE_BASE_DIR`
(`~/.reviewflow/worktrees`). The session process tree is measured from the Linux process table.

New bounded context `runtime-monitoring` (read-only, no business coupling with review execution).

## Layers

| Layer | File | Change |
|-------|------|--------|
| Entity | `src/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.ts` | `ProcessRecord`, `CpuSample`, `measureProcessTree()`, `cpuPercentBetween()` |
| Entity | `src/modules/runtime-monitoring/entities/resourceUsage/processTable.gateway.ts` | contract: per-process table, `null` when the OS cannot report it |
| Entity | `src/modules/runtime-monitoring/entities/resourceUsage/serverRuntime.gateway.ts` | contract: ReviewFlow process + host measures |
| Entity | `src/modules/runtime-monitoring/entities/reviewSession/reviewSessionListing.gateway.ts` | contract: review sessions with main pid, `null` when listing fails |
| Entity | `src/modules/runtime-monitoring/entities/monitoringSnapshot/monitoringSnapshot.ts` | snapshot data shape returned by the endpoint |
| Use case | `src/modules/runtime-monitoring/usecases/getMonitoringSnapshot.usecase.ts` | assembles server state, process, host, sessions; keeps the previous CPU samples |
| Gateway | `src/modules/runtime-monitoring/interface-adapters/gateways/processTable.procfs.gateway.ts` | reads `/proc/<pid>/stat` (ppid, utime+stime, rss); `null` without `/proc` |
| Gateway | `src/modules/runtime-monitoring/interface-adapters/gateways/serverRuntime.node.gateway.ts` | `process.memoryUsage/cpuUsage/uptime`, `os.loadavg/totalmem/freemem` |
| Gateway | `src/modules/runtime-monitoring/interface-adapters/gateways/reviewSessionListing.claude.cli.gateway.ts` | parses `claude agents --json`, keeps sessions under the worktree root |
| Controller | `src/modules/runtime-monitoring/interface-adapters/controllers/http/monitoring.routes.ts` | `GET /api/monitoring` |
| Wiring | `src/main/routes.ts` | register the route with the three gateways, supervisor store, version |
| Dashboard | `modules/monitoringView.js` | view model + HTML (server, process, host, sessions; "indisponible", "mesure en cours") |
| Dashboard | `modules/monitoringPolling.js` | start/stop a 5 s poller bound to the active view |
| Dashboard | `modules/viewNavigation.js` | fourth view `monitoring` |
| Dashboard | `modules/shellTranslations.js` | EN/FR wording |
| Dashboard | `index.html` | view container, poller started/stopped by `setActiveView` |

No new CSS: the view reuses `card`, `metric-grid`, `data-table`, `queue-empty`, `dot-*`.

## Order (inside-out)

1. Acceptance test `src/tests/acceptance/234-dashboard-monitoring-tab.acceptance.test.ts` (RED)
2. `resourceUsage.ts` (tree aggregation, CPU delta)
3. `GetMonitoringSnapshotUseCase` with stubs of the three gateways
4. Gateways: procfs (temp fake `/proc`), claude CLI listing (stub runner), node runtime
5. Route (Fastify inject), wiring
6. Dashboard modules: `monitoringView.js`, `monitoringPolling.js`, `viewNavigation.js`, translations, `index.html`
7. Acceptance GREEN, `yarn verify`, `yarn format`

## Decisions

- CPU % = Δ CPU time / Δ wall time × 100 (one core = 100 %). First measure → `null`.
- Linux constants: 100 ticks/s, 4096-byte pages (spec assumption 3).
- Previous CPU samples kept in the use case instance (single instance in the composition root);
  samples of sessions no longer listed are dropped.
- Server status rule duplicated from `/health` (`degraded` when supervisor `down`): two lines, no
  shared helper worth extracting.
