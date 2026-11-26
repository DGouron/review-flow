# Show a live Monitoring view of the server and its review sessions

## Status: implemented

## Context

When the production server feels slow or swaps, the operator has to SSH in and run `top` to learn
whether ReviewFlow itself or one of the Claude review sessions eats the memory or the CPU. The
dashboard already knows the server is up, but says nothing about what it consumes. A Monitoring view,
refreshed every few seconds, answers "who is consuming what, right now" without leaving the dashboard.

## Rules

- the dashboard offers a fourth view, "Monitoring", next to Review queue, Team and Worktrees
- the Monitoring view refreshes itself every 5 seconds while it is the active view, and stops
  refreshing when another view is shown
- the server state block shows:
  - status: "ok", or "degraded" when the supervisor is down (same rule as the health check)
  - uptime of the ReviewFlow process
  - ReviewFlow version
  - supervisor state (up / down / unknown) and its reason when there is one
- the ReviewFlow process block shows its memory (resident, heap used, heap total) and its CPU usage
- the host block shows the load average (1, 5, 15 min) and the total and free memory of the machine
- CPU usage is the CPU time consumed between two consecutive measures divided by the elapsed time,
  expressed as a percentage of one core (it can exceed 100 % on several cores)
- the first measure has no previous one: its CPU usage is unknown and shown as "mesure en cours"
- a review session is a Claude background session whose working directory is a ReviewFlow review
  worktree; other Claude sessions of the machine are never listed
- each review session shows its worktree, its start time, the number of processes in its process
  tree, the memory of that tree and its CPU usage
- the process tree of a session is its main process and all its descendants
- when the machine cannot report per-process resources (no Linux process table, e.g. macOS in
  development), sessions are still listed but their memory and CPU are shown as "indisponible"
- a session whose main process is gone between the listing and the measure is listed with memory
  and CPU "indisponible"
- when the session listing itself fails, the view says the sessions are "indisponibles" and the
  server and process blocks are still shown
- the monitoring endpoint never fails because a measure is missing: a missing measure is `null`

## Scenarios

- nominal server: {supervisor: up, version: "3.57.0", uptime: 3600 s} → status "ok" + version "3.57.0" + uptimeSeconds 3600 + supervisor.state "up"
- supervisor down: {supervisor: down, reason: "daemon unreachable"} → status "degraded" + supervisor.reason "daemon unreachable"
- process memory: {rss: 200 MB, heapUsed: 80 MB, heapTotal: 120 MB} → process.memory {rssBytes, heapUsedBytes, heapTotalBytes}
- first measure: {no previous measure} → process.cpuPercent null + every session cpuPercent null
- second measure: {ReviewFlow consumed 500 ms CPU over 1000 ms} → process.cpuPercent 50
- review session listed: {Claude session pid 4100 in worktree "github-acme-app-1526", children 4101 and 4102} → session worktree "github-acme-app-1526" + processCount 3 + memoryBytes = sum of the three
- session CPU: {session tree consumed 2000 ms CPU over 1000 ms between two measures} → session cpuPercent 200
- foreign session ignored: {Claude session working in "/home/ai/projects/app"} → not listed
- no process table: {machine without Linux process table} → sessions listed + memoryBytes null + cpuPercent null + resourcesAvailable false
- session process gone: {listed session pid 4200 absent from the process table} → session memoryBytes null + processCount 0
- listing failure: {Claude session listing fails} → sessions.available false + server and process blocks present
- view polling: {Monitoring view opened, then Review queue opened} → refresh every 5 s, then no more refresh
- view rendering: {sessions empty} → "Aucune session de revue active"
- view rendering unavailable: {session memory null} → "indisponible"

## Out of Scope

- history, charts, trends, persistence of the measures
- alerts and thresholds
- live push (WebSocket / server-sent events): polling only
- host-wide metrics beyond load average and total / free memory (disk, network, per-core usage)
- Ember chat and AI insights sessions (they do not run in a review worktree)
- any change to the version / self-update feature
- per-process detail of a session tree (only the aggregated tree is shown)

## Assumptions

Decisions taken without the product owner (non-interactive run); revisit if wrong:

1. **Sessions are not child processes of ReviewFlow.** Reviews are dispatched with `claude --bg`: the
   session process belongs to the Claude daemon, not to ReviewFlow. The authoritative list of
   sessions (with their main process id and working directory) is the Claude CLI agent listing.
   ReviewFlow sessions are recognised by their working directory being under the review worktree
   root.
2. **Per-process measures read the Linux process table** (`/proc`), the production target (Ubuntu,
   systemd). No new dependency. On another OS the per-session measures are "indisponible".
3. **Linux constants**: 100 clock ticks per second and 4096-byte memory pages (the Ubuntu x86-64 /
   arm64 defaults). A host with other values would show skewed numbers.
4. **CPU is a delta between two calls of the monitoring endpoint**, kept in server memory. The value
   reflects the interval since the last call, whoever made it (several open dashboards shorten the
   interval but stay correct).
5. **Refresh period 5 s**, aligned with the existing dashboard polling, to limit the cost of the
   Claude CLI agent listing that runs on every refresh.
6. **Session label is the worktree folder name** (e.g. `github-acme-app-1526`), which already
   carries the platform, project and request number.
7. The Monitoring view is available in English and French through the dashboard translations.

## Glossary

| Term | Definition |
|------|------------|
| Review session | A Claude background session dispatched by ReviewFlow, running inside a review worktree |
| Process tree | The main process of a session plus every process it spawned, recursively |
| Resident memory | Memory currently held in RAM by a process (RSS) |
| CPU usage | CPU time consumed between two measures / elapsed time, in % of one core |
| Supervisor | The Claude daemon that hosts background sessions, watched by ReviewFlow |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Read-only, reuses existing health data; touches no review flow |
| Negotiable | OK | Refresh period and blocks can change without rework |
| Valuable | OK | Replaces an SSH + `top` session when the server is slow |
| Estimable | OK | One endpoint, one dashboard view |
| Small | WARN | Backend + dashboard; kept small by excluding history and alerts |
| Testable | OK | Every measure is computed from injectable samples |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

Plan: [234-dashboard-monitoring-tab.plan](../plans/234-dashboard-monitoring-tab.plan.md) — Report:
[234-dashboard-monitoring-tab.report](../reports/234-dashboard-monitoring-tab.report.md)

### Endpoint

| Method | Route | Use case |
|--------|-------|----------|
| GET | `/api/monitoring` | `GetMonitoringSnapshotUseCase` |

### Artefacts (bounded context `runtime-monitoring`)

- Entities: `resourceUsage.ts` (process tree aggregation, CPU delta), `monitoringSnapshot.ts`,
  gateway contracts `ProcessTableGateway`, `ServerRuntimeGateway`, `ReviewSessionListingGateway`
- Use case: `GetMonitoringSnapshotUseCase` (keeps the previous CPU samples between calls)
- Gateways: `ProcessTableProcfsGateway` (`/proc/<pid>/stat`), `ServerRuntimeNodeGateway`
  (`process` + `os`), `ReviewSessionListingClaudeCliGateway` (`claude agents --json`, filtered on
  the review worktree root)
- Controller: `monitoringRoutes`
- Dashboard: `monitoringView.js`, `monitoringPolling.js`, `monitoringTranslations.js`, fourth view in
  `viewNavigation.js`, container and poller in `index.html`

### Decisions

- Sessions come from the Claude CLI agent listing, not from ReviewFlow child processes (see
  assumption 1); the listing gives the session main process id.
- The server status rule (`degraded` when the supervisor is down) is repeated from `/health` rather
  than shared: two lines, no helper worth extracting.
- The view reuses the existing dashboard styles (`card`, `metric-grid`, `data-table`): no new CSS.
