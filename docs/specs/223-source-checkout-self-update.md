# Update a source-checkout install from the dashboard

## Status: implemented

## Context

The dashboard's "Mettre à jour vers vX" button is inert on a source-checkout install: it only prints a
manual command to copy, and that command is Linux-only (`systemctl --user restart reviewflow-app`), so
it is unusable on macOS. A developer running ReviewFlow from a cloned repository has to leave the
dashboard and run three commands by hand every time a new version lands.

This feature makes the button actually perform the update — fetch the new code, rebuild, restart —
while refusing to run at all in any situation where doing so would break something. Every refusal is
surfaced as a readable toast, never as a silent failure.

Two of those refusals are not specific to a checkout and therefore guard **both** kinds of install: an
update triggered from another machine, and an update triggered while reviews are running. A globally
installed ReviewFlow could already be reinstalled and restarted mid-review by anyone on the network, so
the same two guards apply there — that path otherwise keeps its current behaviour.

## Rules

### Trigger and gating

- the update runs the ordered sequence **fetch the new code → rebuild → restart the server**; each
  step only runs if the previous one succeeded
- before running any step, ReviewFlow evaluates every precondition below; the **first** unmet
  precondition refuses the update and nothing is executed
- preconditions are evaluated in this fixed order, so a refusal is always reproducible:
  1. the request comes from the local machine — **both install kinds**
  2. no review is running or waiting — **both install kinds**
  3. the checkout is on the repository's default branch — source-checkout only
  4. the checkout has no uncommitted local changes — source-checkout only
  5. the tools needed to fetch and rebuild are reachable — source-checkout only
- preconditions 1 and 2 are evaluated **before** ReviewFlow decides which kind of install it is, so a
  globally installed ReviewFlow is guarded by them too; preconditions 3 to 5 only make sense for a
  checkout and are evaluated after that decision
- the update is only ever triggered from the local machine: a request arriving from any other address
  is refused, because the update executes code fetched from elsewhere and the server listens on all
  network interfaces with no authentication on its API
- an update is refused while any review is running or waiting, and the refusal states how many:
  rebuilding or reinstalling and then restarting mid-review changes the code under running jobs and
  their worktrees — this holds for a globally installed ReviewFlow just as much as for a checkout
- an update is refused when the checkout is not on the repository's default branch (`master`): a
  working branch must never be pulled and rebuilt behind the developer's back
- an update is refused when the checkout has uncommitted local changes, because fetching would either
  fail or silently mix remote code with work in progress
- the tools needed to fetch and rebuild are resolved explicitly, never assumed to be on the server's
  search path; when one cannot be found the update is refused naming the missing tool
  (a server started by the operating system's session manager inherits a minimal search path)

### Executing the sequence

- fetching succeeds without bringing any new commit → the update **continues** to rebuild and restart:
  the local code may already be current while the running server still serves a stale build
- fetching fails (conflict, no remote branch configured, network error) → the update stops, the
  rebuild and the restart never run, and the failure reason is reported
- the rebuild fails → the restart **never** runs and the server keeps serving the previous working
  build; a broken build must never be promoted
- the restart only happens after a successful rebuild
- after the restart, the server remains controllable by the stop and status commands — its recorded
  process identity is written again, so a restarted server is never left orphaned
- the same guarantee applies to the existing global-install update path, which shares the restart

### Reporting to the user

- every refusal and every failure produces a toast carrying the actual reason; a generic
  "update failed" message is never shown in place of a known reason
- a refusal travels as a **structured motive** (an identifier plus whatever the message needs, such as
  the number of running reviews or the name of the missing tool), never as a ready-made sentence: the
  dashboard is bilingual, so the wording is resolved at display time and exists in both languages
- a failure reported by an external tool also carries that tool's own detail, which is passed through
  as-is and is not translated
- after a refusal or a failure, the button returns to its normal clickable state — the user can act on
  the reason and retry
- while the sequence runs, the button is disabled and states that an update is in progress; it does not
  announce which individual step is running, since the whole sequence is one call
- once the server is back up, the dashboard reloads so the new version is displayed
- a global-install update keeps its current behaviour apart from the two shared preconditions and the
  shared restart guarantee

## Scenarios

- nominal: {local request, no review, on `master`, clean checkout, tools reachable, remote has new
  commits} → fetch then rebuild then restart + process identity rewritten + dashboard reloads on the
  restarted server
- already current: {all preconditions met, fetch brings no new commit} → rebuild and restart run all
  the same + dashboard reloads
- remote request: {request from another machine on the network} → reject "Mise à jour autorisée
  uniquement depuis la machine locale" + toast + nothing executed
- review running: {one review running, one waiting} → reject "2 reviews en cours. Réessayez une fois
  les reviews terminées." + toast + nothing executed
- wrong branch: {on `feat/223-source-checkout-self-update`} → reject "Mise à jour possible uniquement
  depuis la branche master" + toast + nothing executed
- dirty checkout: {uncommitted local changes} → reject "Des modifications locales ne sont pas validées.
  Mise à jour impossible." + toast + nothing executed
- missing tool: {rebuild tool not on the server's search path} → reject "Commande yarn introuvable"
  + toast + nothing executed
- fetch conflict: {preconditions met, fetch fails on a conflict} → reject "La récupération des
  modifications a échoué" with the reported detail + toast + no rebuild + no restart
- no remote branch: {preconditions met, no remote branch configured} → reject "La récupération des
  modifications a échoué" with the reported detail + toast + no rebuild + no restart
- rebuild fails: {fetch succeeds, rebuild exits non-zero} → reject "La compilation a échoué. Le serveur
  continue de tourner sur la version précédente." + toast + no restart + server still answering
- restarted server is controllable: {update completes} → status command reports the server running with
  its new process identity + stop command shuts it down
- global install, nothing running: {install is a global package, local request, no review} → existing
  global update path runs, unchanged, then restarts with its process identity rewritten
- global install, review running: {install is a global package, local request, one review running} →
  reject "1 review en cours. Réessayez une fois les reviews terminées." + toast + no reinstall + no
  restart
- global install, remote request: {install is a global package, request from another machine} → reject
  "Mise à jour autorisée uniquement depuis la machine locale" + toast + nothing executed
- refusal wording in English: {dashboard language is English, review running} → the toast shows the
  English wording of the same motive, with the same count

## Out of Scope

- Changing the global-install update path beyond the shared restart fix and the two shared
  preconditions (local machine, no running review)
- Authenticating the dashboard API in general (only this operation is restricted to the local machine;
  every other write route stays as it is today and is tracked separately)
- Binding the server to the loopback interface instead of all interfaces
- Updating a checkout that is on a branch other than the default one
- Stashing, committing or discarding uncommitted local changes on the user's behalf
- Waiting for running reviews to finish and then updating (refusal only, no deferred update)
- Rolling back to the previous build when the new one starts but misbehaves
- Installing or repairing missing tools
- Updating dependencies (`yarn install`) as part of the sequence
- A progress log or streamed output of the rebuild in the dashboard

## Glossary

| Term | Definition |
|------|------------|
| source-checkout install | A ReviewFlow whose code lives in a cloned repository, detected by the presence of version-control metadata above the running code — as opposed to a globally installed package |
| precondition | A condition checked before the update starts; the first unmet one refuses the whole update and executes nothing |
| default branch | The repository's main line of development (`master`), the only branch from which an update is allowed |
| clean checkout | A checkout with no uncommitted local changes |
| local machine | The machine running the server itself, as opposed to any other address on the network |
| process identity | The recorded identity of the running server that the stop and status commands rely on to find it |
| structured motive | A refusal expressed as an identifier plus its data (a count, a tool name), so the dashboard can word it in either language instead of displaying a sentence built by the server |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | The restart fix is included here, so there is no blocking dependency on a separate bug fix |
| Negotiable | OK | How preconditions are checked and how the sequence is executed is left to implementation |
| Valuable | WARN | Only benefits source-checkout installs, i.e. developers of ReviewFlow itself — users on a global install already have a working button. Accepted deliberately: it removes a three-command manual loop repeated on every release |
| Estimable | OK | 5 preconditions, 3 sequence steps, 1 restart fix, dashboard states and translated motives |
| Small | WARN | ~24 files including tests (measured during planning, not estimated). Delivered in 3 ordered iterations: preconditions and dispatch first with zero I/O, then the execution gateways and the restart fix, then the dashboard. Shipping the sequence without its preconditions would expose an unauthenticated remote code execution, so that boundary is not negotiable |
| Testable | OK | Each rule maps to at least one scenario; every refusal has its own scenario and message |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity (new)**: `entities/selfUpdateSequence/localOrigin.ts` — `isLocalOrigin(ip)`. Reuses
  `isIpInCidr` for `127.0.0.0/8` and matches `::1` / `::ffff:127.0.0.1` explicitly, because
  `isIpInCidr` is IPv4-only and macOS resolves `localhost` to IPv6 more often than not.
- **Entity (new)**: `entities/selfUpdateSequence/selfUpdateRefusalMotive.ts` — the structured motive as a
  union discriminated on `kind`, 7 variants, each carrying exactly its own data and no optional field.
- **Gateway contracts (new)**: `entities/selfUpdateSequence/queueActivity.gateway.ts`
  (`countActiveOrWaiting`) and `entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.ts`
  (`getCurrentBranch`, `hasUncommittedChanges`, `resolveToolPath`, `fetchLatest`, `rebuild`).
- **Entity (modified)**: `packageVersion.ts` — gained `{ status: 'refused'; motive }`, lost
  `{ status: 'source-checkout'; manualCommand }`.
- **Use case (new)**: `runSourceCheckoutSelfUpdate.usecase.ts` — preconditions 3 to 5 then fetch then
  rebuild, each step short-circuiting.
- **Use case (modified)**: `triggerSelfUpdate.usecase.ts` — evaluates preconditions 1 and 2 for both
  install kinds **before** `installTypeDetector.detect()`, then dispatches.
- **Gateways (new)**: `queueActivity.pQueue.gateway.ts` (wraps `getQueueStats`, the only consumer of that
  framework module outside `health.routes.ts`) and `sourceCheckoutUpdate.cli.gateway.ts` (injectable
  checkout path and command runner, so no test touches the real repository or runs a real git/yarn).
- **Gateway (fixed)**: `selfUpdate.cli.gateway.ts` — argument building extracted into the exported pure
  `buildRestartArgs(port)`, which now includes `--daemon`. Both restart paths share it.
- **Controller (modified)**: `version.routes.ts` — forwards `request.ip` as `requestOrigin`, takes the two
  new gateways, drops the `'source-checkout'` response branch, maps `'refused'` to HTTP 200.
- **Views (modified)**: `versionUpdate.js` — single unified button, `setVersionCheckState` now restores the
  button on any non-running state, and the new pure `resolveRefusalWording(motive, translate)` words each
  motive. `index.html` — explicit `'refused'` branch before the generic fallback, dead
  `showSourceCheckoutUpdate` removed. `i18n.js` — 7 `version.refusal.*` keys in `en` and `fr`, 2 dead
  `sourceCheckout*` keys removed.
- **Wiring**: `main/routes.ts` instantiates and injects both new gateways.

### Endpoints

| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/version/update` | `triggerSelfUpdate` — 200 on `started` / `refused`, 403 on `permission-denied`, 500 on `failed` |

### Decisions

- Preconditions 1 and 2 sit in the dispatcher rather than in the source-checkout use case, so a globally
  installed ReviewFlow is guarded by them too. `npm update -g` followed by a restart was previously
  reachable from any machine on the network and during a running review.
- A refusal carries a structured motive instead of a ready-made sentence: the dashboard is bilingual, and
  a server-built French string would have leaked into the English UI. An external tool's own output
  (`fetch-failed`) is the one thing passed through untranslated.
- The second dashboard button was removed rather than kept in sync. `fetchStatus()` re-rendered the area
  every few seconds without `installType`, so the source-checkout branch only survived until the next
  poll — the branch was already effectively dead.
- `'refused'` maps to HTTP 200: a refused update is a well-formed business outcome, not a server error.
- The restart fix is verified at the argument level (`buildRestartArgs` includes `--daemon`), not by
  spawning a real process. A process-level test would be slow and platform-sensitive, and the existing
  `StartDaemonUseCase` already covers writing the pid file once that flag is present.

Full report: [docs/reports/223-source-checkout-self-update.report.md](../reports/223-source-checkout-self-update.report.md).
